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
 * Build the chat messages for a translation. Shared by the one-shot and the
 * streaming OpenAI paths so both speak with exactly the same voice.
 *
 * When the caller supplies surrounding text, translate only the selection but
 * use the context to disambiguate meaning (the LLM-only advantage).
 */
function tcTranslateMessages(text, target, context) {
  const targetName = typeof tcLangName === 'function' ? tcLangName(target) : target;
  const useCtx = context && context.trim() && context.trim() !== text.trim();
  return useCtx
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
}

/** Turn a non-OK OpenAI response into a user-friendly Error (best-effort detail). */
async function tcOpenAIError(res) {
  let msg = `大模型接口返回 ${res.status}`;
  try {
    const err = await res.json();
    const detail =
      err && ((err.error && err.error.message) || err.message || err.detail || err.error_description);
    if (detail) msg += `：${detail}`;
  } catch (_) { /* ignore parse errors */ }
  return new Error(msg);
}

/**
 * Any OpenAI-compatible chat endpoint. Works with OpenAI, OpenRouter, local
 * servers (Ollama/llama.cpp/vLLM), or your own model — just set baseUrl/model.
 * Non-streaming; kept for the multi-engine compare view (which renders engines
 * as static rows). The single-card path uses the streaming variant below.
 */
async function tcOpenAITranslate(text, target, settings, context) {
  const key = (settings.openaiKey || '').trim();
  const base = (settings.openaiBaseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '');
  const model = settings.openaiModel || 'gpt-4o-mini';

  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(key ? { Authorization: `Bearer ${key}` } : {}),
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      messages: tcTranslateMessages(text, target, context),
    }),
  });
  if (!res.ok) throw await tcOpenAIError(res);
  const data = await res.json();
  const out = data && data.choices && data.choices[0] && data.choices[0].message;
  if (!out || !out.content) throw new Error('大模型未返回内容');
  return { text: out.content.trim(), detected: '', provider: 'openai' };
}

/**
 * Low-level streaming call to an OpenAI-compatible chat endpoint. Invokes
 * onDelta(textChunk) as each token arrives and resolves to the full text.
 * `signal` (an AbortController's) cancels the request and tears down the
 * connection instantly — used to drop a stale translation the moment the user
 * re-selects or closes the card. Shared by streaming translation and the AI
 * explanation so the SSE parsing lives in exactly one place.
 */
async function tcOpenAIChatStream(messages, extraBody, settings, onDelta, signal) {
  const key = (settings.openaiKey || '').trim();
  const base = (settings.openaiBaseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '');
  const model = settings.openaiModel || 'gpt-4o-mini';

  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(key ? { Authorization: `Bearer ${key}` } : {}),
    },
    body: JSON.stringify({ model, stream: true, ...extraBody, messages }),
    signal,
  });
  if (!res.ok || !res.body) throw await tcOpenAIError(res);

  // Parse the SSE stream: lines of `data: {json}`, terminated by `data: [DONE]`.
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let full = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || ''; // keep the trailing partial line
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const payload = trimmed.slice(5).trim();
      if (payload === '[DONE]') return full;
      try {
        const json = JSON.parse(payload);
        const delta =
          json.choices && json.choices[0] && json.choices[0].delta && json.choices[0].delta.content;
        if (delta) {
          full += delta;
          onDelta(delta);
        }
      } catch (_) { /* ignore keep-alives / partial chunks */ }
    }
  }
  return full;
}

/**
 * Streaming translation over an OpenAI-compatible endpoint. Emits partial text
 * through onDelta so the card fills in as the model writes — the core fix for
 * "the LLM feels slow": the first words land in a few hundred ms instead of
 * after the whole translation finishes.
 */
async function tcOpenAITranslateStream(text, target, settings, context, onDelta, signal) {
  const messages = tcTranslateMessages(text, target, context);
  const full = await tcOpenAIChatStream(messages, { temperature: 0.2 }, settings, onDelta, signal);
  const out = (full || '').trim();
  if (!out) throw new Error('大模型未返回内容');
  return { text: out, detected: '', provider: 'openai' };
}

