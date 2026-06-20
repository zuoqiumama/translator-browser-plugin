/* options.js — settings page logic (classic script). Auto-saves on change. */

(async function () {
  const $ = (id) => document.getElementById(id);

  const fields = {
    targetLang: $('targetLang'),
    triggerMode: $('triggerMode'),
    theme: $('theme'),
    showOriginal: $('showOriginal'),
    enableTTS: $('enableTTS'),
    lensEnabled: $('lensEnabled'),
    contextAware: $('contextAware'),
    provider: $('provider'),
    deeplKey: $('deeplKey'),
    deeplPro: $('deeplPro'),
    openaiBaseUrl: $('openaiBaseUrl'),
    openaiModel: $('openaiModel'),
    openaiKey: $('openaiKey'),
  };

  // Populate target languages.
  for (const lang of TC_LANGUAGES) {
    const opt = document.createElement('option');
    opt.value = lang.code;
    opt.textContent = `${lang.name} (${lang.en})`;
    fields.targetLang.appendChild(opt);
  }

  // Load current settings into the form.
  const settings = await tcGetSettings();
  for (const key in fields) {
    const el = fields[key];
    if (el.type === 'checkbox') el.checked = !!settings[key];
    else el.value = settings[key];
  }
  updateSections();

  // Serialize storage writes so a user can edit a field and immediately click
  // "测试翻译" without the worker reading stale settings.
  let saveQueue = Promise.resolve();
  let lastSaveError = null;

  function saveSettings(patch) {
    const write = saveQueue.then(() => chrome.storage.sync.set(patch));
    saveQueue = write.then(
      () => {
        lastSaveError = null;
        flashSaved();
      },
      (error) => {
        lastSaveError = error || new Error('保存失败');
      },
    );
    return write;
  }

  async function flushSettings() {
    await saveQueue;
    if (lastSaveError) throw lastSaveError;
  }

  // Auto-save handlers.
  for (const key in fields) {
    const el = fields[key];
    // Saving text inputs on every keystroke can hit chrome.storage.sync write
    // quotas, especially for long API keys. "change" still auto-saves on blur.
    const evt = 'change';
    el.addEventListener(evt, () => {
      const value = el.type === 'checkbox' ? el.checked : el.value;
      saveSettings({ [key]: value }).catch(() => {});
      if (key === 'provider') updateSections();
    });
  }

  // --- Multi-engine compare selection (stored as an array, handled separately) ---
  const cmpBoxes = Array.from(document.querySelectorAll('input[data-cmp]'));
  const cmpSelected = new Set(settings.compareProviders || []);
  for (const box of cmpBoxes) box.checked = cmpSelected.has(box.dataset.cmp);
  for (const box of cmpBoxes) {
    box.addEventListener('change', () => {
      const chosen = cmpBoxes.filter((b) => b.checked).map((b) => b.dataset.cmp);
      saveSettings({ compareProviders: chosen }).catch(() => {});
    });
  }

  $('openVocab').addEventListener('click', () =>
    chrome.tabs.create({ url: chrome.runtime.getURL('src/vocab.html') }));

  // Show the real version everywhere it appears (manifest is the source of truth).
  try {
    const version = chrome.runtime.getManifest().version;
    for (const id of ['aboutVersion', 'railVersion']) {
      const el = $(id);
      if (el) el.textContent = version;
    }
  } catch (_) {
    /* getManifest unavailable outside the extension — keep the static fallback */
  }

  function updateSections() {
    $('deeplSection').classList.toggle('hidden', fields.provider.value !== 'deepl');
  }

  let savedTimer = null;
  function flashSaved() {
    const el = $('saved');
    el.classList.add('show');
    clearTimeout(savedTimer);
    savedTimer = setTimeout(() => el.classList.remove('show'), 1000);
  }

  // --- Grant host permission for a custom OpenAI-compatible endpoint -----

  $('grantBtn').addEventListener('click', async () => {
    const status = $('grantStatus');
    let pattern;
    try {
      const url = new URL(fields.openaiBaseUrl.value);
      pattern = `${url.protocol}//${url.hostname}/*`;
    } catch (_) {
      status.textContent = ' 接口地址无效';
      return;
    }
    try {
      // Keep request() directly in the click gesture; Chrome may reject
      // permission prompts after awaiting unrelated asynchronous work.
      const granted = await chrome.permissions.request({ origins: [pattern] });
      status.textContent = granted ? ' 已授权 ✓' : ' 已拒绝';
    } catch (e) {
      status.textContent = ' ' + ((e && e.message) || '授权失败');
    }
  });

  // --- Test translation --------------------------------------------------

  async function testTranslation(inputId, resultId, provider) {
    const out = $(resultId);
    const text = $(inputId).value.trim();
    if (!text) return;
    out.classList.remove('err');
    out.textContent = '翻译中…';
    try {
      await flushSettings();
      const resp = await chrome.runtime.sendMessage({
        type: 'tc-translate',
        text,
        target: fields.targetLang.value,
        ...(provider ? { provider } : {}),
      });
      if (!resp || resp.error) throw new Error(resp ? resp.error : '无响应');
      out.textContent = resp.text;
    } catch (e) {
      out.classList.add('err');
      out.textContent = (e && e.message) || '翻译失败';
    }
  }

  $('llmTestBtn').addEventListener('click', () =>
    testTranslation('llmTestInput', 'llmTestResult', 'openai'));
  $('testBtn').addEventListener('click', () =>
    testTranslation('testInput', 'testResult'));
})();
