const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');

function makeElement() {
  const listeners = new Map();
  const classes = new Set();
  return {
    value: '',
    textContent: '',
    href: '',
    focused: false,
    classList: {
      toggle: (name, force) => {
        const shouldAdd = force === undefined ? !classes.has(name) : force;
        if (shouldAdd) classes.add(name);
        else classes.delete(name);
      },
      add: (name) => classes.add(name),
      remove: (name) => classes.delete(name),
      contains: (name) => classes.has(name),
    },
    focus() {
      this.focused = true;
    },
    addEventListener(name, handler) {
      listeners.set(name, handler);
    },
    listener(name) {
      return listeners.get(name);
    },
    remove() {},
    select() {},
  };
}

function loadFeedback({ search = '' } = {}) {
  const ids = [
    'type', 'title', 'desc', 'steps', 'stepsRow', 'page',
    'submit', 'copy', 'status', 'envLine', 'issuesLink', 'repoLink',
  ];
  const elements = Object.fromEntries(ids.map((id) => [id, makeElement()]));
  elements.type.value = 'bug';

  const opened = [];
  const copied = [];
  const context = {
    chrome: { runtime: { getManifest: () => ({ version: '9.9.9' }) } },
    navigator: {
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
      userAgentData: { platform: 'Windows' },
      platform: 'Win32',
      clipboard: { writeText: async (t) => copied.push(t) },
    },
    window: { open: (url, target, feat) => opened.push({ url, target, feat }) },
    location: { search },
    document: {
      getElementById: (id) => elements[id],
      createElement: () => makeElement(),
      body: { appendChild() {} },
    },
    URL,
    URLSearchParams,
    setTimeout,
    clearTimeout,
  };
  vm.createContext(context);
  const source = fs.readFileSync(path.join(ROOT, 'src', 'feedback.js'), 'utf8');
  vm.runInContext(source, context, { filename: 'src/feedback.js' });
  return { elements, opened, copied };
}

test('environment line shows version, browser and OS', () => {
  const { elements } = loadFeedback();
  assert.match(elements.envLine.textContent, /9\.9\.9/);
  assert.match(elements.envLine.textContent, /Chrome 130/);
  assert.match(elements.envLine.textContent, /Windows/);
});

test('footer links point at the project repo and issues', () => {
  const { elements } = loadFeedback();
  assert.equal(elements.repoLink.href, 'https://github.com/zuoqiumama/translator-browser-plugin');
  assert.equal(elements.issuesLink.href, 'https://github.com/zuoqiumama/translator-browser-plugin/issues');
});

test('submit without a description does not open GitHub and flags an error', () => {
  const { elements, opened } = loadFeedback();
  elements.desc.value = '   ';
  elements.submit.listener('click')();
  assert.equal(opened.length, 0, 'must not open GitHub with an empty description');
  assert.equal(elements.desc.focused, true);
  assert.ok(elements.status.classList.contains('err'));
});

test('submit builds a prefilled new-issue URL with title, body and label', () => {
  const { elements, opened } = loadFeedback();
  elements.type.value = 'bug';
  elements.title.value = 'DeepL 报错';
  elements.desc.value = '点击翻译后卡片空白';
  elements.steps.value = '1. 选中\n2. 点击';
  elements.submit.listener('click')();

  assert.equal(opened.length, 1);
  const url = new URL(opened[0].url);
  assert.equal(url.origin + url.pathname, 'https://github.com/zuoqiumama/translator-browser-plugin/issues/new');
  assert.equal(url.searchParams.get('labels'), 'bug');
  assert.equal(url.searchParams.get('title'), '[Bug] DeepL 报错');
  const body = url.searchParams.get('body');
  assert.match(body, /点击翻译后卡片空白/);
  assert.match(body, /复现步骤/);
  assert.match(body, /扩展版本: 9\.9\.9/);
});

test('empty title is auto-derived from the first line of the description', () => {
  const { elements, opened } = loadFeedback();
  elements.type.value = 'feature';
  elements.title.value = '';
  elements.desc.value = '希望支持夜间自动切换\n第二行不要';
  elements.submit.listener('click')();

  const url = new URL(opened[0].url);
  assert.equal(url.searchParams.get('title'), '[建议] 希望支持夜间自动切换');
  assert.equal(url.searchParams.get('labels'), 'enhancement');
  // non-bug types omit the 复现步骤 section even if steps has stale text
  assert.doesNotMatch(url.searchParams.get('body'), /复现步骤/);
});

test('deep link ?type=question preselects the question type', () => {
  const { elements, opened } = loadFeedback({ search: '?type=question' });
  assert.equal(elements.type.value, 'question');
  elements.desc.value = '怎么配置本地模型？';
  elements.submit.listener('click')();
  assert.equal(new URL(opened[0].url).searchParams.get('labels'), 'question');
});

test('copy puts the title and body on the clipboard', () => {
  const { elements, copied } = loadFeedback();
  elements.desc.value = '一些反馈';
  elements.copy.listener('click')();
  return Promise.resolve().then(() => {
    assert.equal(copied.length, 1);
    assert.match(copied[0], /一些反馈/);
  });
});
