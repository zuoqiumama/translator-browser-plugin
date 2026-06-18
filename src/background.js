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

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || msg.type !== 'tc-translate-multi') return false;

  (async () => {
    const text = (msg.text || '').trim();
    if (!text) {
      sendResponse({ error: '没有可翻译的文字' });
      return;
    }
    const settings = await tcGetSettings();
    const target = msg.target || settings.targetLang;
    const providers =
      Array.isArray(msg.providers) && msg.providers.length ? msg.providers : [settings.provider];

    // Run every engine in parallel and isolate failures so each row resolves on
    // its own — a slow or erroring engine never blocks the others. The shared
    // tcTranslate cache means repeats (and the hover-prefetch) are free here too.
    const results = await Promise.all(
      providers.map(async (provider) => {
        const t0 = Date.now();
        try {
          const r = await tcWithTimeout(
            tcTranslate(text, target, { ...settings, provider }, msg.context),
            8000,
          );
          return {
            provider,
            text: r.text,
            detected: r.detected || '',
            cached: !!r.cached,
            ms: Date.now() - t0,
          };
        } catch (err) {
          return { provider, error: (err && err.message) || '翻译失败', ms: Date.now() - t0 };
        }
      }),
    );
    sendResponse({ results, target });
  })();

  return true;
});

// --- Streaming AI explanation (long-lived port) --------------------------

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'tc-explain') return;
  port.onMessage.addListener(async (msg) => {
    if (!msg || msg.type !== 'explain') return;
    const text = (msg.text || '').trim();
    if (!text) {
      try { port.postMessage({ type: 'error', error: '没有可解释的文字' }); } catch (_) {}
      return;
    }
    try {
      const settings = await tcGetSettings();
      const target = msg.target || settings.targetLang;
      await tcExplainStream(text, target, settings, msg.context, (delta) => {
        try { port.postMessage({ type: 'delta', delta }); } catch (_) {}
      });
      try { port.postMessage({ type: 'done' }); } catch (_) {}
    } catch (err) {
      try { port.postMessage({ type: 'error', error: (err && err.message) || '解释失败' }); } catch (_) {}
    }
  });
});

// --- Warm-up -------------------------------------------------------------

// Fetch the Microsoft auth token ahead of time so the first translation skips
// the extra auth round-trip. Best-effort; failures are retried lazily on use.
function tcPrewarm() {
  if (typeof tcBingAuth === 'function') tcBingAuth().catch(() => {});
}
chrome.runtime.onStartup.addListener(tcPrewarm);
chrome.runtime.onInstalled.addListener(tcPrewarm);
