/*
 * content.js — runs on every page.
 *
 * Watches text selection, shows a small trigger button at the END of the
 * selection, and renders draggable translation cards inside a Shadow DOM so the
 * host page's CSS cannot interfere. One reusable "active" card is replaced by
 * each new selection; pinning a card keeps it so new selections open fresh
 * cards. All network work is delegated to the service worker via messaging.
 *
 * Depends on globals from data.js (TC_LANGUAGES, TC_DEFAULTS, tcGetSettings)
 * and content-styles.js (TC_CSS), which are listed before this file in the
 * manifest's content_scripts and therefore share this isolated-world scope.
 */
(function () {
  'use strict';

  let settings = { ...TC_DEFAULTS };

  // Shadow DOM infrastructure (created lazily on first use).
  let host = null;
  let shadow = null;
  let root = null;

  let triggerEl = null;
  // `activeCard` is the single un-pinned card that new selections reuse.
  // Pinned cards (card._pinned === true) stay until closed; all live in `cards`.
  let activeCard = null;
  const cards = new Set();
  let openMenuCard = null; // the card whose overflow "⋯" menu is currently open
  let lastSelection = null; // { text, rect, endRect, context }

  // Hover reading lens state.
  let lensEl = null;
  let lensBlock = null;
  let lensTimer = null;
  let isMouseDown = false;
  const lensCache = new Map(); // key: `${target}|${text}` -> translation

  // Line icons (Lucide-style), kept as inline SVG for a consistent, premium look.
  const svg = (paths, size = 16) =>
    `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" ` +
    `stroke="currentColor" stroke-width="2" stroke-linecap="round" ` +
    `stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
  const ICONS = {
    lang: '<path d="m5 8 6 6"/><path d="m4 14 6-6 2-3"/><path d="M2 5h12"/><path d="M7 2h1"/><path d="m22 22-5-10-5 10"/><path d="M14 18h6"/>',
    speak: '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>',
    copy: '<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    pin: '<path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/>',
    close: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    compare: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M12 3v18"/>',
    save: '<path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>',
    explain: '<path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .962 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.962 0z"/><path d="M20 3v4"/><path d="M22 5h-4"/><path d="M4 17v2"/><path d="M5 18H3"/>',
    more: '<circle cx="5" cy="12" r="1.6" fill="currentColor"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/><circle cx="19" cy="12" r="1.6" fill="currentColor"/>',
  };

  const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);

  // --- Shadow DOM setup --------------------------------------------------

  function ensureShadow() {
    if (shadow) return;
    host = document.createElement('div');
    host.id = 'tc-shadow-host';
    host.style.cssText =
      'all: initial; position: fixed; top: 0; left: 0; width: 0; height: 0; ' +
      'z-index: 2147483647; pointer-events: none;';
    (document.documentElement || document.body).appendChild(host);

    shadow = host.attachShadow({ mode: 'open' });
    injectStyles(shadow);

    root = document.createElement('div');
    root.className = 'tc-root';
    root.style.pointerEvents = 'none';
    shadow.appendChild(root);
    applyTheme();
  }

  function injectStyles(shadowRoot) {
    // adoptedStyleSheets bypasses the page's CSP style-src; fall back to <style>.
    try {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(TC_CSS);
      shadowRoot.adoptedStyleSheets = [sheet];
    } catch (_) {
      const style = document.createElement('style');
      style.textContent = TC_CSS;
      shadowRoot.appendChild(style);
    }
  }

  // --- Theme -------------------------------------------------------------

  function resolveTheme() {
    if (settings.theme === 'light' || settings.theme === 'dark') return settings.theme;
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';
  }

  function applyTheme() {
    if (root) root.setAttribute('data-theme', resolveTheme());
  }

  // --- Selection ---------------------------------------------------------

  function getSelectionInfo() {
    const ae = document.activeElement;
    if (ae && (ae.tagName === 'TEXTAREA' ||
        (ae.tagName === 'INPUT' && /^(text|search|url|email|tel|password|number)$/i.test(ae.type)))) {
      const { selectionStart, selectionEnd } = ae;
      if (selectionStart != null && selectionEnd != null && selectionEnd > selectionStart) {
        const full = String(ae.value);
        const text = full.substring(selectionStart, selectionEnd).trim();
        if (text) {
          const rect = ae.getBoundingClientRect();
          return { text, rect, endRect: rect, context: windowContext(full, text) };
        }
      }
    }
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && !sel.isCollapsed) {
      const text = sel.toString().trim();
      if (text) {
        const range = sel.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        // The last client rect is the last visual line — anchor the button there.
        const rects = range.getClientRects();
        const endRect = rects.length ? rects[rects.length - 1] : rect;
        if (rect && (rect.width || rect.height)) {
          return { text, rect, endRect, context: getRangeContext(range, text) };
        }
      }
    }
    return null;
  }

  // Build a bounded context window around the selection from its containing block.
  function getRangeContext(range, selText) {
    let node = range.commonAncestorContainer;
    let block = node.nodeType === 3 ? node.parentElement : node;
    while (block && block !== document.body) {
      const disp = getComputedStyle(block).display;
      const len = (block.textContent || '').trim().length;
      if ((disp === 'block' || disp === 'list-item' || disp === 'table-cell') &&
          len > selText.length) {
        break;
      }
      block = block.parentElement;
    }
    const full = ((block && block.textContent) || '').replace(/\s+/g, ' ').trim();
    return windowContext(full, selText);
  }

  // Keep ~800 chars centered on the selection so we don't blow up token usage.
  function windowContext(full, selText) {
    const cap = 800;
    if (!full || full.length <= cap) return full;
    const needle = selText.replace(/\s+/g, ' ').trim();
    const idx = full.indexOf(needle);
    if (idx < 0) return full.slice(0, cap);
    const start = Math.max(0, idx - Math.floor((cap - needle.length) / 2));
    return full.slice(start, start + cap);
  }

  // --- Trigger button (placed at the end of the selection) ---------------

  function removeTrigger() {
    if (triggerEl) {
      triggerEl.remove();
      triggerEl = null;
    }
  }

  function showTrigger(info) {
    ensureShadow();
    removeTrigger();
    triggerEl = document.createElement('div');
    triggerEl.className = 'tc-trigger';
    triggerEl.innerHTML = svg(ICONS.lang, 17);
    triggerEl.title = '翻译选中文字 (Alt+T)';

    const er = info.endRect || info.rect;
    const size = 30;
    const gap = 6;
    // Sit just after the last character, vertically centered on that line.
    let left = er.right + gap;
    let top = er.top + er.height / 2 - size / 2;
    // If there's no room to the right, drop just below the end of the line.
    if (left + size > window.innerWidth - 6) {
      left = clamp(er.right - size, 6, window.innerWidth - size - 6);
      top = er.bottom + gap;
    }
    top = clamp(top, 6, window.innerHeight - size - 6);
    left = clamp(left, 6, window.innerWidth - size - 6);
    triggerEl.style.left = left + 'px';
    triggerEl.style.top = top + 'px';

    // The moment the cursor aims at the button, translate in the background so
    // the result is cache-warm and the click feels instant (free engines only).
    triggerEl.addEventListener('mouseenter', () => prefetchSelection(info));
    // Keep the selection alive when interacting with the button.
    triggerEl.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
    });
    triggerEl.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const info2 = lastSelection;
      removeTrigger();
      if (info2) openCard(info2);
    });
    root.appendChild(triggerEl);
  }

  // Pre-warm the worker cache for the current selection. Aiming the cursor at
  // the trigger button is a deliberate intent, so the LLM is warmed here too —
  // the slow engine benefits most, and the cached result makes the click feel
  // instant. DeepL stays excluded: it's already fast and purely paid, so a hover
  // shouldn't spend its quota. (The trigger only exists in 'button' mode, so this
  // never fires on a bare text selection.)
  function prefetchSelection(info) {
    const p = settings.provider;
    if (p !== 'bing' && p !== 'google' && p !== 'openai') return;
    chrome.runtime
      .sendMessage({
        type: 'tc-translate',
        text: info.text,
        target: settings.targetLang,
        context: settings.contextAware ? info.context : undefined,
      })
      .catch(() => {});
  }

  // --- Card --------------------------------------------------------------

  function createCardElement() {
    const el = document.createElement('div');
    el.className = 'tc-card';
    el.innerHTML = `
      <div class="tc-head">
        <select class="tc-lang" title="目标语言"></select>
        <div class="tc-actions">
          <button class="tc-iconbtn tc-explainbtn" title="AI 解释（词义 / 语法 / 例句）">${svg(ICONS.explain)}</button>
          <button class="tc-iconbtn tc-copy" title="复制译文">${svg(ICONS.copy)}</button>
          <button class="tc-iconbtn tc-pin" title="钉住卡片">${svg(ICONS.pin)}</button>
          <button class="tc-iconbtn tc-more" title="更多操作">${svg(ICONS.more)}</button>
          <button class="tc-iconbtn tc-close" title="关闭">${svg(ICONS.close)}</button>
        </div>
      </div>
      <div class="tc-body">
        <div class="tc-result"></div>
        <div class="tc-original" hidden></div>
        <div class="tc-explain" hidden></div>
      </div>`;

    const select = el.querySelector('.tc-lang');
    for (const lang of TC_LANGUAGES) {
      const opt = document.createElement('option');
      opt.value = lang.code;
      opt.textContent = lang.name;
      select.appendChild(opt);
    }
    select.value = settings.targetLang;
    return el;
  }

  function wireCard(el) {
    const select = el.querySelector('.tc-lang');
    select.addEventListener('change', () => {
      el._target = select.value;
      chrome.storage.sync.set({ targetLang: select.value }); // remember for next time
      refreshCard(el);
    });
    el.querySelector('.tc-explainbtn').addEventListener('click', () => toggleExplain(el));
    el.querySelector('.tc-copy').addEventListener('click', () => copyResult(el));
    el.querySelector('.tc-pin').addEventListener('click', () => togglePin(el));
    el.querySelector('.tc-more').addEventListener('click', () => toggleMenu(el));
    el.querySelector('.tc-close').addEventListener('click', () => closeCard(el));
    buildMenu(el);
    enableDrag(el);
  }

  // Build the overflow "⋯" menu of secondary actions and append it to the shadow
  // root (NOT inside the card, whose overflow:hidden would clip it). State classes
  // live on the items, so existing toggle handlers keep working via cardBtn().
  function buildMenu(el) {
    const menu = document.createElement('div');
    menu.className = 'tc-menu';
    menu.hidden = true;
    menu.innerHTML = `
      <button class="tc-menuitem tc-save">${svg(ICONS.save)}<span>收藏到生词本</span></button>
      <button class="tc-menuitem tc-compare">${svg(ICONS.compare)}<span>多引擎对照</span></button>
      <button class="tc-menuitem tc-speak">${svg(ICONS.speak)}<span>朗读译文</span></button>`;
    menu.querySelector('.tc-save').addEventListener('click', () => { toggleSave(el); closeMenu(el); });
    menu.querySelector('.tc-compare').addEventListener('click', () => { toggleCompare(el); closeMenu(el); });
    menu.querySelector('.tc-speak').addEventListener('click', () => { speak(el); closeMenu(el); });
    if (!settings.enableTTS) menu.querySelector('.tc-speak').style.display = 'none';
    root.appendChild(menu);
    el._menuEl = menu;
  }

  // Find an action button whether it lives in the header or the overflow menu.
  function cardBtn(el, cls) {
    return el.querySelector('.' + cls) || (el._menuEl && el._menuEl.querySelector('.' + cls)) || null;
  }

  function toggleMenu(el) {
    if (el._menuOpen) closeMenu(el);
    else openMenu(el);
  }

  function openMenu(el) {
    if (openMenuCard && openMenuCard !== el) closeMenu(openMenuCard);
    const menu = el._menuEl;
    const moreBtn = el.querySelector('.tc-more');
    if (!menu || !moreBtn) return;
    menu.hidden = false; // unhide before measuring
    const r = moreBtn.getBoundingClientRect();
    const mw = menu.offsetWidth || 184;
    const mh = menu.offsetHeight || 184;
    menu.style.left = clamp(r.right - mw, 6, window.innerWidth - mw - 6) + 'px';
    menu.style.top = clamp(r.bottom + 6, 6, window.innerHeight - mh - 6) + 'px';
    el._menuOpen = true;
    openMenuCard = el;
    // Defer so the click that opened the menu doesn't immediately close it.
    setTimeout(() => document.addEventListener('mousedown', onMenuOutside, true), 0);
  }

  function closeMenu(el) {
    if (el && el._menuEl) el._menuEl.hidden = true;
    if (el) el._menuOpen = false;
    if (openMenuCard === el) openMenuCard = null;
    document.removeEventListener('mousedown', onMenuOutside, true);
  }

  // Close on any click that isn't on the menu or its trigger. composedPath()
  // reveals the real target even across the shadow-DOM boundary.
  function onMenuOutside(e) {
    if (!openMenuCard) return;
    const menu = openMenuCard._menuEl;
    const moreBtn = openMenuCard.querySelector('.tc-more');
    const path = (e.composedPath && e.composedPath()) || [];
    if ((menu && path.includes(menu)) || (moreBtn && path.includes(moreBtn))) return;
    closeMenu(openMenuCard);
  }

  // Toggle this card between single-engine and side-by-side multi-engine compare.
  function toggleCompare(el) {
    el._compare = !el._compare;
    const btn = cardBtn(el, 'tc-compare');
    if (btn) {
      btn.classList.toggle('tc-active', el._compare);
      const label = btn.querySelector('span');
      if (label) label.textContent = el._compare ? '关闭对照' : '多引擎对照';
    }
    refreshCard(el);
  }

  // Save (or un-save) the current translation to the 生词本 (vocabulary book).
  async function toggleSave(el) {
    if (!el._result) return; // nothing translated yet
    if (await tcVocabHas(el._text, el._target)) {
      await tcVocabRemoveEntry(el._text, el._target);
    } else {
      await tcVocabAdd({
        text: el._text,
        translation: el._result,
        target: el._target,
        source: el._detected || '',
        provider: el._provider || '',
        context: el._context || '',
        url: location.href,
        title: document.title,
      });
    }
    updateSaveState(el);
  }

  // Reflect whether this (text, target) is saved on the 收藏 menu item.
  function updateSaveState(el) {
    const btn = cardBtn(el, 'tc-save');
    if (!btn) return;
    tcVocabHas(el._text, el._target)
      .then((saved) => {
        btn.classList.toggle('tc-saved', saved);
        const label = btn.querySelector('span');
        if (label) label.textContent = saved ? '已在生词本（移出）' : '收藏到生词本';
        btn.title = saved ? '已收藏（点按移出生词本）' : '收藏到生词本';
      })
      .catch(() => {});
  }

  // --- AI explanation (streamed over a Port) -----------------------------

  // Usable only with an OpenAI-compatible endpoint: a key, or a local endpoint.
  function llmConfigured() {
    if ((settings.openaiKey || '').trim()) return true;
    return /\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])/.test(settings.openaiBaseUrl || '');
  }

  function setExplainActive(el, on) {
    const btn = el.querySelector('.tc-explainbtn');
    if (btn) btn.classList.toggle('tc-active', on);
  }

  // Tear down any explanation state (called whenever the card re-translates).
  function resetExplain(el) {
    const panel = el.querySelector('.tc-explain');
    if (panel) {
      panel.hidden = true;
      panel.classList.remove('tc-explain-loading', 'tc-error');
      panel.textContent = '';
    }
    el._explainOpen = false;
    el._explainDone = false;
    el._explainText = '';
    if (el._explainPort) {
      try { el._explainPort.disconnect(); } catch (_) { /* ignore */ }
      el._explainPort = null;
    }
    setExplainActive(el, false);
  }

  function toggleExplain(el) {
    if (el._explainOpen) {
      el.querySelector('.tc-explain').hidden = true;
      el._explainOpen = false;
      setExplainActive(el, false);
    } else {
      doExplain(el);
    }
  }

  function doExplain(el) {
    const panel = el.querySelector('.tc-explain');
    panel.hidden = false;
    el._explainOpen = true;
    setExplainActive(el, true);
    if (el._explainDone) return; // already streamed once — just re-show it

    if (!llmConfigured()) {
      panel.classList.remove('tc-explain-loading');
      panel.classList.add('tc-error');
      panel.textContent =
        '请先在选项页配置「大模型 / OpenAI 兼容接口」（填 API Key 或本地接口），再使用 AI 解释。';
      el._explainDone = true;
      return;
    }

    panel.classList.remove('tc-error');
    panel.classList.add('tc-explain-loading');
    panel.textContent = '';
    el._explainText = '';

    let port;
    try {
      port = chrome.runtime.connect({ name: 'tc-explain' });
    } catch (_) {
      panel.classList.remove('tc-explain-loading');
      panel.classList.add('tc-error');
      panel.textContent = '无法连接扩展后台，请刷新页面后重试。';
      el._explainDone = true;
      return;
    }
    el._explainPort = port;

    port.onMessage.addListener((m) => {
      if (!m) return;
      if (m.type === 'delta') {
        el._explainText += m.delta;
        panel.textContent = el._explainText;
      } else if (m.type === 'done') {
        panel.classList.remove('tc-explain-loading');
        if (!el._explainText) panel.textContent = '（未获得解释内容）';
        el._explainDone = true;
        el._explainPort = null;
        try { port.disconnect(); } catch (_) { /* ignore */ }
      } else if (m.type === 'error') {
        panel.classList.remove('tc-explain-loading');
        if (!el._explainText) {
          panel.classList.add('tc-error');
          panel.textContent = '解释失败：' + m.error;
        }
        el._explainDone = true;
        el._explainPort = null;
        try { port.disconnect(); } catch (_) { /* ignore */ }
      }
    });
    port.onDisconnect.addListener(() => {
      panel.classList.remove('tc-explain-loading');
      el._explainPort = null;
    });

    // Always send context for explanation (disambiguates meaning), independent
    // of the translation-time contextAware toggle.
    port.postMessage({
      type: 'explain',
      text: el._text,
      target: el._target,
      context: el._context || '',
    });
  }

  // Pin = keep this card on the page; the reusable "active" slot is freed so the
  // next selection opens a NEW card. Un-pin makes it the reusable card again.
  function togglePin(el) {
    el._pinned = !el._pinned;
    const btn = cardBtn(el, 'tc-pin');
    if (btn) {
      btn.classList.toggle('tc-pinned', el._pinned);
      btn.title = el._pinned ? '取消钉住' : '钉住卡片'; // icon-only header button
      const label = btn.querySelector('span'); // (no label on the header button)
      if (label) label.textContent = el._pinned ? '取消钉住' : '钉住卡片';
    }
    if (el._pinned) {
      if (activeCard === el) activeCard = null;
    } else {
      if (activeCard && activeCard !== el) closeCard(activeCard); // keep ≤1 un-pinned
      activeCard = el;
    }
  }

  function positionCard(el, rect, isNew) {
    // Once the user has dragged it, leave it where they put it.
    if (el._userMoved) return;
    const margin = 8;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const cw = Math.min(360, vw - 24);
    el.style.width = cw + 'px';

    // Measure off-screen first so we can flip/clamp using the real height.
    el.style.left = '-9999px';
    el.style.top = '0px';
    const ch = el.offsetHeight || 160;

    let left = clamp(rect.left, margin, vw - cw - margin);
    let top = rect.bottom + margin;
    if (top + ch > vh - margin) {
      const above = rect.top - margin - ch;
      top = above > margin ? above : Math.max(margin, vh - ch - margin);
    }
    left = Math.max(margin, left);
    top = Math.max(margin, top);
    if (isNew) [left, top] = avoidOverlap(left, top, el, cw, vw, vh);
    el.style.left = left + 'px';
    el.style.top = top + 'px';
  }

  // Cascade a new card so it doesn't land exactly on top of an existing one.
  function avoidOverlap(left, top, selfEl, cw, vw, vh) {
    const step = 26;
    for (let i = 0; i < cards.size + 1; i++) {
      const clash = [...cards].some((c) => {
        if (c === selfEl) return false;
        const r = c.getBoundingClientRect();
        return Math.abs(r.left - left) < 16 && Math.abs(r.top - top) < 16;
      });
      if (!clash) break;
      left = clamp(left + step, 8, vw - cw - 8);
      top = clamp(top + step, 8, vh - 80);
    }
    return [left, top];
  }

  async function openCard(info) {
    ensureShadow();
    let el = activeCard;
    const isNew = !el;
    if (isNew) {
      el = createCardElement();
      wireCard(el);
      root.appendChild(el);
      cards.add(el);
      activeCard = el;
    }
    el._text = info.text;
    el._context = info.context || '';
    el._target = el.querySelector('.tc-lang').value || settings.targetLang;
    positionCard(el, info.rect, isNew);
    await refreshCard(el);
  }

  // Translate (or re-translate) the card in whichever mode it is currently in.
  function refreshCard(el) {
    return el._compare ? doCompare(el) : doSingle(el);
  }

  // The LLM streams (token-by-token, feels fast); deterministic engines resolve
  // in one shot from the worker cache/network.
  function doSingle(el) {
    return settings.provider === 'openai' ? doSingleStream(el) : doSingleOneShot(el);
  }

  async function doSingleOneShot(el) {
    renderLoading(el);
    try {
      const resp = await chrome.runtime.sendMessage({
        type: 'tc-translate',
        text: el._text,
        target: el._target,
        context: settings.contextAware ? el._context : undefined,
      });
      if (!resp) throw new Error('扩展无响应，请重试');
      if (resp.error) throw new Error(resp.error);
      renderResult(el, el._text, resp);
    } catch (e) {
      renderError(el, (e && e.message) || '翻译失败');
    }
  }

  // Cancel any in-flight streaming translation for this card (re-translate, close,
  // or a newer selection). Disconnecting the port aborts the worker's fetch.
  function resetTranslateStream(el) {
    if (el._streamWatchdog) {
      clearTimeout(el._streamWatchdog);
      el._streamWatchdog = null;
    }
    if (el._translatePort) {
      try { el._translatePort.disconnect(); } catch (_) { /* ignore */ }
      el._translatePort = null;
    }
  }

  // Streamed LLM translation: the card fills in as the model writes. renderLoading
  // (called first) cancels any prior stream via resetTranslateStream and shows the
  // spinner until the first token lands.
  function doSingleStream(el) {
    renderLoading(el);
    const resultEl = el.querySelector('.tc-result');

    let port;
    try {
      port = chrome.runtime.connect({ name: 'tc-translate-stream' });
    } catch (_) {
      return doSingleOneShot(el); // worker unreachable — fall back to one-shot
    }
    el._translatePort = port;

    let acc = '';
    let started = false;
    let fellBack = false;

    const showOriginal = () => {
      const orig = el.querySelector('.tc-original');
      if (settings.showOriginal) {
        orig.hidden = false;
        orig.textContent = el._text;
      } else {
        orig.hidden = true;
      }
    };
    const teardown = () => {
      if (el._streamWatchdog) { clearTimeout(el._streamWatchdog); el._streamWatchdog = null; }
      if (el._translatePort === port) el._translatePort = null;
      try { port.disconnect(); } catch (_) { /* ignore */ }
    };

    // Guard against an endpoint that hangs before the first token (no infinite
    // spinner). Cleared as soon as streaming actually begins.
    el._streamWatchdog = setTimeout(() => {
      if (!started) {
        renderError(el, '大模型响应超时，请重试或检查接口地址 / 模型设置');
        teardown();
      }
    }, 20000);

    port.onMessage.addListener((m) => {
      if (!m) return;
      if (m.type === 'delta') {
        if (!started) {
          started = true;
          if (el._streamWatchdog) { clearTimeout(el._streamWatchdog); el._streamWatchdog = null; }
          resultEl.classList.remove('tc-error');
          resultEl.textContent = ''; // clear the spinner, begin live text
        }
        acc += m.delta;
        resultEl.textContent = acc;
      } else if (m.type === 'done') {
        el._result = (m.text || acc).trim();
        el._provider = m.provider || 'openai';
        el._detected = m.detected || '';
        resultEl.classList.remove('tc-error');
        resultEl.textContent = el._result || '（未获得翻译结果）';
        showOriginal();
        updateSaveState(el);
        teardown();
      } else if (m.type === 'error') {
        // A failure before any text usually means the endpoint can't stream —
        // fall back to the one-shot path once so such servers still work.
        if (!started && !fellBack) {
          fellBack = true;
          teardown();
          doSingleOneShot(el);
          return;
        }
        renderError(el, m.error || '翻译失败');
        teardown();
      }
    });
    port.onDisconnect.addListener(() => {
      if (el._translatePort === port) el._translatePort = null;
    });

    port.postMessage({
      type: 'translate',
      text: el._text,
      target: el._target,
      context: settings.contextAware ? el._context : undefined,
    });
    return Promise.resolve();
  }

  // Multi-engine compare. Each engine renders into its own row the moment it
  // settles (no waiting on the slowest), and the LLM row streams token-by-token
  // over a port — so a slow model fills in live instead of failing the whole
  // card with a hard 8s "超时".
  function doCompare(el) {
    const providers =
      settings.compareProviders && settings.compareProviders.length
        ? settings.compareProviders
        : ['bing', 'google'];
    resetCompareStream(el); // drop a prior compare still streaming, before rebuild
    renderCompareSkeleton(el, providers);

    let port;
    try {
      port = chrome.runtime.connect({ name: 'tc-compare-stream' });
    } catch (_) {
      renderError(el, '无法连接扩展后台，请刷新页面后重试');
      return Promise.resolve();
    }
    el._comparePort = port;

    port.onMessage.addListener((m) => {
      if (!m) return;
      if (m.type === 'row-delta') appendCompareDelta(el, m.provider, m.delta);
      else if (m.type === 'row-done') finishCompareRow(el, m.provider, m);
      else if (m.type === 'row-error') errorCompareRow(el, m.provider, m);
      else if (m.type === 'all-done') resetCompareStream(el);
    });
    port.onDisconnect.addListener(() => {
      if (el._comparePort === port) el._comparePort = null;
    });

    port.postMessage({
      type: 'compare',
      text: el._text,
      target: el._target,
      providers,
      context: settings.contextAware ? el._context : undefined,
    });
    return Promise.resolve();
  }

  function renderLoading(el) {
    const r = el.querySelector('.tc-result');
    r.classList.remove('tc-error');
    r.innerHTML = '<span class="tc-loading"><span class="tc-spinner"></span>翻译中…</span>';
    el.querySelector('.tc-original').hidden = true;
    resetTranslateStream(el); // cancel a prior in-flight stream before re-rendering
    resetCompareStream(el); // …and a prior compare stream (e.g. toggling compare off)
    resetExplain(el); // a new translation invalidates any prior explanation
  }

  function renderResult(el, original, resp) {
    el._result = resp.text;
    el._provider = resp.provider || '';
    el._detected = resp.detected || '';
    const r = el.querySelector('.tc-result');
    r.classList.remove('tc-error');
    r.textContent = resp.text; // textContent: never inject translated HTML

    const orig = el.querySelector('.tc-original');
    if (settings.showOriginal) {
      orig.hidden = false;
      orig.textContent = original;
    } else {
      orig.hidden = true;
    }
    updateSaveState(el);
  }

  // Build one empty, labeled row per engine up front so results can stream in
  // progressively. Row handles live on el._cmpRows, keyed by provider.
  function renderCompareSkeleton(el, providers) {
    resetTranslateStream(el); // a compare run supersedes any single-card stream
    resetExplain(el);
    const r = el.querySelector('.tc-result');
    r.classList.remove('tc-error');
    r.textContent = '';

    const list = document.createElement('div');
    list.className = 'tc-engines';
    el._cmpRows = {};
    el._cmpPrimary = null;

    for (const provider of providers) {
      const row = document.createElement('div');
      row.className = 'tc-engine-row';
      const head = document.createElement('div');
      head.className = 'tc-engine-head';
      const name = document.createElement('span');
      name.className = 'tc-engine-name';
      name.textContent =
        (typeof TC_PROVIDER_NAMES !== 'undefined' && TC_PROVIDER_NAMES[provider]) || provider;
      const meta = document.createElement('span');
      meta.className = 'tc-engine-meta';
      meta.textContent = '翻译中…';
      head.appendChild(name);
      head.appendChild(meta);
      const textEl = document.createElement('div');
      textEl.className = 'tc-engine-text';
      row.appendChild(head);
      row.appendChild(textEl);
      list.appendChild(row);
      el._cmpRows[provider] = { head, meta, textEl, acc: '', done: false };
    }
    r.appendChild(list);

    const orig = el.querySelector('.tc-original');
    if (settings.showOriginal && el._text) {
      orig.hidden = false;
      orig.textContent = el._text;
    } else {
      orig.hidden = true;
    }
  }

  function appendCompareDelta(el, provider, delta) {
    const row = el._cmpRows && el._cmpRows[provider];
    if (!row || row.done) return;
    row.acc += delta;
    row.textEl.textContent = row.acc; // textContent: never inject translated HTML
  }

  function finishCompareRow(el, provider, m) {
    const row = el._cmpRows && el._cmpRows[provider];
    if (!row) return;
    row.done = true;
    const text = ((m && m.text) || row.acc || '').trim();
    row.textEl.classList.remove('tc-error');
    row.textEl.textContent = text;
    row.meta.textContent = m && m.cached ? '缓存' : m && m.ms != null ? m.ms + 'ms' : '';
    if (text && !row.copyBtn) {
      const copy = document.createElement('button');
      copy.className = 'tc-iconbtn tc-engine-copy';
      copy.title = '复制';
      copy.innerHTML = svg(ICONS.copy, 14);
      copy.addEventListener('click', () => copyText(text, copy));
      row.head.appendChild(copy);
      row.copyBtn = copy;
    }
    // The first engine to succeed feeds the header copy / speak / save actions.
    if (text && !el._cmpPrimary) {
      el._cmpPrimary = provider;
      el._result = text;
      el._provider = provider;
      el._detected = (m && m.detected) || '';
      updateSaveState(el);
    }
  }

  function errorCompareRow(el, provider, m) {
    const row = el._cmpRows && el._cmpRows[provider];
    if (!row) return;
    row.done = true;
    row.textEl.classList.add('tc-error');
    row.textEl.textContent = (m && m.error) || '失败';
    row.meta.textContent = '失败';
  }

  // Disconnect a compare stream — also the abort signal for the worker's rows.
  function resetCompareStream(el) {
    if (el._comparePort) {
      try { el._comparePort.disconnect(); } catch (_) { /* ignore */ }
      el._comparePort = null;
    }
  }

  function renderError(el, message) {
    const r = el.querySelector('.tc-result');
    r.classList.add('tc-error');
    r.textContent = message;
    const retry = document.createElement('span');
    retry.className = 'tc-retry';
    retry.textContent = '重试';
    retry.addEventListener('click', () => refreshCard(el));
    r.appendChild(retry);
    el.querySelector('.tc-original').hidden = true;
  }

  function closeCard(el) {
    if (!el) return;
    resetTranslateStream(el); // abort a streaming translation still in flight
    resetCompareStream(el); // …and a streaming compare still in flight
    if (el._explainPort) {
      try { el._explainPort.disconnect(); } catch (_) { /* ignore */ }
      el._explainPort = null;
    }
    if (el._menuEl) {
      closeMenu(el);
      el._menuEl.remove();
      el._menuEl = null;
    }
    cards.delete(el);
    if (activeCard === el) activeCard = null;
    el.remove();
  }

  // Drag the card by its header (anywhere except the language picker / buttons).
  function enableDrag(el) {
    const head = el.querySelector('.tc-head');
    head.addEventListener('mousedown', (e) => {
      if (e.target.closest('.tc-iconbtn, .tc-lang')) return;
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const ox = e.clientX - r.left;
      const oy = e.clientY - r.top;
      el._userMoved = true;
      const prevUserSelect = document.body.style.userSelect;
      document.body.style.userSelect = 'none'; // avoid selecting page text while dragging

      const move = (ev) => {
        const nl = clamp(ev.clientX - ox, 6, window.innerWidth - el.offsetWidth - 6);
        const nt = clamp(ev.clientY - oy, 6, window.innerHeight - el.offsetHeight - 6);
        el.style.left = nl + 'px';
        el.style.top = nt + 'px';
      };
      const up = () => {
        document.removeEventListener('mousemove', move, true);
        document.removeEventListener('mouseup', up, true);
        document.body.style.userSelect = prevUserSelect;
      };
      document.addEventListener('mousemove', move, true);
      document.addEventListener('mouseup', up, true);
    });
  }

  function speak(el) {
    const text = el._result;
    if (!text || !window.speechSynthesis) return;
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = el._target || settings.targetLang;
      speechSynthesis.speak(u);
    } catch (_) { /* ignore */ }
  }

  // Copy arbitrary text and flash a check on the given button. Shared by the
  // header copy button and each compare-row copy button.
  async function copyText(text, btn) {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
    } catch (_) {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch (_) { /* ignore */ }
      ta.remove();
    }
    if (btn) {
      const prev = btn.innerHTML;
      const size = btn.classList.contains('tc-engine-copy') ? 14 : 16;
      btn.innerHTML = svg(ICONS.check, size);
      btn.classList.add('tc-ok');
      clearTimeout(btn._okTimer);
      btn._okTimer = setTimeout(() => {
        btn.innerHTML = prev;
        btn.classList.remove('tc-ok');
      }, 1300);
    }
  }

  function copyResult(el) {
    return copyText(el._result, el.querySelector('.tc-copy'));
  }

  // --- Hover reading lens ------------------------------------------------

  // Climb to the nearest block-level element that actually holds the text.
  // (flex containers are excluded — those are usually app layout/UI, not prose.)
  function nearestTextBlock(el) {
    let cur = el;
    while (cur && cur.nodeType === 1 && cur !== document.body) {
      if (cur.id === 'tc-shadow-host') return null;
      const disp = getComputedStyle(cur).display;
      if (disp === 'block' || disp === 'list-item' || disp === 'table-cell') {
        if ((cur.textContent || '').trim().length >= 2) return cur;
      }
      cur = cur.parentElement;
    }
    return null;
  }

  function maybeLens(x, y) {
    if (!settings.lensEnabled || isMouseDown) return;
    if (document.elementFromPoint(x, y) === host) return; // over our own card/UI
    // Only trigger when the cursor is genuinely over a text glyph (not padding).
    const textEl = textElementAtPoint(x, y);
    if (!textEl || textEl === host) { removeLens(); return; }
    const block = nearestTextBlock(textEl);
    // Skip layout containers — only translate a leaf "prose" block.
    if (!block || !isProseBlock(block)) { removeLens(); return; }
    if (block === lensBlock && lensEl) return; // already shown for this block
    const text = (block.textContent || '').replace(/\s+/g, ' ').trim();
    if (!lensWorthTranslating(textEl, block, text)) { removeLens(); return; }
    lensBlock = block;
    showLens(block, text);
  }

  // The element holding the text under (x,y) — but only if the cursor is
  // actually over rendered text, not snapped in from an element's empty padding.
  function textElementAtPoint(x, y) {
    let node = null;
    if (document.caretRangeFromPoint) {
      const range = document.caretRangeFromPoint(x, y);
      node = range && range.startContainer;
    } else if (document.caretPositionFromPoint) {
      const pos = document.caretPositionFromPoint(x, y);
      node = pos && pos.offsetNode;
    }
    if (!node || node.nodeType !== 3 || !node.textContent.trim()) return null;
    const probe = document.createRange();
    probe.selectNodeContents(node);
    const rects = probe.getClientRects();
    for (let i = 0; i < rects.length; i++) {
      const r = rects[i];
      if (x >= r.left - 2 && x <= r.right + 2 && y >= r.top - 2 && y <= r.bottom + 2) {
        return node.parentElement;
      }
    }
    return null; // cursor is in empty space beside the text, not on it
  }

  // A real paragraph holds only inline content. If a block has block-level
  // children it's a layout container (would translate the whole thing) — skip.
  function isProseBlock(el) {
    for (let i = 0; i < el.children.length; i++) {
      const d = getComputedStyle(el.children[i]).display;
      if (d === 'block' || d === 'flex' || d === 'grid' ||
          d === 'list-item' || d === 'table' || d === 'table-row') {
        return false;
      }
    }
    return true;
  }

  // Only lens actual reading content — skip UI chrome and same-language text.
  function lensWorthTranslating(el, block, text) {
    if (text.length < 12 || text.length > 1500) return false; // labels / huge containers
    if (el.closest && el.closest(
      'a,button,input,textarea,select,label,summary,[contenteditable],' +
      '[role="button"],[role="menuitem"],[role="tab"],[role="option"],' +
      '[role="checkbox"],[role="switch"],[role="link"]'
    )) return false;
    if (block.closest && block.closest(
      'nav,[role="navigation"],[role="menu"],[role="menubar"],[role="toolbar"],[role="tablist"]'
    )) return false;
    if (isMostlyTargetLang(text, settings.targetLang)) return false; // e.g. Chinese→Chinese
    return true;
  }

  function baseLang(code) { return (code || '').toLowerCase().split(/[-_]/)[0]; }
  function sameBaseLang(a, b) {
    const x = baseLang(a);
    return !!x && x === baseLang(b);
  }

  // Cheap script heuristic: is the text already mostly written in `target`?
  function isMostlyTargetLang(text, target) {
    const letters = text.match(/\p{L}/gu);
    if (!letters || !letters.length) return false;
    const han = (text.match(/\p{Script=Han}/gu) || []).length;
    const kana = (text.match(/\p{Script=Hiragana}|\p{Script=Katakana}/gu) || []).length;
    const hangul = (text.match(/\p{Script=Hangul}/gu) || []).length;
    const t = baseLang(target);
    if (t === 'zh') return han / letters.length > 0.5;
    if (t === 'ja') return (han + kana) / letters.length > 0.5;
    if (t === 'ko') return hangul / letters.length > 0.5;
    return false; // latin-script targets are ambiguous by script - handled post-hoc
  }

  async function showLens(block, text) {
    ensureShadow();
    const rect = block.getBoundingClientRect();
    if (rect.width < 1 || rect.bottom < 0 || rect.top > window.innerHeight) {
      removeLens();
      return;
    }
    // Rebuild the element each time so the drop animation replays per paragraph.
    if (lensEl) lensEl.remove();
    lensEl = document.createElement('div');
    lensEl.className = 'tc-lens';
    lensEl.innerHTML = '<div class="tc-lens-panel"></div>';
    root.appendChild(lensEl);
    const panel = lensEl.querySelector('.tc-lens-panel');
    positionLens(rect);

    const key = settings.targetLang + '|' + text;
    if (lensCache.has(key)) {
      panel.textContent = lensCache.get(key);
      positionLens(block.getBoundingClientRect());
      return;
    }

    panel.classList.add('tc-lens-loading');
    panel.textContent = '翻译中…';
    const forBlock = block;
    try {
      // Lens always uses the fast/free engine so skimming is instant & cheap.
      const resp = await chrome.runtime.sendMessage({
        type: 'tc-translate',
        text,
        target: settings.targetLang,
        provider: 'bing',
      });
      if (lensBlock !== forBlock || !lensEl) return; // moved away meanwhile
      if (!resp || resp.error) { removeLens(); return; }
      // Engine says it's already the target language → nothing to show.
      if (sameBaseLang(resp.detected, settings.targetLang)) { removeLens(); return; }
      lensCache.set(key, resp.text);
      const p = lensEl.querySelector('.tc-lens-panel');
      if (!p) return;
      p.classList.remove('tc-lens-loading');
      p.textContent = resp.text;
      positionLens(forBlock.getBoundingClientRect());
    } catch (_) {
      removeLens();
    }
  }

  function positionLens(rect) {
    if (!lensEl) return;
    const gap = 4;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const w = clamp(rect.width, 140, vw - 16);
    lensEl.style.width = w + 'px';
    lensEl.style.left = clamp(rect.left, 6, vw - w - 6) + 'px';
    // Drop below the text; flip above if there isn't room.
    const h = lensEl.offsetHeight || 0;
    let top = rect.bottom + gap;
    if (h && top + h > vh - 6) {
      const above = rect.top - gap - h;
      top = above > 6 ? above : clamp(top, 6, vh - h - 6);
    }
    lensEl.style.top = top + 'px';
  }

  function removeLens() {
    clearTimeout(lensTimer);
    if (lensEl) { lensEl.remove(); lensEl = null; }
    lensBlock = null;
  }

  // --- Selection handling ------------------------------------------------

  function handleSelection() {
    if (settings.triggerMode === 'off') return;
    const info = getSelectionInfo();
    if (!info) {
      removeTrigger();
      return;
    }
    lastSelection = info;
    if (settings.triggerMode === 'auto') {
      removeTrigger();
      openCard(info);
    } else {
      showTrigger(info);
    }
  }

  // --- Global event wiring ----------------------------------------------

  document.addEventListener('mouseup', (e) => {
    isMouseDown = false;
    if (e.target === host) return; // interaction inside our own UI
    setTimeout(handleSelection, 0); // let the selection settle first
  });

  // Clicking elsewhere only dismisses the trigger button. The card is
  // persistent — it closes via the ✕ button or the Escape key.
  document.addEventListener('mousedown', (e) => {
    isMouseDown = true;
    removeLens();
    if (e.target === host) return;
    removeTrigger();
  }, true);

  // Hover reading lens — debounced, only active when the toggle is on.
  document.addEventListener('mousemove', (e) => {
    if (!settings.lensEnabled || isMouseDown || e.target === host) return;
    const x = e.clientX;
    const y = e.clientY;
    clearTimeout(lensTimer);
    lensTimer = setTimeout(() => maybeLens(x, y), 350);
  }, true);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (openMenuCard) { closeMenu(openMenuCard); return; } // first Esc closes an open menu
      removeTrigger();
      removeLens();
      closeCard(activeCard); // closes the reusable card; pinned ones stay
    }
  }, true);

  window.addEventListener('scroll', () => {
    removeTrigger();
    removeLens();
    if (openMenuCard) closeMenu(openMenuCard);
  }, true);

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync') return;
    for (const key in changes) settings[key] = changes[key].newValue;
    applyTheme();
    if (!settings.lensEnabled) removeLens();
  });

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg && msg.type === 'tc-translate-selection') {
      const info = getSelectionInfo() || lastSelection;
      if (info) {
        removeTrigger();
        openCard(info);
      }
    }
  });

  // --- Init --------------------------------------------------------------

  (async function init() {
    try {
      settings = await tcGetSettings();
    } catch (_) {
      settings = { ...TC_DEFAULTS };
    }
    if (window.matchMedia) {
      try {
        window
          .matchMedia('(prefers-color-scheme: dark)')
          .addEventListener('change', applyTheme);
      } catch (_) { /* older browsers */ }
    }
  })();
})();
