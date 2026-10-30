// Light/dark switch. Loaded in <head> without defer so a saved choice applies before the
// first paint (no white flash). With no saved choice, the page follows the device setting.
(() => {
  "use strict";

  const root = document.documentElement;
  const KEY = "theme";
  const deviceDark = matchMedia("(prefers-color-scheme: dark)");
  // Browser-bar colours; they match --color-paper in tokens.css (meta tags can't read CSS vars).
  const BAR = { light: "#fbfcfe", dark: "#111318" };

  const saved = () => {
    try { const t = localStorage.getItem(KEY); return t === "light" || t === "dark" ? t : null; } catch { return null; }
  };
  const current = () => root.dataset.theme || (deviceDark.matches ? "dark" : "light");

  function sync() {
    const t = current();
    document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute("content", BAR[t]));
    const btn = document.getElementById("theme");
    if (btn) btn.setAttribute("aria-pressed", String(t === "dark"));
  }

  const first = saved();
  if (first) root.dataset.theme = first;

  document.addEventListener("DOMContentLoaded", () => {
    sync();
    document.getElementById("theme")?.addEventListener("click", () => {
      const next = current() === "dark" ? "light" : "dark";
      root.dataset.theme = next;
      try { localStorage.setItem(KEY, next); } catch { /* private window: the choice lasts this visit */ }
      sync();
    });
  });
  deviceDark.addEventListener("change", sync);
})();
