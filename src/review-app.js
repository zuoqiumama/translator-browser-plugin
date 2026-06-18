/* review-app.js — spaced-repetition flashcard review. */

(async function () {
  const stage = document.getElementById('stage');
  const progressEl = document.getElementById('progress');

  let queue = await tcVocabDue(); // snapshot of cards due now
  let pos = 0;
  let flipped = false;
  const stats = { graded: 0, again: 0, initial: queue.length };

  function langName(code) {
    const hit = typeof TC_LANGUAGES !== 'undefined' && TC_LANGUAGES.find((l) => l.code === code);
    return hit ? hit.name : code || '';
  }
  function providerName(p) {
    return (typeof TC_PROVIDER_NAMES !== 'undefined' && TC_PROVIDER_NAMES[p]) || p || '';
  }

  function speak(entry) {
    if (!window.speechSynthesis) return;
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(entry.text);
      if (entry.source) u.lang = entry.source;
      speechSynthesis.speak(u);
    } catch (_) {
      /* ignore */
    }
  }

  function button(label, cls, onClick) {
    const b = document.createElement('button');
    b.className = cls;
    b.textContent = label;
    b.addEventListener('click', onClick);
    return b;
  }

  function render() {
    if (pos >= queue.length) return renderDone();
    const e = queue[pos];
    progressEl.textContent = `已复习 ${stats.graded} · 剩 ${queue.length - pos}`;
    stage.textContent = '';

    const card = document.createElement('div');
    card.className = flipped ? 'card flip' : 'card';

    const word = document.createElement('div');
    word.className = 'word';
    word.textContent = e.text;
    card.appendChild(word);

    if (!flipped) {
      const hint = document.createElement('div');
      hint.className = 'hint';
      hint.textContent = '点击或按空格显示答案';
      card.appendChild(hint);
      card.addEventListener('click', flip);
    } else {
      const div = document.createElement('div');
      div.className = 'divider';
      card.appendChild(div);

      const ans = document.createElement('div');
      ans.className = 'answer';
      ans.textContent = e.translation;
      card.appendChild(ans);

      if (e.notes) {
        const n = document.createElement('div');
        n.className = 'note';
        n.textContent = '📝 ' + e.notes;
        card.appendChild(n);
      }
      if (e.context) {
        const c = document.createElement('div');
        c.className = 'ctx';
        c.textContent = e.context.length > 140 ? e.context.slice(0, 140) + '…' : e.context;
        card.appendChild(c);
      }

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
      card.appendChild(meta);
    }
    stage.appendChild(card);

    const actions = document.createElement('div');
    actions.className = 'actions';
    actions.appendChild(button('🔊 朗读', 'ghost', () => speak(e)));
    if (!flipped) {
      actions.appendChild(button('显示答案 (空格)', 'good', flip));
    } else {
      actions.appendChild(button('不认识 (1)', 'again', () => grade(false)));
      actions.appendChild(button('认识 (2)', 'good', () => grade(true)));
    }
    stage.appendChild(actions);
  }

  function flip() {
    if (flipped) return;
    flipped = true;
    render();
  }

  async function grade(known) {
    const e = queue[pos];
    await tcVocabGrade(e.id, known);
    stats.graded += 1;
    if (!known) {
      stats.again += 1;
      queue.push(e); // re-review later this same session
    }
    pos += 1;
    flipped = false;
    render();
  }

  function renderDone() {
    progressEl.textContent = '';
    stage.textContent = '';
    const done = document.createElement('div');
    done.className = 'done';

    const big = document.createElement('div');
    big.className = 'big';
    big.textContent = stats.initial ? '🎉' : '☕';
    const msg = document.createElement('div');
    msg.className = 'msg';
    msg.textContent = stats.initial
      ? `复习完成！本次评定 ${stats.graded} 次，其中 ${stats.again} 次标记为需再练。`
      : '现在没有到期需要复习的词。去读点东西、收藏几个新词吧。';

    done.appendChild(big);
    done.appendChild(msg);
    done.appendChild(button('返回生词本', 'ghost', () => (location.href = 'vocab.html')));
    stage.appendChild(done);
  }

  document.addEventListener('keydown', (ev) => {
    if (pos >= queue.length) return;
    if (ev.key === ' ') {
      ev.preventDefault();
      if (!flipped) flip();
    } else if (flipped && ev.key === '1') {
      grade(false);
    } else if (flipped && ev.key === '2') {
      grade(true);
    }
  });

  render();
})();