/**
 * Stream an AI explanation of a word/phrase in its context from the OpenAI-
 * compatible endpoint (stream:true). Calls onDelta(text) for each content
 * chunk. Driven by the card's 解释 action over a long-lived Port so the worker
 * stays alive for the whole stream.
 */
async function tcExplainStream(text, target, settings, context, onDelta, signal) {
  const targetName = typeof tcLangName === 'function' ? tcLangName(target) : target;

  const system =
    `You are a concise bilingual dictionary and language tutor. Explain the user's ` +
    `WORD/PHRASE as used in the given context. Write the whole explanation in ${targetName}. ` +
    `Output plain text only — no markdown symbols. Use exactly these labeled lines, ` +
    `each on its own line:\n` +
    `含义：<meaning in this context>\n` +
    `词性/语法：<part of speech + a short grammar note>\n` +
    `例句：<one short example sentence using it> — <its ${targetName} translation>\n` +
    `Keep it brief. Do not translate the whole context.`;
  const user =
    context && context.trim() && context.trim() !== text.trim()
      ? `Context:\n${context}\n\nWord/Phrase:\n${text}`
      : `Word/Phrase:\n${text}`;

  await tcOpenAIChatStream(
    [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    { temperature: 0.3 },
    settings,
    onDelta,
    signal,
  );
}

/** Route to the configured provider. `context` is used by LLM engines only. */
function tcDispatch(text, target, settings, context) {
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

/**
 * In-flight non-streaming requests, keyed like the cache. Lets a later caller
 * (e.g. the streamed click after a hover-prefetch) ride an identical request
 * already running instead of issuing a second — duplicate — model call.
 */
const tcInflight = new Map();

/**
 * Cached translation. A repeat of the same (provider, target, text) returns
 * instantly with no network request — the core of the "fast" experience and
 * the shared substrate the multi-engine compare mode builds on. Concurrent
 * duplicates are coalesced onto a single in-flight request.
 *
 * Only LLM results depend on `context`, so only those fold it into the key;
 * deterministic engines (Bing/Google/DeepL) cache purely by text+target.
 */
async function tcTranslate(text, target, settings, context) {
  const keyCtx = settings.provider === 'openai' ? context : '';
  const key = tcCacheKey(settings.provider, target, text, keyCtx);

  const cached = tcCacheGet(key);
  if (cached) return { ...cached, cached: true };

  const pending = tcInflight.get(key);
  if (pending) return pending.then((r) => ({ ...r, cached: true }));

  const p = (async () => {
    const result = await tcDispatch(text, target, settings, context);
    tcCacheSet(key, result); // only successful results reach here
    return result;
  })();
  tcInflight.set(key, p);
  try {
    return await p;
  } finally {
    tcInflight.delete(key);
  }
}

/**
 * Cached, STREAMING translation for the single-card LLM path. A cache hit
 * replays instantly as one delta (no network); a miss streams from the model
 * and stores the finished text so re-opening the same selection is free. Shares
 * tcTranslate's cache, so a value warmed by hover-prefetch or the compare view
 * is reused here and resolves the click immediately.
 */
async function tcTranslateStream(text, target, settings, context, onDelta, signal) {
  const key = tcCacheKey('openai', target, text, context || '');
  const cached = tcCacheGet(key);
  if (cached) {
    onDelta(cached.text);
    return { ...cached, cached: true };
  }
  // Coalesce with an identical in-flight request (typically a hover-prefetch):
  // wait for it and replay its text as one delta rather than calling the model
  // a second time.
  const pending = tcInflight.get(key);
  if (pending) {
    const r = await pending;
    onDelta(r.text);
    return { ...r, cached: true };
  }
  const result = await tcOpenAITranslateStream(text, target, settings, context, onDelta, signal);
  if (result.text) tcCacheSet(key, result);
  return result;
}

globalThis.tcTranslate = tcTranslate;
globalThis.tcTranslateStream = tcTranslateStream;
globalThis.tcExplainStream = tcExplainStream;
