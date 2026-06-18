/* vocab-app.js — the 生词本 management page (search, sort, notes, TTS, import/export). */

(async function () {
  const $ = (id) => document.getElementById(id);
  const listEl = $('list');
  const countEl = $('count');
  const searchEl = $('search');
  const sortEl = $('sort');
  let all = [];

  // Inline line-icons (Lucide) — only used for our own buttons, never user text.
  const stroke =
    'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';
  const ICON = {
    speak: `<svg viewBox="0 0 24 24" ${stroke}><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>`,
    edit: `<svg viewBox="0 0 24 24" ${stroke}><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>`,
    trash: `<svg viewBox="0 0 24 24" ${stroke}><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`,
  };

  // --- formatting helpers ------------------------------------------------

  const pad2 = (n) => String(n).padStart(2, '0');

  function fmtTime(ts) {
    const d = new Date(ts || Date.now());
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ` +
      `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  }

  function langName(code) {
    const hit = typeof TC_LANGUAGES !== 'undefined' && TC_LANGUAGES.find((l) => l.code === code);
    return hit ? hit.name : code || '';
  }

  function providerName(p) {
    return (typeof TC_PROVIDER_NAMES !== 'undefined' && TC_PROVIDER_NAMES[p]) || p || '';
  }

  function updateReviewBtn() {
    const due = all.filter((e) => (e.due == null ? true : e.due <= Date.now())).length;
    const b = $('reviewBtn');
    if (b) b.textContent = due ? `复习 (${due})` : '复习';
  }

  // --- render ------------------------------------------------------------

  function sortItems(items) {
    const mode = sortEl.value;
    const arr = items.slice();
    if (mode === 'old') arr.sort((a, b) => (a.savedAt || 0) - (b.savedAt || 0));
    else if (mode === 'az') arr.sort((a, b) => (a.text || '').localeCompare(b.text || ''));
    else if (mode === 'lang')
      arr.sort((a, b) => (a.target || '').localeCompare(b.target || '') || (b.savedAt || 0) - (a.savedAt || 0));
    else arr.sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0)); // 'new' (default)
    return arr;
  }

  function render() {
    const q = searchEl.value.trim().toLowerCase();
    const filtered = q
      ? all.filter((e) => (e.text + ' ' + e.translation + ' ' + (e.notes || '')).toLowerCase().includes(q))
      : all;
    const items = sortItems(filtered);
    updateReviewBtn();

    countEl.textContent = q ? `${items.length} / ${all.length}` : `共 ${all.length} 条`;
    listEl.textContent = '';

    if (!items.length) {
      const empty = document.createElement('div');
      empty.className = 'empty';
      empty.textContent = all.length ? '没有匹配的词条' : '还没有收藏。在翻译卡片上点书签图标即可收藏。';
      listEl.appendChild(empty);
      return;
    }

    for (const e of items) listEl.appendChild(renderItem(e));
  }

  function iconBtn(svg, title, onClick) {
    const b = document.createElement('button');
    b.className = 'ico-btn';
    b.title = title;
    b.innerHTML = svg;
    b.addEventListener('click', onClick);
    return b;
  }

  function renderItem(e) {
    const item = document.createElement('div');
    item.className = 'item';

    const main = document.createElement('div');
    main.className = 'main';

    const src = document.createElement('div');
    src.className = 'src';
    src.textContent = e.text;
    const tr = document.createElement('div');
    tr.className = 'tr';
    tr.textContent = e.translation;
    main.appendChild(src);
    main.appendChild(tr);

    if (e.notes) {
      const note = document.createElement('div');
      note.className = 'note';
      note.textContent = e.notes;
      note.title = '点击编辑备注';
      note.addEventListener('click', () => editNote(e, main, note));
      main.appendChild(note);
    }

    main.appendChild(buildMeta(e));

    const actions = document.createElement('div');
    actions.className = 'row-actions';
    actions.appendChild(iconBtn(ICON.speak, '朗读原文', () => speak(e)));
    actions.appendChild(iconBtn(ICON.edit, e.notes ? '编辑备注' : '添加备注', () =>
      editNote(e, main, main.querySelector('.note')),
    ));
    const del = iconBtn(ICON.trash, '删除', async () => {
      all = await tcVocabRemove(e.id);
      render();
    });
    del.classList.add('del');
    actions.appendChild(del);

    item.appendChild(main);
    item.appendChild(actions);
    return item;
  }

  function buildMeta(e) {
    const meta = document.createElement('div');
    meta.className = 'meta';
    const lang = document.createElement('span');
    lang.className = 'pill';
    lang.textContent = langName(e.target);
    meta.appendChild(lang);
    if (e.provider) {
      const pv = document.createElement('span');
      pv.className = 'pill';
      pv.textContent = providerName(e.provider);
      meta.appendChild(pv);
    }
    const time = document.createElement('span');
    time.textContent = fmtTime(e.savedAt);
    meta.appendChild(time);
    if (e.url) {
      const a = document.createElement('a');
      a.href = e.url;
      a.target = '_blank';
      a.rel = 'noreferrer';
      a.textContent = e.title || e.url;
      meta.appendChild(a);
    }
    return meta;
  }

  // Replace the note line (or append) with an input; commit on Enter/blur.
  function editNote(entry, main, noteEl) {
    if (main.querySelector('.note-input')) return; // already editing
    const input = document.createElement('input');
    input.className = 'note-input';
    input.value = entry.notes || '';
    input.placeholder = '添加备注…';
    if (noteEl) noteEl.replaceWith(input);
    else main.appendChild(input);
    input.focus();

    let done = false;
    const commit = async () => {
      if (done) return;
      done = true;
      const val = input.value.trim();
      if (val !== (entry.notes || '')) all = await tcVocabUpdate(entry.id, { notes: val });
      render();
    };
    input.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') {
        ev.preventDefault();
        commit();
      } else if (ev.key === 'Escape') {
        done = true;
        render();
      }
    });
    input.addEventListener('blur', commit);
  }

  function speak(entry) {
    if (!window.speechSynthesis) return;
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(entry.text);
      if (entry.source) u.lang = entry.source; // detected source lang, when known
      speechSynthesis.speak(u);
    } catch (_) {
      /* ignore */
    }
  }

  // --- import / export ---------------------------------------------------

  function download(filename, content, mime) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function stamp() {
    const d = new Date();
    return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}`;
  }

  // Quote a CSV cell only when it contains a delimiter, quote, or newline.
  function csvCell(s) {
    s = String(s == null ? '' : s);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function exportCsv() {
    if (!all.length) return;
    const head = ['原文', '译文', '目标语言', '引擎', '备注', '时间', '网址'];
    const rows = all.map((e) =>
      [e.text, e.translation, langName(e.target), providerName(e.provider), e.notes, fmtTime(e.savedAt), e.url]
        .map(csvCell)
        .join(','),
    );
    // Leading BOM so Excel detects UTF-8 and renders CJK correctly.
    const bom = String.fromCharCode(0xfeff);
    download(`生词本-${stamp()}.csv`, bom + head.join(',') + '\n' + rows.join('\n'),
      'text/csv;charset=utf-8');
  }

  // Anki imports tab-separated text; newlines/tabs in a field would break rows.
  function tsvCell(s) {
    return String(s == null ? '' : s).replace(/\t/g, ' ').replace(/\r?\n/g, '<br>');
  }

  function exportAnki() {
    if (!all.length) return;
    const lines = all.map((e) => {
      let back = e.translation;
      if (e.notes) back += '<br><br>📝 ' + e.notes;
      if (e.context) back += '<br><br>' + e.context;
      return tsvCell(e.text) + '\t' + tsvCell(back);
    });
    download(`生词本-anki-${stamp()}.txt`, lines.join('\n'), 'text/plain;charset=utf-8');
  }

  function exportJson() {
    if (!all.length) return;
    // Full lossless backup — re-importable via the 导入 button.
    download(`生词本-备份-${stamp()}.json`, JSON.stringify(all, null, 2),
      'application/json;charset=utf-8');
  }

  async function importFile(file) {
    try {
      const data = JSON.parse(await file.text());
      const arr = Array.isArray(data) ? data : Array.isArray(data && data.entries) ? data.entries : null;
      if (!arr) throw new Error('not an array');
      const before = all.length;
      all = await tcVocabImport(arr);
      render();
      alert(`导入完成：当前共 ${all.length} 条（新增 ${Math.max(0, all.length - before)} 条）。`);
    } catch (_) {
      alert('导入失败：文件不是有效的生词本 JSON。');
    }
  }

  // --- wiring ------------------------------------------------------------

  $('reviewBtn').addEventListener('click', () => (location.href = 'review.html'));
  searchEl.addEventListener('input', render);
  sortEl.addEventListener('change', render);
  $('exportCsv').addEventListener('click', exportCsv);
  $('exportAnki').addEventListener('click', exportAnki);
  $('exportJson').addEventListener('click', exportJson);
  $('importBtn').addEventListener('click', () => $('importFile').click());
  $('importFile').addEventListener('change', (ev) => {
    const file = ev.target.files && ev.target.files[0];
    if (file) importFile(file);
    ev.target.value = ''; // allow re-importing the same file
  });
  $('clearAll').addEventListener('click', async () => {
    if (!all.length) return;
    if (!confirm('确定清空整个生词本？此操作不可恢复。')) return;
    await tcVocabClear();
    all = [];
    render();
  });

  all = await tcVocabAll();
  render();

  // Live-update when a card (or another tab) changes the store.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes[TC_VOCAB_KEY]) {
      all = changes[TC_VOCAB_KEY].newValue || [];
      render();
    }
  });
})();
