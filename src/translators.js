/*
 * translators.js — translation provider implementations.
 *
 * Runs ONLY inside the service worker (loaded via importScripts in
 * background.js). Doing the network requests here — rather than in the content
 * script — keeps API keys out of page context and sidesteps the host page's
 * Content-Security-Policy (the worker uses the extension's host_permissions).
 *
 * Every provider returns a normalized result:
 *   { text: string, detected?: string, provider: string }
 * or throws an Error with a user-friendly message.
 */

/** Map our language codes to Microsoft/Bing target codes. */
const TC_BING_TARGET = {
  'zh-CN': 'zh-Hans',
  'zh-TW': 'zh-Hant',
};

/** Map our language codes to DeepL's target codes. */
const TC_DEEPL_TARGET = {
  'zh-CN': 'ZH',
  'zh-TW': 'ZH', // DeepL has no Traditional target; closest is ZH
  en: 'EN-US',
  ja: 'JA',
  ko: 'KO',
  fr: 'FR',
  de: 'DE',
  es: 'ES',
  ru: 'RU',
  it: 'IT',
  pt: 'PT-PT',
  ar: 'AR',
  id: 'ID',
};

/**
 * Free Google Translate endpoint (no API key). Default provider so the
 * extension works out of the box.
 */
async function tcGoogleTranslate(text, target) {
  const url =
    'https://translate.googleapis.com/translate_a/single' +
    '?client=gtx&dt=t&sl=auto' +
    '&tl=' + encodeURIComponent(target) +
    '&q=' + encodeURIComponent(text);

  const res = await fetch(url, { method: 'GET' });
  if (!res.ok) throw new Error(`Google 接口返回 ${res.status}`);
  const data = await res.json();

  // data[0] is an array of [translatedChunk, originalChunk, ...] segments.
  const segments = Array.isArray(data && data[0]) ? data[0] : [];
  const translated = segments.map((s) => (s && s[0]) || '').join('');
  if (!translated) throw new Error('未获得翻译结果');

  return { text: translated, detected: data[2] || '', provider: 'google' };
}

/**
 * Microsoft / Bing translate — keyless and reachable in mainland China.
 * Uses the same free auth token that Microsoft Edge's built-in translator does:
 * fetch a short-lived Bearer token, then call the public translate endpoint.
 */
let tcBingToken = { value: '', ts: 0 };

async function tcBingAuth() {
  const now = Date.now();
  // Token is valid ~10 min; refresh a bit early.
  if (tcBingToken.value && now - tcBingToken.ts < 8 * 60 * 1000) return tcBingToken.value;
  const res = await fetch('https://edge.microsoft.com/translate/auth');
  if (!res.ok) throw new Error(`获取微软翻译令牌失败 (${res.status})`);
  const token = (await res.text()).trim();
  if (!token) throw new Error('微软翻译令牌为空');
  tcBingToken = { value: token, ts: now };
  return token;
}

async function tcBingTranslate(text, target) {
  const token = await tcBingAuth();
  const to = TC_BING_TARGET[target] || target;
  const url =
    'https://api.cognitive.microsofttranslator.com/translate?api-version=3.0&to=' +
    encodeURIComponent(to);
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify([{ Text: text }]),
  });
  if (!res.ok) {
    if (res.status === 401) tcBingToken = { value: '', ts: 0 }; // force re-auth next time
    throw new Error(`微软翻译接口返回 ${res.status}`);
  }
  const data = await res.json();
  const item = data && data[0];
  const t = item && item.translations && item.translations[0];
  if (!t) throw new Error('微软翻译未返回结果');
  return {
    text: t.text,
    detected: (item.detectedLanguage && item.detectedLanguage.language) || '',
    provider: 'bing',
  };
}

/** DeepL (free or pro tier). Requires an API key. */
async function tcDeeplTranslate(text, target, settings) {
  const key = (settings.deeplKey || '').trim();
  if (!key) throw new Error('未设置 DeepL API Key（请在选项页填写）');

  const host = settings.deeplPro ? 'api.deepl.com' : 'api-free.deepl.com';
  const targetLang = TC_DEEPL_TARGET[target] || target.toUpperCase();

  const res = await fetch(`https://${host}/v2/translate`, {
    method: 'POST',
    headers: {
      Authorization: `DeepL-Auth-Key ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ text: [text], target_lang: targetLang }),
  });
  if (!res.ok) {
    const detail = res.status === 403 ? '（Key 无效或额度用尽）' : '';
    throw new Error(`DeepL 接口返回 ${res.status}${detail}`);
  }
  const data = await res.json();
  const t = data && data.translations && data.translations[0];
  if (!t) throw new Error('DeepL 未返回结果');
  return {
    text: t.text,
    detected: (t.detected_source_language || '').toLowerCase(),
    provider: 'deepl',
  };
}

/**
 * Any OpenAI-compatible chat endpoint. Works with OpenAI, OpenRouter, local
 * servers (Ollama/llama.cpp/vLLM), or your own model — just set baseUrl/model.
 */
async function tcOpenAITranslate(text, target, settings, context) {
  const key = (settings.openaiKey || '').trim();
  const base = (settings.openaiBaseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '');
  const model = settings.openaiModel || 'gpt-4o-mini';
  const targetName = (typeof tcLangName === 'function' ? tcLangName(target) : target);

  // When the caller supplies surrounding text, translate only the selection but
  // use the context to disambiguate meaning (the LLM-only advantage).
  const useCtx = context && context.trim() && context.trim() !== text.trim();
  const messages = useCtx
    ? [
        {
          role: 'system',
          content:
            `You are a professional translator. Using the provided Context only to ` +
            `disambiguate meaning, translate the Phrase into ${targetName}. Output ONLY ` +
            `the translation of the Phrase — no quotes, no context, no notes.`,
        },
        { role: 'user', content: `Context:\n${context}\n\nPhrase:\n${text}` },
      ]
    : [
        {
          role: 'system',
          content:
            `You are a professional translator. Translate the user's text into ${targetName}. ` +
            'Preserve meaning, tone, and formatting. Output ONLY the translation, with no quotes, ' +
            'no explanations, and no extra commentary.',
        },
        { role: 'user', content: text },
      ];

  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(key ? { Authorization: `Bearer ${key}` } : {}),
    },
    body: JSON.stringify({ model, temperature: 0.2, messages }),
  });
  if (!res.ok) {
    let msg = `大模型接口返回 ${res.status}`;
    try {
      const err = await res.json();
      if (err && err.error && err.error.message) msg += `：${err.error.message}`;
    } catch (_) { /* ignore parse errors */ }
    throw new Error(msg);
  }
  const data = await res.json();
  const out = data && data.choices && data.choices[0] && data.choices[0].message;
  if (!out || !out.content) throw new Error('大模型未返回内容');
  return { text: out.content.trim(), detected: '', provider: 'openai' };
}

/** Dispatch to the configured provider. `context` is used by LLM engines only. */
async function tcTranslate(text, target, settings, context) {
  switch (settings.provider) {
    case 'google':
      return tcGoogleTranslate(text, target);
    case 'deepl':
      return tcDeeplTranslate(text, target, settings);
    case 'openai':
      return tcOpenAITranslate(text, target, settings, context);
    case 'bing':
    default:
      return tcBingTranslate(text, target);
  }
}

globalThis.tcTranslate = tcTranslate;
