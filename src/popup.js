/* popup.js — quick settings in the toolbar popup (classic script). */

(async function () {
  const targetSel = document.getElementById('targetLang');
  const triggerSel = document.getElementById('triggerMode');
  const providerSel = document.getElementById('provider');

  // Populate target languages from the shared list.
  for (const lang of TC_LANGUAGES) {
    const opt = document.createElement('option');
    opt.value = lang.code;
    opt.textContent = lang.name;
    targetSel.appendChild(opt);
  }

  const lensChk = document.getElementById('lensEnabled');
  const ctxChk = document.getElementById('contextAware');

  const settings = await tcGetSettings();
  targetSel.value = settings.targetLang;
  triggerSel.value = settings.triggerMode;
  providerSel.value = settings.provider;
  lensChk.checked = settings.lensEnabled;
  ctxChk.checked = settings.contextAware;

  targetSel.addEventListener('change', () =>
    chrome.storage.sync.set({ targetLang: targetSel.value }));
  triggerSel.addEventListener('change', () =>
    chrome.storage.sync.set({ triggerMode: triggerSel.value }));
  providerSel.addEventListener('change', () =>
    chrome.storage.sync.set({ provider: providerSel.value }));
  lensChk.addEventListener('change', () =>
    chrome.storage.sync.set({ lensEnabled: lensChk.checked }));
  ctxChk.addEventListener('change', () =>
    chrome.storage.sync.set({ contextAware: ctxChk.checked }));

  document.getElementById('openOptions').addEventListener('click', () => {
    if (chrome.runtime.openOptionsPage) chrome.runtime.openOptionsPage();
    else window.open(chrome.runtime.getURL('src/options.html'));
  });

  document.getElementById('openVocab').addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('src/vocab.html') });
    window.close();
  });

  document.getElementById('openFeedback').addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('src/feedback.html') });
    window.close();
  });

  document.getElementById('openAbout').addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('src/options.html#sec-about') });
    window.close();
  });
})();
