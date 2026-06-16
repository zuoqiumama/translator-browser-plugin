/*
 * background.js — MV3 service worker (classic).
 *
 * Responsibilities:
 *   1. Run translation network requests on behalf of the content script.
 *   2. Provide a right-click context-menu entry.
 *   3. Handle the keyboard command (Alt+T) to translate the current selection.
 */

importScripts('data.js', 'translators.js');

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
