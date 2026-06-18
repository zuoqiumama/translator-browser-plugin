/*
 * cache.js — tiny in-memory LRU for translation results.
 *
 * Runs ONLY in the service worker (loaded via importScripts in background.js,
 * BEFORE translators.js). Keeps recent translations so re-translating the same
 * text is instant and free: re-reading a page, reopening a card, the hover lens
 * revisiting a paragraph, or a hover-prefetch followed by the actual click.
 *
 * MV3 workers are ephemeral, so this is a best-effort speed cache, not durable
 * storage — it simply repopulates as the user works.
 */

// Max distinct (provider, target, text) entries to retain. A few hundred short
// strings is well under a megabyte — negligible for a worker.
const TC_CACHE_MAX = 500;

/** Insertion-ordered Map = cheap LRU: delete+set on access moves a key to newest. */
const tcCacheStore = new Map();

/** Tiny, fast 32-bit string hash (FNV-1a). Not cryptographic — only a key shortener. */
function tcHash(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h.toString(36);
}

/**
 * Build a stable cache key. Context (LLM disambiguation) changes the result, so
 * when present it participates in the key — hashed to keep keys short.
 */
function tcCacheKey(provider, target, text, context) {
  const ctx = context ? '|c' + tcHash(context) : '';
  return provider + '|' + target + '|' + text + ctx;
}

/** Return the cached value (refreshing its recency), or undefined on a miss. */
function tcCacheGet(key) {
  const hit = tcCacheStore.get(key);
  if (hit === undefined) return undefined;
  tcCacheStore.delete(key);
  tcCacheStore.set(key, hit); // move to newest
  return hit;
}

/** Store a value, evicting the oldest entry once over capacity. */
function tcCacheSet(key, value) {
  if (tcCacheStore.has(key)) tcCacheStore.delete(key);
  tcCacheStore.set(key, value);
  if (tcCacheStore.size > TC_CACHE_MAX) {
    const oldest = tcCacheStore.keys().next().value;
    tcCacheStore.delete(oldest);
  }
}

globalThis.tcCacheKey = tcCacheKey;
globalThis.tcCacheGet = tcCacheGet;
globalThis.tcCacheSet = tcCacheSet;
