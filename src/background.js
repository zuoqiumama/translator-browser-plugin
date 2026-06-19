/*
 * background.js — MV3 service worker (classic).
 *
 * Responsibilities:
 *   1. Run translation network requests on behalf of the content script.
 *   2. Provide a right-click context-menu entry.
 *   3. Handle the keyboard command (Alt+T) to translate the current selection.
 */

importScripts('data.js', 'cache.js', 'translators.js');

const CONTEXT_MENU_ID = 'tc-translate-selection';

// --- Context menu --------------------------------------------------------

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: CONTEXT_MENU_ID,
    title: '翻译选中文字',
    contexts: ['selection'],
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === CONTEXT_MENU_ID && tab && tab.id != null) {
    chrome.tabs.sendMessage(tab.id, { type: 'tc-translate-selection' }).catch(() => {
      /* content script not present on this page (e.g. chrome:// pages) */
    });
  }
});

// --- Keyboard command ----------------------------------------------------

chrome.commands.onCommand.addListener((command) => {
  if (command !== 'translate-selection') return;
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs && tabs[0];
    if (tab && tab.id != null) {
      chrome.tabs.sendMessage(tab.id, { type: 'tc-translate-selection' }).catch(() => {});
    }
  });
});

// --- Translation requests from content scripts ---------------------------

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || msg.type !== 'tc-translate') return false;

  (async () => {
    const text = (msg.text || '').trim();
    if (!text) {
      sendResponse({ error: '没有可翻译的文字' });
      return;
    }
    try {
      const settings = await tcGetSettings();
      const target = msg.target || settings.targetLang;
      // The hover lens forces a fast/free engine via msg.provider; selection
      // translation uses the configured one.
      const provider = msg.provider || settings.provider;
      const result = await tcTranslate(text, target, { ...settings, provider }, msg.context);
      sendResponse({ ...result, target });
    } catch (err) {
      sendResponse({ error: (err && err.message) || '翻译失败' });
    }
  })();

  return true; // keep the message channel open for the async sendResponse
});

// --- Multi-engine compare ------------------------------------------------

/** Reject if `promise` doesn't settle within `ms`, so one slow engine can't hang the card. */
function tcWithTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('超时')), ms)),
  ]);
}

function tcPostSafe(port, m) {
  try { port.postMessage(m); } catch (_) { /* port already closed */ }
}

// Translate one engine's row and post its lifecycle events to the compare port.
// Free engines resolve in one shot under an 8s cap; the LLM streams under a
// FIRST-TOKEN watchdog so a slow-but-working model fills in live instead of
// failing the whole engine at 8s — only a genuinely stuck connection ends 超时.
async function compareRow(port, portSignal, provider, text, target, settings, context) {
  const t0 = Date.now();
  let timedOut = false;
  try {
    if (provider === 'openai') {
      const rowCtrl = new AbortController();
      const onAbort = () => rowCtrl.abort();
      if (portSignal.aborted) rowCtrl.abort();
      else portSignal.addEventListener('abort', onAbort, { once: true });
      let first = false;
      const watchdog = setTimeout(() => { if (!first) { timedOut = true; rowCtrl.abort(); } }, 15000);
      try {
        const r = await tcTranslateStream(text, target, settings, context, (delta) => {
          if (!first) { first = true; clearTimeout(watchdog); }
          tcPostSafe(port, { type: 'row-delta', provider, delta });
        }, rowCtrl.signal);
        tcPostSafe(port, {
          type: 'row-done', provider, text: r.text,
          detected: r.detected || '', cached: !!r.cached, ms: Date.now() - t0,
        });
      } finally {
        clearTimeout(watchdog);
        portSignal.removeEventListener('abort', onAbort);
      }
    } else {
      const r = await tcWithTimeout(tcTranslate(text, target, { ...settings, provider }, context), 8000);
      tcPostSafe(port, {
        type: 'row-done', provider, text: r.text,
        detected: r.detected || '', cached: !!r.cached, ms: Date.now() - t0,
      });
    }
  } catch (err) {
    if (portSignal.aborted) return; // card closed / re-translated — stay silent
    const error = timedOut ? '超时' : (err && err.message) || '翻译失败';
    tcPostSafe(port, { type: 'row-error', provider, error, ms: Date.now() - t0 });
  }
}

