/*
 * vocab.js — the saved-words store ("生词本"), backed by chrome.storage.local.
 *
 * Loaded BOTH as a content script (so the card's bookmark button can save) and
 * by the management page (src/vocab.html). storage.local is used instead of
 * storage.sync because a growing word list would blow past sync's ~100KB quota;
 * local holds ~5MB — plenty for thousands of entries.
 *
 * Entry shape: { id, text, translation, target, provider, context, url, title, savedAt }.
 * Entries are keyed by (text, target): saving the same phrase again refreshes
 * its translation and moves it to the front instead of duplicating.
 */

const TC_VOCAB_KEY = 'tc_vocab';

/** Short, collision-resistant id for an entry. */
function tcVocabId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/** The full list (newest first), or [] when empty/unset. */
async function tcVocabAll() {
  const obj = await chrome.storage.local.get(TC_VOCAB_KEY);
  const list = obj && obj[TC_VOCAB_KEY];
  return Array.isArray(list) ? list : [];
}

/** True when an entry for this (text, target) already exists. */
async function tcVocabHas(text, target) {
  const list = await tcVocabAll();
  return list.some((e) => e.text === text && e.target === target);
}

/** Add or update an entry (keyed by text+target), placing it at the front. */
async function tcVocabAdd(entry) {
  const list = await tcVocabAll();
  const prev = list.find((e) => e.text === entry.text && e.target === entry.target);
  const rest = list.filter((e) => !(e.text === entry.text && e.target === entry.target));
  const merged = {
    id: (prev && prev.id) || tcVocabId(),
    text: entry.text || '',
    translation: entry.translation || '',
    target: entry.target || '',
    source: entry.source || (prev && prev.source) || '', // detected source lang (for TTS)
    provider: entry.provider || '',
    context: entry.context || '',
    notes: entry.notes !== undefined ? entry.notes : (prev && prev.notes) || '',
    url: entry.url || '',
    title: entry.title || '',
    savedAt: Date.now(),
    box: (prev && prev.box) || 0, // spaced-repetition box; new cards are due now
    due: (prev && prev.due) || Date.now(),
    reps: (prev && prev.reps) || 0,
    lapses: (prev && prev.lapses) || 0,
  };
  const next = [merged, ...rest];
  await chrome.storage.local.set({ [TC_VOCAB_KEY]: next });
  return next;
}

/** Remove an entry by id. Returns the new list. */
async function tcVocabRemove(id) {
  const next = (await tcVocabAll()).filter((e) => e.id !== id);
  await chrome.storage.local.set({ [TC_VOCAB_KEY]: next });
  return next;
}

/** Remove by the (text, target) pair — used by the card's save toggle. */
async function tcVocabRemoveEntry(text, target) {
  const next = (await tcVocabAll()).filter((e) => !(e.text === text && e.target === target));
  await chrome.storage.local.set({ [TC_VOCAB_KEY]: next });
  return next;
}

/** Empty the whole store. */
async function tcVocabClear() {
  await chrome.storage.local.set({ [TC_VOCAB_KEY]: [] });
}

/** Patch fields of an entry by id (keeps its position). Used for inline notes. */
async function tcVocabUpdate(id, patch) {
  const next = (await tcVocabAll()).map((e) => (e.id === id ? { ...e, ...patch } : e));
  await chrome.storage.local.set({ [TC_VOCAB_KEY]: next });
  return next;
}

/**
 * Merge imported entries with the current store: de-duplicated by (text, target),
 * keeping whichever copy was saved more recently, then sorted newest-first.
 * Invalid items (missing text/target) are ignored.
 */
async function tcVocabImport(entries) {
  if (!Array.isArray(entries)) return tcVocabAll();
  const byKey = new Map();
  const put = (e) => {
    if (!e || !e.text || !e.target) return;
    const key = e.text + '\n' + e.target;
    const norm = {
      id: e.id || tcVocabId(),
      text: e.text,
      translation: e.translation || '',
      target: e.target,
      source: e.source || '',
      provider: e.provider || '',
      context: e.context || '',
      notes: e.notes || '',
      url: e.url || '',
      title: e.title || '',
      savedAt: e.savedAt || Date.now(),
      box: e.box || 0,
      due: e.due || Date.now(),
      reps: e.reps || 0,
      lapses: e.lapses || 0,
    };
    const prev = byKey.get(key);
    if (!prev || (norm.savedAt || 0) >= (prev.savedAt || 0)) byKey.set(key, norm);
  };
  (await tcVocabAll()).forEach(put);
  entries.forEach(put);
  const next = [...byKey.values()].sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
  await chrome.storage.local.set({ [TC_VOCAB_KEY]: next });
  return next;
}

// --- Spaced repetition (Leitner-style scheduling) ----------------------

// Days until a card in box N comes due again. Box 0 = brand new / just lapsed.
const TC_SRS_DAYS = [0, 1, 3, 7, 16, 35];

/** Cards due for review now (a missing schedule counts as due), soonest first. */
async function tcVocabDue(now) {
  const t = now || Date.now();
  return (await tcVocabAll())
    .filter((e) => (e.due == null ? true : e.due <= t))
    .sort((a, b) => (a.due || 0) - (b.due || 0));
}

/**
 * Grade a review: `known` promotes the card one box (longer interval); a miss
 * resets it to box 0 (seen again soon) and counts a lapse. Returns the new list.
 */
async function tcVocabGrade(id, known, now) {
  const t = now || Date.now();
  const next = (await tcVocabAll()).map((e) => {
    if (e.id !== id) return e;
    const box = known ? Math.min((e.box || 0) + 1, TC_SRS_DAYS.length - 1) : 0;
    return {
      ...e,
      box,
      due: t + TC_SRS_DAYS[box] * 86400000,
      reps: (e.reps || 0) + 1,
      lapses: (e.lapses || 0) + (known ? 0 : 1),
      last: t,
    };
  });
  await chrome.storage.local.set({ [TC_VOCAB_KEY]: next });
  return next;
}

if (typeof globalThis !== 'undefined') {
  globalThis.TC_VOCAB_KEY = TC_VOCAB_KEY;
  globalThis.tcVocabAll = tcVocabAll;
  globalThis.tcVocabHas = tcVocabHas;
  globalThis.tcVocabAdd = tcVocabAdd;
  globalThis.tcVocabRemove = tcVocabRemove;
  globalThis.tcVocabRemoveEntry = tcVocabRemoveEntry;
  globalThis.tcVocabClear = tcVocabClear;
  globalThis.tcVocabUpdate = tcVocabUpdate;
  globalThis.tcVocabImport = tcVocabImport;
  globalThis.tcVocabDue = tcVocabDue;
  globalThis.tcVocabGrade = tcVocabGrade;
}
