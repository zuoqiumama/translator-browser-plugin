/*
 * feedback.js — turn the feedback form into a prefilled GitHub issue.
 *
 * No backend and no token: we build a `…/issues/new?title=&body=&labels=` URL
 * and hand off to the browser, so the report lands in the project's GitHub
 * issues the moment the user confirms it there. A "copy" fallback lets people
 * without a GitHub login send the same text another way.
 */
(function () {
  const REPO = 'https://github.com/zuoqiumama/translator-browser-plugin';
  const NEW_ISSUE = REPO + '/issues/new';
  const ISSUES = REPO + '/issues';

  const $ = (id) => document.getElementById(id);

  // type → { GitHub label, title tag, whether 复现步骤 applies }
  const TYPES = {
    bug: { label: 'bug', tag: '[Bug] ', steps: true },
    feature: { label: 'enhancement', tag: '[建议] ', steps: false },
    question: { label: 'question', tag: '[问题] ', steps: false },
    other: { label: '', tag: '', steps: false },
  };

  // --- environment, collected automatically and shown for transparency ------

  function browserName(ua) {
    let m;
    if ((m = ua.match(/Edg\/([\d.]+)/))) return 'Edge ' + m[1];
    if ((m = ua.match(/OPR\/([\d.]+)/))) return 'Opera ' + m[1];
    if ((m = ua.match(/Firefox\/([\d.]+)/))) return 'Firefox ' + m[1];
    if ((m = ua.match(/Chrome\/([\d.]+)/))) return 'Chrome ' + m[1];
    return ua.slice(0, 60);
  }

  const ua = navigator.userAgent;
  let version = '';
  try {
    version = chrome.runtime.getManifest().version;
  } catch (_) {
    /* opened outside the extension — leave version blank */
  }
  const browser = browserName(ua);
  const os =
    (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || '未知';

  $('envLine').textContent = `扩展 v${version || '?'} · ${browser} · ${os}`;

  // --- form behaviour -------------------------------------------------------

  function currentType() {
    return TYPES[$('type').value] || TYPES.other;
  }

  function syncSteps() {
    $('stepsRow').classList.toggle('hidden', !currentType().steps);
  }

  // Allow deep links such as feedback.html?type=bug from the About card / popup.
  const params = new URLSearchParams(location.search);
  if (TYPES[params.get('type')]) $('type').value = params.get('type');
  syncSteps();
  $('type').addEventListener('change', syncSteps);

  function buildTitle() {
    const t = currentType();
    const raw = $('title').value.trim();
    if (raw) return t.tag + raw;
    const firstLine = $('desc').value.trim().split('\n')[0].slice(0, 60);
    return t.tag + (firstLine || '反馈');
  }

  function buildBody() {
    const t = currentType();
    const desc = $('desc').value.trim();
    const steps = $('steps').value.trim();
    const page = $('page').value.trim();

    const parts = [desc || '（请描述你遇到的问题或建议）'];
    if (t.steps && steps) parts.push('\n### 复现步骤\n' + steps);
    parts.push('\n---\n**环境 / Environment**');
    parts.push('- 扩展版本: ' + (version || '未知'));
    parts.push('- 浏览器: ' + browser);
    parts.push('- 系统: ' + os);
    if (page) parts.push('- 页面: ' + page);
    parts.push('- UA: `' + ua + '`');
    return parts.join('\n');
  }

  function issueUrl() {
    const t = currentType();
    const u = new URL(NEW_ISSUE);
    u.searchParams.set('title', buildTitle());
    u.searchParams.set('body', buildBody());
    if (t.label) u.searchParams.set('labels', t.label);
    return u.toString();
  }

  let statusTimer = null;
  function flash(msg, isErr) {
    const s = $('status');
    s.textContent = msg;
    s.classList.toggle('err', !!isErr);
    s.classList.add('show');
    clearTimeout(statusTimer);
    statusTimer = setTimeout(() => s.classList.remove('show'), 2600);
  }

  $('submit').addEventListener('click', () => {
    if (!$('desc').value.trim()) {
      flash('请先填写详细描述', true);
      $('desc').focus();
      return;
    }
    // User-gesture window.open is not popup-blocked; opens GitHub's prefilled
    // new-issue page where the user reviews and submits.
    window.open(issueUrl(), '_blank', 'noopener');
    flash('已打开 GitHub，请在新标签页确认后提交 ✓');
  });

  $('copy').addEventListener('click', async () => {
    const text = buildTitle() + '\n\n' + buildBody();
    try {
      await navigator.clipboard.writeText(text);
      flash('已复制反馈内容 ✓');
    } catch (_) {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      let ok = false;
      try {
        ok = document.execCommand('copy');
      } catch (e) {
        ok = false;
      }
      ta.remove();
      flash(ok ? '已复制反馈内容 ✓' : '复制失败，请手动选择文本', !ok);
    }
  });

  $('issuesLink').href = ISSUES;
  $('repoLink').href = REPO;
})();