// Compare runs over a long-lived port so each row renders the instant it settles
// (no Promise.all barrier delaying the fast engines) and the LLM row can stream.
// Disconnecting the port aborts every in-flight row.
function handleComparePort(port) {
  const ctrl = new AbortController();
  let active = false;
  port.onDisconnect.addListener(() => ctrl.abort());
  port.onMessage.addListener(async (msg) => {
    if (!msg || msg.type !== 'compare' || active) return;
    active = true;
    const text = (msg.text || '').trim();
    if (!text) { tcPostSafe(port, { type: 'all-done' }); return; }
    const settings = await tcGetSettings();
    const target = msg.target || settings.targetLang;
    const providers =
      Array.isArray(msg.providers) && msg.providers.length ? msg.providers : [settings.provider];

    await Promise.all(
      providers.map((p) => compareRow(port, ctrl.signal, p, text, target, settings, msg.context)),
    );
    if (!ctrl.signal.aborted) tcPostSafe(port, { type: 'all-done' });
  });
}

// --- Streaming LLM over long-lived ports ---------------------------------

// Streaming translation ('tc-translate-stream') and AI explanation
// ('tc-explain') share one handler. A long-lived port keeps the MV3 worker
// alive for the whole stream, and an AbortController tied to the port cancels
// the in-flight model request the instant the port disconnects — i.e. when the
// user closes the card, switches language, or makes a newer selection — so a
// slow request never wastes tokens or lands a stale result.
chrome.runtime.onConnect.addListener((port) => {
  if (port.name === 'tc-explain') return handleStreamPort(port, 'explain');
  if (port.name === 'tc-translate-stream') return handleStreamPort(port, 'translate');
  if (port.name === 'tc-compare-stream') return handleComparePort(port);
});

function handleStreamPort(port, op) {
  const ctrl = new AbortController();
  let active = false; // one request per port
  port.onDisconnect.addListener(() => ctrl.abort());
  port.onMessage.addListener(async (msg) => {
    if (!msg || msg.type !== op || active) return; // op is 'translate' | 'explain'
    active = true;
    const text = (msg.text || '').trim();
    if (!text) {
      try { port.postMessage({ type: 'error', error: '没有可处理的文字' }); } catch (_) {}
      return;
    }
    const send = (delta) => { try { port.postMessage({ type: 'delta', delta }); } catch (_) {} };
    try {
      const settings = await tcGetSettings();
      const target = msg.target || settings.targetLang;
      if (op === 'translate') {
        const r = await tcTranslateStream(text, target, settings, msg.context, send, ctrl.signal);
        try {
          port.postMessage({
            type: 'done',
            text: r.text,
            detected: r.detected || '',
            provider: r.provider || 'openai',
            cached: !!r.cached,
          });
        } catch (_) {}
      } else {
        await tcExplainStream(text, target, settings, msg.context, send, ctrl.signal);
        try { port.postMessage({ type: 'done' }); } catch (_) {}
      }
    } catch (err) {
      if (ctrl.signal.aborted) return; // user cancelled — stay silent
      try { port.postMessage({ type: 'error', error: (err && err.message) || '处理失败' }); } catch (_) {}
    }
  });
}

// --- Warm-up -------------------------------------------------------------

// Fetch the Microsoft auth token ahead of time so the first translation skips
// the extra auth round-trip. Best-effort; failures are retried lazily on use.
function tcPrewarm() {
  if (typeof tcBingAuth === 'function') tcBingAuth().catch(() => {});
}
chrome.runtime.onStartup.addListener(tcPrewarm);
chrome.runtime.onInstalled.addListener(tcPrewarm);
