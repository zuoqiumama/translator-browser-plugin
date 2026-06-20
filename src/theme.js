/*
 * theme.js — apply the shared light / dark theme to an extension PAGE.
 *
 * The `theme` setting (auto | light | dark) drives the in-page translation card
 * (see content.js) and, via this file, every extension page (options, vocab,
 * review, popup) so the whole product themes as one.
 *
 *   - light / dark → set <html data-theme="…">, which overrides the page CSS.
 *   - auto         → remove the attribute and let each page's
 *                    `@media (prefers-color-scheme)` follow the OS (no flash).
 *
 * Loaded as a classic <script> in <head> so the attribute lands as early as
 * possible. Reacts to storage.onChanged so switching the setting re-themes
 * open pages live.
 */
(function () {
  if (typeof document === 'undefined') return;
  var root = document.documentElement;

  function apply(theme) {
    if (theme === 'light' || theme === 'dark') root.setAttribute('data-theme', theme);
    else root.removeAttribute('data-theme'); // 'auto' / unknown → OS via media query
  }

  try {
    chrome.storage.sync.get({ theme: 'auto' }, function (r) {
      apply(r && r.theme);
    });
    chrome.storage.onChanged.addListener(function (changes, area) {
      if (area === 'sync' && changes.theme) apply(changes.theme.newValue);
    });
  } catch (e) {
    /* storage unavailable (page opened outside the extension) — stay on auto */
  }
}());
