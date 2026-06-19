const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');

function loadTranslators(fetchImpl) {
  return loadTranslatorsWith({ fetch: fetchImpl });
}

// Like loadTranslators but lets a test override any of the injected globals
// (e.g. the cache stubs) so streaming/cache behavior can be exercised.
function loadTranslatorsWith(overrides) {
  const context = vm.createContext({
    fetch: async () => { throw new Error('no fetch configured'); },
    TextDecoder,
    tcLangName: (code) => code,
    tcCacheKey: (...a) => a.join('|'),
    tcCacheGet: () => undefined,
    tcCacheSet: () => {},
    ...overrides,
  });
  const source = fs.readFileSync(path.join(ROOT, 'src', 'translators.js'), 'utf8');
  vm.runInContext(source, context, { filename: 'src/translators.js' });
  return context;
}

// Build a fake streaming Response whose body yields the given SSE text chunks.
function streamingResponse(chunks) {
  const encoder = new TextEncoder();
  let i = 0;
  return {
    ok: true,
    status: 200,
    body: {
      getReader() {
        return {
          read() {
            if (i < chunks.length) {
              return Promise.resolve({ done: false, value: encoder.encode(chunks[i++]) });
            }
            return Promise.resolve({ done: true, value: undefined });
          },
        };
      },
    },
  };
}

test('OpenAI-compatible errors include a top-level provider message', async () => {
  const context = loadTranslators(async () => ({
    ok: false,
    status: 403,
    json: async () => ({
      code: 30001,
      message: 'Sorry, your account balance is insufficient',
      data: null,
    }),
  }));

  await assert.rejects(
    context.tcOpenAITranslate(
      'Hello',
      'zh-CN',
      {
        openaiBaseUrl: 'https://api.siliconflow.cn/v1',
        openaiModel: 'tencent/Hunyuan-MT-7B',
        openaiKey: 'test-key',
      },
      '',
    ),
    /403.*account balance is insufficient/,
  );
});

test('streaming translation emits deltas in order and returns the joined text', async () => {
  const sse = [
    'data: {"choices":[{"delta":{"content":"你好"}}]}\n\n',
    'data: {"choices":[{"delta":{"content":"，世界"}}]}\n\n',
    'data: [DONE]\n\n',
  ];
  const context = loadTranslators(async () => streamingResponse(sse));

  const deltas = [];
  const result = await context.tcOpenAITranslateStream(
    'Hello, world',
    'zh-CN',
    { openaiBaseUrl: 'https://api.openai.com/v1', openaiModel: 'gpt-4o-mini', openaiKey: 'k' },
    '',
    (d) => deltas.push(d),
  );

  assert.deepEqual(deltas, ['你好', '，世界']);
  assert.equal(result.text, '你好，世界');
  assert.equal(result.provider, 'openai');
});

test('streaming translation forwards the AbortSignal to fetch', async () => {
  let seenSignal;
  const context = loadTranslators(async (_url, opts) => {
    seenSignal = opts && opts.signal;
    return streamingResponse([
      'data: {"choices":[{"delta":{"content":"x"}}]}\n\n',
      'data: [DONE]\n\n',
    ]);
  });

  const ac = new AbortController();
  await context.tcOpenAITranslateStream('Hi', 'zh-CN', { openaiKey: 'k' }, '', () => {}, ac.signal);
  assert.equal(seenSignal, ac.signal);
});

test('tcTranslateStream replays a cache hit as one delta without a network call', async () => {
  let fetchCalls = 0;
  const context = loadTranslatorsWith({
    fetch: async () => { fetchCalls++; throw new Error('cache hit should not fetch'); },
    tcCacheGet: () => ({ text: '缓存的译文', detected: '', provider: 'openai' }),
  });

  const deltas = [];
  const result = await context.tcTranslateStream(
    'Hello',
    'zh-CN',
    { openaiKey: 'k' },
    '',
    (d) => deltas.push(d),
  );

  assert.equal(fetchCalls, 0);
  assert.equal(result.cached, true);
  assert.equal(result.text, '缓存的译文');
  assert.deepEqual(deltas, ['缓存的译文']);
});

test('tcTranslateStream streams and stores a result on a cache miss', async () => {
  let stored = null;
  const context = loadTranslatorsWith({
    fetch: async () => streamingResponse([
      'data: {"choices":[{"delta":{"content":"世界"}}]}\n\n',
      'data: [DONE]\n\n',
    ]),
    tcCacheGet: () => undefined,
    tcCacheSet: (_key, value) => { stored = value; },
  });

  const result = await context.tcTranslateStream('world', 'zh-CN', { openaiKey: 'k' }, '', () => {});

  assert.equal(result.text, '世界');
  assert.ok(!result.cached);
  assert.equal(stored && stored.text, '世界'); // finished text was cached for re-opens
});

test('a streamed click coalesces onto an in-flight prefetch (one model call)', async () => {
  let fetchCalls = 0;
  let release;
  const gate = new Promise((r) => { release = r; });
  const context = loadTranslatorsWith({
    tcCacheKey: (...a) => a.join('|'),
    fetch: async () => {
      fetchCalls++;
      await gate; // hold the (non-streaming) prefetch request open
      return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: '你好' } }] }) };
    },
  });

  const settings = { provider: 'openai', openaiKey: 'k' };
  // Prefetch starts (non-streaming) and blocks on the gate, registering in-flight.
  const prefetch = context.tcTranslate('Hello', 'zh-CN', settings, '');
  // The streamed click for the same key arrives before the prefetch resolves.
  const deltas = [];
  const click = context.tcTranslateStream('Hello', 'zh-CN', settings, '', (d) => deltas.push(d));
  release();
  const [, clickResult] = await Promise.all([prefetch, click]);

  assert.equal(fetchCalls, 1); // exactly one model call for both
  assert.equal(clickResult.text, '你好');
  assert.equal(clickResult.cached, true);
  assert.deepEqual(deltas, ['你好']); // prefetch result replayed as a single delta
});
