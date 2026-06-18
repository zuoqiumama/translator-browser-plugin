/*
 * data.js — shared constants (languages + default settings).
 *
 * Loaded as a CLASSIC script in every context so there is a single source of
 * truth:
 *   - content scripts   (listed first in manifest content_scripts.js)
 *   - service worker    (via importScripts in background.js)
 *   - popup / options   (via a <script> tag before their own script)
 *
 * Because it is classic (not an ES module), top-level `var` declarations attach
 * to the global scope and are visible to the other classic scripts that run in
 * the same context.
 */

/** Languages offered as translation targets. `code` follows Google's scheme. */
var TC_LANGUAGES = [
  { code: 'zh-CN', name: '中文（简体）', en: 'Chinese (Simplified)' },
  { code: 'zh-TW', name: '中文（繁体）', en: 'Chinese (Traditional)' },
  { code: 'en', name: '英语', en: 'English' },
  { code: 'ja', name: '日语', en: 'Japanese' },
  { code: 'ko', name: '韩语', en: 'Korean' },
  { code: 'fr', name: '法语', en: 'French' },
  { code: 'de', name: '德语', en: 'German' },
  { code: 'es', name: '西班牙语', en: 'Spanish' },
  { code: 'ru', name: '俄语', en: 'Russian' },
  { code: 'it', name: '意大利语', en: 'Italian' },
  { code: 'pt', name: '葡萄牙语', en: 'Portuguese' },
  { code: 'ar', name: '阿拉伯语', en: 'Arabic' },
  { code: 'hi', name: '印地语', en: 'Hindi' },
  { code: 'th', name: '泰语', en: 'Thai' },
  { code: 'vi', name: '越南语', en: 'Vietnamese' },
  { code: 'id', name: '印尼语', en: 'Indonesian' },
];

/** Look up the human-readable English name for a language code (for LLM prompts). */
function tcLangName(code) {
  const hit = TC_LANGUAGES.find((l) => l.code === code);
  return hit ? hit.en : code;
}

/** Short display names for engines, used by the multi-engine compare view. */
var TC_PROVIDER_NAMES = { bing: '微软', google: 'Google', deepl: 'DeepL', openai: '大模型' };

/** Default settings; merged with whatever the user has saved in storage.sync. */
var TC_DEFAULTS = {
  provider: 'bing', // 'bing' | 'google' | 'deepl' | 'openai'  (bing is keyless & works in CN)
  targetLang: 'zh-CN',
  triggerMode: 'button', // 'button' (show icon first) | 'auto' (translate immediately) | 'off'
  theme: 'auto', // 'auto' | 'light' | 'dark'
  showOriginal: true, // show the source text inside the card
  enableTTS: true, // show the speak button
  lensEnabled: false, // hover-to-translate reading lens
  contextAware: false, // send the surrounding paragraph as context (LLM engines only)
  compareProviders: ['bing', 'google'], // engines shown side-by-side in the card's 对照 mode
  // DeepL
  deeplKey: '',
  deeplPro: false, // true => api.deepl.com (paid), false => api-free.deepl.com
  // OpenAI-compatible LLM (also works for your own endpoint / local models)
  openaiKey: '',
  openaiBaseUrl: 'https://api.openai.com/v1',
  openaiModel: 'gpt-4o-mini',
};

/** Read the merged settings from chrome.storage.sync. */
async function tcGetSettings() {
  const stored = await chrome.storage.sync.get(TC_DEFAULTS);
  return { ...TC_DEFAULTS, ...stored };
}

// Expose explicitly so service-worker (importScripts) and module-free pages
// can rely on them regardless of how `var` hoisting is treated.
if (typeof globalThis !== 'undefined') {
  globalThis.TC_LANGUAGES = TC_LANGUAGES;
  globalThis.TC_PROVIDER_NAMES = TC_PROVIDER_NAMES;
  globalThis.TC_DEFAULTS = TC_DEFAULTS;
  globalThis.tcLangName = tcLangName;
  globalThis.tcGetSettings = tcGetSettings;
}
