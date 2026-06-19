/*
 * content-styles.js — CSS for the trigger button and translation card.
 *
 * Injected into a Shadow DOM <style>/adoptedStyleSheet so the host page can't
 * touch it and it can't touch the page. Theming via a `data-theme` attribute
 * ("light" | "dark") on the shadow wrapper.
 *
 * Design goal: quiet, premium, frosted-glass card with hairline borders, soft
 * layered shadows, line icons, and a smooth spring-in.
 */

var TC_CSS = `
:host, * { box-sizing: border-box; }

.tc-root {
  --tc-bg: rgba(255, 255, 255, 0.82);
  --tc-solid: #ffffff;
  --tc-fg: #18181b;
  --tc-muted: #71717a;
  --tc-faint: #a1a1aa;
  --tc-border: rgba(0, 0, 0, 0.08);
  --tc-divider: rgba(0, 0, 0, 0.06);
  --tc-hover: rgba(0, 0, 0, 0.05);
  --tc-accent: #6366f1;
  --tc-ok: #10b981;
  --tc-shadow:
    0 0 0 0.5px rgba(0, 0, 0, 0.04),
    0 2px 6px rgba(0, 0, 0, 0.06),
    0 12px 40px rgba(0, 0, 0, 0.14);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC",
    "Microsoft YaHei", Roboto, Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
}
.tc-root[data-theme="dark"] {
  --tc-bg: rgba(28, 28, 32, 0.78);
  --tc-solid: #1c1c20;
  --tc-fg: #f4f4f5;
  --tc-muted: #a1a1aa;
  --tc-faint: #71717a;
  --tc-border: rgba(255, 255, 255, 0.1);
  --tc-divider: rgba(255, 255, 255, 0.08);
  --tc-hover: rgba(255, 255, 255, 0.08);
  --tc-accent: #a5b4fc;
  --tc-ok: #34d399;
  --tc-shadow:
    0 0 0 0.5px rgba(255, 255, 255, 0.06),
    0 2px 8px rgba(0, 0, 0, 0.4),
    0 16px 48px rgba(0, 0, 0, 0.55);
}

/* The shadow host is click-through; only the actual widgets capture events. */
.tc-trigger, .tc-card { pointer-events: auto; }

/* ---- floating trigger button ---- */
.tc-trigger {
  position: fixed;
  z-index: 2147483647;
  width: 30px; height: 30px;
  display: flex; align-items: center; justify-content: center;
  color: var(--tc-accent);
  background: var(--tc-bg);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
  backdrop-filter: blur(20px) saturate(180%);
  border: 1px solid var(--tc-border);
  border-radius: 9px;
  box-shadow: var(--tc-shadow);
  cursor: pointer;
  user-select: none;
  transition: transform .14s cubic-bezier(.16,1,.3,1), box-shadow .14s ease;
  animation: tc-pop .16s cubic-bezier(.16,1,.3,1);
}
.tc-trigger:hover { transform: translateY(-1px) scale(1.05); }
.tc-trigger:active { transform: scale(.96); }
.tc-trigger svg { width: 17px; height: 17px; }
@keyframes tc-pop { from { opacity: 0; transform: scale(.6); } to { opacity: 1; transform: scale(1); } }

/* ---- card ---- */
.tc-card {
  position: fixed;
  /* One below the max so the overflow "more" menu (.tc-menu, at the max) and the
     trigger always paint ABOVE the card — they are siblings in the same stacking
     context, where equal z-index would otherwise let the later-inserted card win. */
  z-index: 2147483646;
  width: 360px;
  max-width: calc(100vw - 24px);
  color: var(--tc-fg);
  background: var(--tc-bg);
  -webkit-backdrop-filter: blur(24px) saturate(180%);
  backdrop-filter: blur(24px) saturate(180%);
  border: 1px solid var(--tc-border);
  border-radius: 16px;
  box-shadow: var(--tc-shadow);
  overflow: hidden;
  transform-origin: top center;
  animation: tc-in .22s cubic-bezier(.16,1,.3,1);
}
@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
  .tc-card, .tc-trigger { background: var(--tc-solid); }
}
@keyframes tc-in {
  from { opacity: 0; transform: translateY(6px) scale(.98); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}

.tc-head {
  display: flex; align-items: center; gap: 6px;
  padding: 8px 8px 8px 10px;
  cursor: move; /* the whole header is a drag handle */
}
.tc-actions { display: flex; align-items: center; gap: 1px; margin-left: auto; }

.tc-lang {
  appearance: none; -webkit-appearance: none;
  background: transparent;
  color: var(--tc-muted);
  border: 1px solid transparent;
  border-radius: 8px;
  padding: 4px 22px 4px 8px;
  font-size: 12px; font-weight: 500;
  cursor: pointer;
  max-width: 150px;
  transition: background .12s, color .12s;
  background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23a1a1aa' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'><path d='M6 9l6 6 6-6'/></svg>");
  background-repeat: no-repeat;
  background-position: right 6px center;
}
.tc-lang:hover { background-color: var(--tc-hover); color: var(--tc-fg); }
.tc-lang:focus { outline: none; }
.tc-lang option { background: var(--tc-solid); color: var(--tc-fg); }

.tc-iconbtn {
  display: flex; align-items: center; justify-content: center;
  width: 28px; height: 28px; padding: 0;
  border: none; background: transparent;
  color: var(--tc-faint);
  border-radius: 8px; cursor: pointer;
  transition: background .12s ease, color .12s ease, transform .1s ease;
}
.tc-iconbtn svg { width: 16px; height: 16px; }
.tc-iconbtn:hover { background: var(--tc-hover); color: var(--tc-fg); }
.tc-iconbtn:active { transform: scale(.9); }
.tc-iconbtn.tc-ok { color: var(--tc-ok); }
.tc-iconbtn.tc-pinned { color: var(--tc-accent); background: var(--tc-hover); }

.tc-body { padding: 2px 14px 14px; max-height: 56vh; overflow: auto; }
.tc-result {
  font-size: 15px; line-height: 1.65;
  white-space: pre-wrap; word-break: break-word;
  user-select: text;
  min-height: 22px;
  animation: tc-fade .18s ease;
}
@keyframes tc-fade { from { opacity: 0; } to { opacity: 1; } }

.tc-original {
  margin-top: 12px; padding-top: 12px;
  border-top: 1px solid var(--tc-divider);
  color: var(--tc-muted);
  font-size: 13px; line-height: 1.55;
  white-space: pre-wrap; word-break: break-word;
  user-select: text;
}

/* ---- AI explanation (streamed) ---- */
.tc-explain {
  margin-top: 12px; padding-top: 12px;
  border-top: 1px solid var(--tc-divider);
  font-size: 13.5px; line-height: 1.6;
  white-space: pre-wrap; word-break: break-word;
  user-select: text;
  animation: tc-fade .18s ease;
}
.tc-explain::before {
  content: 'AI 解释'; display: block;
  font-size: 11px; font-weight: 600; letter-spacing: .02em;
  color: var(--tc-muted); margin-bottom: 5px;
}
.tc-explain.tc-error { color: #ef4444; }
.tc-explain.tc-explain-loading::after {
  content: '▍'; color: var(--tc-accent); margin-left: 1px;
  animation: tc-blink 1s steps(1) infinite;
}
@keyframes tc-blink { 50% { opacity: 0; } }

.tc-error { color: #ef4444; font-size: 14px; }
.tc-retry {
  margin-left: 8px; color: var(--tc-accent);
  cursor: pointer; font-weight: 500;
}
.tc-retry:hover { text-decoration: underline; }

/* loading */
.tc-loading { color: var(--tc-muted); display: flex; align-items: center; gap: 9px; font-size: 14px; }
.tc-spinner {
  width: 15px; height: 15px;
  border: 1.5px solid var(--tc-divider);
  border-top-color: var(--tc-accent);
  border-radius: 50%;
  animation: tc-spin .7s linear infinite;
}
@keyframes tc-spin { to { transform: rotate(360deg); } }

/* ---- hover reading lens (panel descends) ---- */
.tc-lens {
  position: fixed;
  z-index: 2147483646;
  pointer-events: none; /* never block the page; cursor reads the text under it */
}
.tc-lens-panel {
  color: var(--tc-fg);
  background: var(--tc-bg);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
  backdrop-filter: blur(20px) saturate(180%);
  border: 1px solid var(--tc-border);
  border-radius: 9px;
  padding: 7px 11px;
  font-size: 13.5px; line-height: 1.55;
  box-shadow: var(--tc-shadow);
  max-height: 40vh; overflow: auto;
  white-space: pre-wrap; word-break: break-word;
  transform-origin: top center;
  animation: tc-lens-drop .34s cubic-bezier(.16,1,.3,1) both;
}
.tc-lens-panel.tc-lens-loading { color: var(--tc-muted); font-style: italic; }
@keyframes tc-lens-drop {
  from { clip-path: inset(0 0 100% 0 round 9px); opacity: 0; transform: translateY(-5px); }
  to   { clip-path: inset(0 0 0 0 round 9px); opacity: 1; transform: translateY(0); }
}

/* ---- multi-engine compare ---- */
.tc-iconbtn.tc-active { color: var(--tc-accent); background: var(--tc-hover); }
.tc-iconbtn.tc-saved { color: var(--tc-accent); }
.tc-iconbtn.tc-saved svg { fill: currentColor; }
.tc-engines { display: flex; flex-direction: column; }
.tc-engine-row { padding: 10px 0; }
.tc-engine-row:first-child { padding-top: 2px; }
.tc-engine-row + .tc-engine-row { border-top: 1px solid var(--tc-divider); }
.tc-engine-head { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
.tc-engine-name {
  font-size: 11px; font-weight: 600; letter-spacing: .02em;
  color: var(--tc-muted);
  background: var(--tc-hover);
  padding: 1px 7px; border-radius: 6px;
}
.tc-engine-meta { font-size: 11px; color: var(--tc-faint); font-variant-numeric: tabular-nums; }
.tc-engine-copy { width: 22px; height: 22px; margin-left: auto; }
.tc-engine-copy svg { width: 14px; height: 14px; }
.tc-engine-text {
  font-size: 14.5px; line-height: 1.6;
  white-space: pre-wrap; word-break: break-word; user-select: text;
}
.tc-engine-text.tc-error { font-size: 13px; }

/* ---- overflow "more" menu ---- */
.tc-menu {
  position: fixed;
  z-index: 2147483647;
  min-width: 176px;
  padding: 5px;
  background: var(--tc-solid);
  border: 1px solid var(--tc-border);
  border-radius: 12px;
  box-shadow: var(--tc-shadow);
  display: flex; flex-direction: column; gap: 1px;
  pointer-events: auto;
  animation: tc-menu-in .12s cubic-bezier(.16,1,.3,1);
}
/* The author "display: flex" above outranks the UA [hidden] rule, so the hidden
   attribute alone won't hide the menu — it would otherwise sit open at the
   viewport's top-left from the moment a card is built. This wins it back.
   (Backticks are forbidden here: this whole sheet is a JS template literal.) */
.tc-menu[hidden] { display: none; }
@keyframes tc-menu-in {
  from { opacity: 0; transform: translateY(-4px) scale(.98); }
  to   { opacity: 1; transform: none; }
}
.tc-menuitem {
  display: flex; align-items: center; gap: 10px;
  width: 100%; padding: 8px 10px;
  border: none; background: transparent;
  color: var(--tc-fg); font: inherit; font-size: 13px;
  text-align: left; border-radius: 8px; cursor: pointer;
  transition: background .12s ease, color .12s ease;
}
.tc-menuitem svg { width: 16px; height: 16px; color: var(--tc-faint); flex: none; }
.tc-menuitem:hover { background: var(--tc-hover); }
.tc-menuitem.tc-active, .tc-menuitem.tc-saved, .tc-menuitem.tc-pinned { color: var(--tc-accent); }
.tc-menuitem.tc-active svg, .tc-menuitem.tc-pinned svg { color: var(--tc-accent); }
.tc-menuitem.tc-saved svg { color: var(--tc-accent); fill: currentColor; }

/* slim scrollbar */
.tc-body::-webkit-scrollbar { width: 8px; }
.tc-body::-webkit-scrollbar-thumb { background: var(--tc-border); border-radius: 8px; border: 2px solid transparent; background-clip: padding-box; }
.tc-body::-webkit-scrollbar-thumb:hover { background: var(--tc-faint); background-clip: padding-box; }
`;

if (typeof globalThis !== 'undefined') globalThis.TC_CSS = TC_CSS;
