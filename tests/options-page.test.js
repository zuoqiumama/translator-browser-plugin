const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');

function makeElement(id, tagName = 'INPUT', type = 'text') {
  const listeners = new Map();
  const classes = new Set();
  return {
    id,
    tagName,
    type,
    value: '',
    checked: false,
    textContent: '',
    dataset: {},
    classList: {
      add: (...names) => names.forEach((name) => classes.add(name)),
      remove: (...names) => names.forEach((name) => classes.delete(name)),
      toggle: (name, force) => {
        const shouldAdd = force === undefined ? !classes.has(name) : force;
        if (shouldAdd) classes.add(name);
        else classes.delete(name);
      },
    },
    appendChild() {},
    addEventListener(name, handler) {
      listeners.set(name, handler);
    },
    listener(name) {
      return listeners.get(name);
    },
  };
}

function createOptionsHarness() {
  const selectIds = new Set(['targetLang', 'triggerMode', 'theme', 'provider']);
  const checkboxIds = new Set([
    'showOriginal',
    'enableTTS',
    'lensEnabled',
    'contextAware',
    'deeplPro',
  ]);
  const ids = [
    ...selectIds,
    ...checkboxIds,
    'deeplKey',
    'openaiBaseUrl',
    'openaiModel',
    'openaiKey',
    'openVocab',
    'deeplSection',
    'saved',
    'grantBtn',
    'grantStatus',
    'llmTestBtn',
    'llmTestInput',
    'llmTestResult',
    'testBtn',
    'testInput',
    'testResult',
  ];
  const elements = Object.fromEntries(
    ids.map((id) => [
      id,
      makeElement(
        id,
        selectIds.has(id) ? 'SELECT' : id.endsWith('Btn') || id === 'openVocab' ? 'BUTTON' : 'INPUT',
        checkboxIds.has(id) ? 'checkbox' : 'text',
      ),
    ]),
  );
  const compareBoxes = ['bing', 'google', 'deepl', 'openai'].map((provider) => {
    const box = makeElement(`cmp-${provider}`, 'INPUT', 'checkbox');
    box.dataset.cmp = provider;
    return box;
  });

  const pendingWrites = [];
  const sentMessages = [];
  const chrome = {
    storage: {
      sync: {
        set(value) {
          return new Promise((resolve) => pendingWrites.push({ value, resolve }));
        },
      },
    },
    tabs: { create() {} },
    runtime: {
      getURL: (value) => value,
      sendMessage(message) {
        sentMessages.push(message);
        return Promise.resolve({ text: '你好' });
      },
    },
    permissions: {
      contains: async () => true,
      request: async () => true,
    },
  };
  const document = {
    getElementById: (id) => elements[id],
    querySelectorAll: () => compareBoxes,
    createElement: () => makeElement('', 'OPTION', ''),
  };
  const context = vm.createContext({
    chrome,
    document,
    URL,
    clearTimeout,
    setTimeout,
    TC_LANGUAGES: [{ code: 'zh-CN', name: '中文', en: 'Chinese' }],
    tcGetSettings: async () => ({
      targetLang: 'zh-CN',
      triggerMode: 'button',
      theme: 'auto',
      showOriginal: true,
      enableTTS: true,
      lensEnabled: false,
      contextAware: false,
      provider: 'openai',
      deeplKey: '',
      deeplPro: false,
      openaiBaseUrl: 'https://api.openai.com/v1',
      openaiModel: 'gpt-4o-mini',
      openaiKey: '',
      compareProviders: ['bing'],
    }),
  });

  return { context, elements, pendingWrites, sentMessages };
}

test('settings switches use clickable label controls', () => {
  const html = fs.readFileSync(path.join(ROOT, 'src', 'options.html'), 'utf8');
  const switches = [...html.matchAll(/<(span|label)\s+class="switch"/g)];

  assert.ok(switches.length >= 9, 'expected all settings switches to be present');
  assert.equal(
    switches.every((match) => match[1] === 'label'),
    true,
    'visible switch tracks must be labels so clicking them toggles the checkbox',
  );
});

test('settings switches keep their compact fixed width', () => {
  const html = fs.readFileSync(path.join(ROOT, 'src', 'options.html'), 'utf8');

  assert.doesNotMatch(
    html,
    /\.field\s+label\s*\{\s*flex:\s*1/,
    'generic field label styling must not stretch switch labels',
  );
  assert.match(
    html,
    /\.switch\s*\{[^}]*flex:\s*0\s+0\s+42px/,
    'switch controls must retain their 42px track width',
  );
});

test('LLM configuration is independent from the default provider section', () => {
  const html = fs.readFileSync(path.join(ROOT, 'src', 'options.html'), 'utf8');
  const engineCardStart = html.indexOf('<h2>翻译引擎</h2>');
  const llmCardStart = html.indexOf('<h2>大模型配置</h2>');
  const compareCardStart = html.indexOf('<h2>多引擎对照</h2>');

  assert.ok(engineCardStart >= 0, 'default provider card must exist');
  assert.ok(llmCardStart > engineCardStart, 'LLM configuration must be a separate later card');
  assert.ok(compareCardStart > llmCardStart, 'LLM configuration should appear before compare settings');
  assert.doesNotMatch(
    html.slice(engineCardStart, llmCardStart),
    /openaiBaseUrl|openaiModel|openaiKey/,
    'LLM connection fields must not live inside the default provider card',
  );
  assert.doesNotMatch(
    html.slice(llmCardStart, compareCardStart),
    /class="hidden"/,
    'LLM configuration must remain visible regardless of the default provider',
  );
});

test('LLM connection test explicitly uses the OpenAI-compatible provider', async () => {
  const harness = createOptionsHarness();
  const source = fs.readFileSync(path.join(ROOT, 'src', 'options.js'), 'utf8');
  vm.runInContext(source, harness.context, { filename: 'src/options.js' });
  await new Promise((resolve) => setImmediate(resolve));

  harness.elements.llmTestInput.value = 'Hello';
  await harness.elements.llmTestBtn.listener('click')();

  assert.equal(harness.sentMessages.length, 1);
  assert.equal(harness.sentMessages[0].provider, 'openai');
});

test('test translation waits for pending settings writes', async () => {
  const harness = createOptionsHarness();
  const source = fs.readFileSync(path.join(ROOT, 'src', 'options.js'), 'utf8');
  vm.runInContext(source, harness.context, { filename: 'src/options.js' });
  await new Promise((resolve) => setImmediate(resolve));

  const keyInput = harness.elements.openaiKey;
  keyInput.value = 'new-key';
  (keyInput.listener('input') || keyInput.listener('change'))();

  harness.elements.testInput.value = 'Hello';
  const testPromise = harness.elements.testBtn.listener('click')();
  await Promise.resolve();

  assert.equal(
    harness.sentMessages.length,
    0,
    'translation must not start until the latest settings write has completed',
  );

  harness.pendingWrites.shift().resolve();
  await testPromise;
  assert.equal(harness.sentMessages.length, 1);
});
