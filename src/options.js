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

  // Auto-save handlers.
  for (const key in fields) {
    const el = fields[key];
    const evt = el.tagName === 'SELECT' || el.type === 'checkbox' ? 'change' : 'input';
    el.addEventListener(evt, () => {
      const value = el.type === 'checkbox' ? el.checked : el.value;
      chrome.storage.sync.set({ [key]: value });
      if (key === 'provider') updateSections();
      flashSaved();
    });
  }

  function updateSections() {
    $('deeplSection').classList.toggle('hidden', fields.provider.value !== 'deepl');
    $('openaiSection').classList.toggle('hidden', fields.provider.value !== 'openai');
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
      const granted = await chrome.permissions.request({ origins: [pattern] });
      status.textContent = granted ? ' 已授权 ✓' : ' 已拒绝';
    } catch (e) {
      status.textContent = ' ' + ((e && e.message) || '授权失败');
    }
  });

  // --- Test translation --------------------------------------------------

  $('testBtn').addEventListener('click', async () => {
    const out = $('testResult');
    const text = $('testInput').value.trim();
    if (!text) return;
    out.classList.remove('err');
    out.textContent = '翻译中…';
    try {
      const resp = await chrome.runtime.sendMessage({
        type: 'tc-translate',
        text,
        target: fields.targetLang.value,
      });
      if (!resp || resp.error) throw new Error(resp ? resp.error : '无响应');
      out.textContent = resp.text;
    } catch (e) {
      out.classList.add('err');
      out.textContent = (e && e.message) || '翻译失败';
    }
  });
})();
