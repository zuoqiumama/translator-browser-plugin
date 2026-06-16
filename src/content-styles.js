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
  z-index: 2147483647;
  width: 340px;
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

/* slim scrollbar */
.tc-body::-webkit-scrollbar { width: 8px; }
.tc-body::-webkit-scrollbar-thumb { background: var(--tc-border); border-radius: 8px; border: 2px solid transparent; background-clip: padding-box; }
.tc-body::-webkit-scrollbar-thumb:hover { background: var(--tc-faint); background-clip: padding-box; }
`;

if (typeof globalThis !== 'undefined') globalThis.TC_CSS = TC_CSS;
