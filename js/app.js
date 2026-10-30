// Builds the directory from DATA (js/data.js) once, then filters by hiding rows.
// All filter state lives in the URL query, so a copied link reproduces the view.
(() => {
  "use strict";

  const D = DATA;
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const scrollMode = () => (reduceMotion.matches ? "auto" : "smooth");

  // ---------- helpers ----------

  const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const list = (v) => (v == null ? [] : [].concat(v));
  const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
  // Search text: lower case, accents and superscripts folded ("iodéOS" → "iodeos", "DAVx⁵" → "davx5"), curly apostrophes made straight.
  const norm = (s) => s.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/\u2019/g, "'").toLowerCase();

  // Small element builder; text is always set as text, never as HTML.
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === "class") el.className = v;
      else if (k === "text") el.textContent = v;
      else el.setAttribute(k, v === true ? "" : v);
    }
    for (const kid of kids.flat()) {
      if (kid == null || kid === false) continue;
      el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
    }
    return el;
  }

  // ---------- data, flattened ----------

  const tools = [];
  for (const cat of D.categories) {
    for (const t of cat.tools) {
      tools.push({ ...t, cat, id: `t-${cat.id}-${slug(t.name)}`, traits: list(t.trait), swaps: t.swaps || [] });
    }
  }
  const byId = new Map(tools.map((t) => [t.id, t]));
  const groupName = Object.fromEntries(D.groups.map((g) => [g.id, g.name]));

  const FILTERS = [
    { key: "p", label: "Device", cls: "platforms", values: D.platforms, test: (t, s) => t.platforms.some((p) => s.has(p)) },
    { key: "price", label: "Price", cls: "price", values: D.prices, test: (t, s) => s.has(t.price) },
    { key: "src", label: "Source", cls: "license", values: D.licenses, test: (t, s) => s.has(t.license) },
    { key: "lvl", label: "Setup", cls: "level", values: D.levels, test: (t, s) => s.has(String(t.level)) },
  ];

  // ---------- state <-> URL ----------

  const state = {
    sets: Object.fromEntries(FILTERS.map((f) => [f.key, new Set()])),
    traits: Object.fromEntries(D.categories.map((c) => [c.id, new Set()])),
    picks: false,
    swap: null,
    view: "list",
  };

  function readURL() {
    const q = new URLSearchParams(location.search);
    for (const f of FILTERS) {
      state.sets[f.key] = new Set((q.get(f.key) || "").split(",").filter((v) => Object.hasOwn(f.values, v)));
    }
    for (const c of D.categories) {
      state.traits[c.id] = new Set((q.get(`t-${c.id}`) || "").split(",").filter((v) => Object.hasOwn(c.trait.values, v)));
    }
    state.picks = q.get("picks") === "1";
    state.swap = Object.hasOwn(D.swaps, q.get("swap") ?? "") ? q.get("swap") : null;
    state.view = q.get("view") === "table" ? "table" : "list";
  }

  function writeURL() {
    const q = new URLSearchParams();
    for (const f of FILTERS) if (state.sets[f.key].size) q.set(f.key, [...state.sets[f.key]].join(","));
    if (state.picks) q.set("picks", "1");
    if (state.swap) q.set("swap", state.swap);
    for (const c of D.categories) if (state.traits[c.id].size) q.set(`t-${c.id}`, [...state.traits[c.id]].join(","));
    if (state.view === "table") q.set("view", "table");
    const qs = q.toString().replace(/%2C/g, ",");
    history.replaceState(null, "", (qs ? `?${qs}` : location.pathname) + location.hash);
  }

  const activeCount = () =>
    FILTERS.reduce((n, f) => n + state.sets[f.key].size, 0) +
    Object.values(state.traits).reduce((n, s) => n + s.size, 0) +
    (state.picks ? 1 : 0) + (state.swap ? 1 : 0);

  function matches(t) {
    for (const f of FILTERS) {
      const s = state.sets[f.key];
      if (s.size && !f.test(t, s)) return false;
    }
    if (state.picks && !t.pick) return false;
    if (state.swap && !t.swaps.includes(state.swap)) return false;
    const ts = state.traits[t.cat.id];
    if (ts.size && !t.traits.some((v) => ts.has(v))) return false;
    return true;
  }

  function resetAll() {
    for (const f of FILTERS) state.sets[f.key].clear();
    for (const s of Object.values(state.traits)) s.clear();
    state.picks = false;
    state.swap = null;
  }

  // ---------- one-time render ----------

  const els = {
    directory: document.getElementById("directory"),
    groups: document.getElementById("filter-groups"),
    fold: document.getElementById("filters-fold"),
    on: document.getElementById("filters-on"),
    count: document.getElementById("count"),
    reset: document.getElementById("reset"),
    index: document.getElementById("index"),
    cats: document.getElementById("categories"),
    empty: document.getElementById("empty"),
    swaps: document.getElementById("swaps"),
    swapNote: document.getElementById("swap-note"),
    steps: document.getElementById("steps"),
    indexCount: document.getElementById("index-count"),
  };
  const rowEls = new Map();   // tool id -> { row, tr }
  const catEls = new Map();   // cat id -> { section, count, idx }

  function renderStatic() {
    document.querySelectorAll("[data-count]").forEach((el) => (el.textContent = tools.length));
    document.querySelectorAll("[data-compiled]").forEach((el) => {
      el.textContent = D.compiled;
      el.setAttribute("datetime", D.compiled);
    });

    // hero figure: stepped bars, one per group, sized by real tool counts
    const perGroup = D.groups.map((g) => ({
      g,
      n: tools.filter((t) => t.cat.group === g.id).length,
      first: D.categories.find((c) => c.group === g.id),
    }));
    const max = Math.max(...perGroup.map((x) => x.n));
    for (const { g, n, first } of perGroup) {
      const bar = h("span", { class: "steps__bar", "aria-hidden": "true" });
      bar.style.transform = `scaleX(${(n / max).toFixed(3)})`;
      els.steps.append(h("li", { class: "steps__row" },
        h("a", { href: `#c-${first.id}`, "data-cat-jump": first.id, text: g.name }),
        h("span", { class: "steps__num", text: n }),
        bar));
    }

    // swap chips
    for (const [key, name] of Object.entries(D.swaps)) {
      const n = tools.filter((t) => t.swaps.includes(key)).length;
      els.swaps.append(h("li", {},
        h("button", { type: "button", class: "chip", "data-swap": key, "aria-pressed": "false" },
          name, h("span", { class: "chip__n", "aria-label": `${plural(n, "option")}`, text: n }))));
    }

    // filter groups
    for (const f of FILTERS) {
      const chips = Object.entries(f.values).map(([val, label]) => {
        const n = tools.filter((t) => f.test(t, new Set([val]))).length;
        return h("button", { type: "button", class: "chip", "data-key": f.key, "data-val": val, "aria-pressed": "false" },
          label, h("span", { class: "chip__n", "aria-hidden": "true", text: n }));
      });
      els.groups.append(h("fieldset", { class: `fgroup fgroup--${f.cls}` },
        h("legend", { class: "label", text: f.label }),
        h("div", { class: "fgroup__chips" }, chips)));
    }
    els.groups.append(h("fieldset", { class: "fgroup fgroup--picks" },
      h("legend", { class: "label", text: "Picks" }),
      h("div", { class: "fgroup__chips" },
        h("button", { type: "button", class: "chip", "data-picks": "", "aria-pressed": "false" },
          "Our picks only",
          h("span", { class: "chip__n", "aria-hidden": "true", text: tools.filter((t) => t.pick).length })))));

    // side index
    for (const g of D.groups) {
      els.index.append(h("li", { class: "idx__group label", text: g.name }));
      for (const c of D.categories.filter((c) => c.group === g.id)) {
        const n = h("span", { class: "idx__n", text: c.tools.length });
        const li = h("li", { class: "idx" }, h("a", { href: `#c-${c.id}`, "data-cat-jump": c.id }, c.name, n));
        els.index.append(li);
        catEls.set(c.id, { idx: li, idxN: n });
      }
    }

    // categories
    const platformKeys = Object.keys(D.platforms);
    const short = { win: "Win", mac: "Mac", linux: "Linux", android: "Android", ios: "iOS", web: "Web" };

    D.categories.forEach((c, i) => {
      const catTools = tools.filter((t) => t.cat === c);
      const count = h("span", { class: "label cat__count" });

      const traitChips = Object.entries(c.trait.values).map(([val, label]) => {
        const n = catTools.filter((t) => t.traits.includes(val)).length;
        return n ? h("button", { type: "button", class: "chip", "data-trait": val, "data-cat": c.id, "aria-pressed": "false" },
          label, h("span", { class: "chip__n", "aria-hidden": "true", text: n })) : null;
      });

      const rows = h("ul", { class: "rows" });
      const tbody = h("tbody");

      for (const t of catTools) {
        const traitLabels = t.traits.map((v) => c.trait.values[v]).join(", ");
        const link = (cls) => h("a", { href: t.url, class: cls, target: "_blank", rel: "noopener noreferrer" },
          t.name, h("span", { class: "visually-hidden", text: " (opens in a new tab)" }));

        const row = h("li", { class: "row", id: t.id },
          h("div", { class: "row__name" }, link(), t.pick ? h("span", { class: "label pick", text: "Pick" }) : null),
          h("p", { class: "row__desc", text: t.desc }),
          h("p", { class: "row__meta" },
            h("span", { text: D.levels[t.level] }),
            h("span", { text: D.prices[t.price] }),
            h("span", { text: D.licenses[t.license] }),
            h("span", { text: t.platforms.map((p) => D.platforms[p]).join(" · ") }),
            h("span", { text: `${c.trait.label}: ${traitLabels}` })));
        rows.append(row);

        const tr = h("tr", { "data-id": t.id },
          h("th", { scope: "row" }, t.pick ? h("span", { class: "pick", title: "Our pick" }, h("span", { class: "visually-hidden", text: "Pick: " })) : null, link()),
          h("td", { text: D.levels[t.level] }),
          h("td", { text: D.prices[t.price] }),
          h("td", { text: D.licenses[t.license] }),
          platformKeys.map((p) => {
            const yes = t.platforms.includes(p);
            return h("td", { class: "dot" },
              h("span", { class: yes ? "yes" : "no", "aria-hidden": "true" }),
              h("span", { class: "visually-hidden", text: yes ? "Yes" : "No" }));
          }),
          h("td", { text: traitLabels }));
        tbody.append(tr);
        rowEls.set(t.id, { row, tr });
      }

      const table = h("div", { class: "tablewrap", tabindex: "0", role: "region", "aria-label": `${c.name} compared` },
        h("table", { class: "cmp" },
          h("caption", { class: "visually-hidden", text: `${c.name}: setup, price, source and platforms` }),
          h("thead", {}, h("tr", {},
            h("th", { scope: "col", text: "Tool" }),
            h("th", { scope: "col", text: "Setup" }),
            h("th", { scope: "col", text: "Price" }),
            h("th", { scope: "col", text: "Source" }),
            platformKeys.map((p) => h("th", { scope: "col", class: "dot" }, h("abbr", { title: D.platforms[p], text: short[p] }))),
            h("th", { scope: "col", text: c.trait.label }))),
          tbody));

      const section = h("section", { class: "cat", id: `c-${c.id}`, "aria-labelledby": `h-${c.id}` },
        h("span", { class: "numeral", "aria-hidden": "true", text: String(i + 1).padStart(2, "0") }),
        h("header", { class: "cat__head" },
          h("h3", { id: `h-${c.id}`, text: c.name }),
          count,
          h("p", { class: "cat__look" }, h("strong", { text: "What we look for. " }), c.look),
          h("div", { class: "cat__traits", role: "group", "aria-label": `Filter ${c.name} by ${c.trait.label.toLowerCase()}` },
            h("span", { class: "label", "aria-hidden": "true", text: c.trait.label }), traitChips)),
        rows,
        table);

      els.cats.append(section);
      Object.assign(catEls.get(c.id), { section, count, total: catTools.length });
    });
  }

  // ---------- apply filters ----------

  function apply() {
    let shown = 0;
    const perCat = new Map(D.categories.map((c) => [c.id, 0]));

    for (const t of tools) {
      const ok = matches(t);
      const { row, tr } = rowEls.get(t.id);
      row.hidden = !ok;
      tr.hidden = !ok;
      if (ok) {
        shown++;
        perCat.set(t.cat.id, perCat.get(t.cat.id) + 1);
      }
    }

    for (const c of D.categories) {
      const e = catEls.get(c.id);
      const n = perCat.get(c.id);
      e.section.hidden = n === 0;
      e.idx.hidden = n === 0;
      e.idxN.textContent = n;
      e.count.textContent = n === e.total ? plural(e.total, "tool") : `${n} of ${e.total} tools`;
    }

    const active = activeCount();
    els.count.replaceChildren(
      shown === tools.length ? "Showing all " : "Showing ",
      h("strong", { text: shown }),
      shown === tools.length ? " tools" : ` of ${tools.length} tools`);
    els.indexCount.textContent = shown === tools.length ? `All ${tools.length} tools` : `${shown} of ${tools.length} shown`;
    els.empty.hidden = shown > 0;
    els.reset.disabled = active === 0;
    els.on.textContent = active ? `(${active} on)` : "";

    if (state.swap) {
      els.swapNote.hidden = false;
      els.swapNote.replaceChildren(
        h("span", {}, "Showing replacements for ", h("strong", { text: D.swaps[state.swap] }), "."),
        h("button", { type: "button", class: "reset", "data-swap-clear": "", text: "Show everything" }));
    } else {
      els.swapNote.hidden = true;
      els.swapNote.replaceChildren();
    }

    document.querySelectorAll("[data-key]").forEach((b) =>
      b.setAttribute("aria-pressed", state.sets[b.dataset.key].has(b.dataset.val)));
    document.querySelectorAll("[data-trait]").forEach((b) =>
      b.setAttribute("aria-pressed", state.traits[b.dataset.cat].has(b.dataset.trait)));
    document.querySelectorAll("[data-swap]").forEach((b) =>
      b.setAttribute("aria-pressed", b.dataset.swap === state.swap));
    document.querySelectorAll("[data-picks]").forEach((b) => b.setAttribute("aria-pressed", state.picks));
    document.querySelectorAll("[data-view]").forEach((b) => b.setAttribute("aria-pressed", b.dataset.view === state.view));
    els.directory.classList.toggle("is-table", state.view === "table");

    writeURL();
  }

  // ---------- jumping to a tool or category ----------

  let flashTimer;
  function jumpTo(id) {
    const t = byId.get(id);
    if (!t) return;
    if (!matches(t)) {
      resetAll();
      apply();
    }
    const { row, tr } = rowEls.get(id);
    const target = state.view === "table" ? tr : row;
    target.scrollIntoView({ block: "start", behavior: scrollMode() });
    clearTimeout(flashTimer);
    row.classList.add("is-flash");
    flashTimer = setTimeout(() => row.classList.remove("is-flash"), 1600);
    target.querySelector("a").focus({ preventScroll: true });
    history.replaceState(null, "", location.search + `#${id}`);
  }

  function jumpToCat(catId) {
    const e = catEls.get(catId);
    if (!e) return;
    if (e.section.hidden) {
      resetAll();
      apply();
    }
    e.section.scrollIntoView({ block: "start", behavior: scrollMode() });
    history.replaceState(null, "", location.search + `#c-${catId}`);
  }

  function toDirectory() {
    els.directory.scrollIntoView({ block: "start", behavior: scrollMode() });
    els.directory.focus({ preventScroll: true });
  }

  // ---------- events ----------

  document.addEventListener("click", (e) => {
    const b = e.target.closest("button, a");
    if (!b) return;
    const ds = b.dataset;

    if ("key" in ds) {
      const s = state.sets[ds.key];
      s.has(ds.val) ? s.delete(ds.val) : s.add(ds.val);
    } else if ("trait" in ds) {
      const s = state.traits[ds.cat];
      s.has(ds.trait) ? s.delete(ds.trait) : s.add(ds.trait);
    } else if ("picks" in ds) {
      state.picks = !state.picks;
    } else if ("swap" in ds) {
      const turningOn = state.swap !== ds.swap;
      state.swap = turningOn ? ds.swap : null;
      apply();
      if (turningOn) toDirectory();
      return;
    } else if ("swapClear" in ds) {
      state.swap = null;
    } else if ("view" in ds) {
      state.view = ds.view;
    } else if ("reset" in ds || b === els.reset) {
      resetAll();
    } else if ("jump" in ds) {
      e.preventDefault();
      jumpTo(b.getAttribute("href").slice(1));
      return;
    } else if ("toFilters" in ds) {
      e.preventDefault();
      els.fold.open = true;
      document.getElementById("filters").scrollIntoView({ block: "start", behavior: scrollMode() });
      els.fold.querySelector("summary").focus({ preventScroll: true });
      return;
    } else if ("catJump" in ds) {
      e.preventDefault();
      jumpToCat(ds.catJump);
      return;
    } else {
      return;
    }
    apply();
  });

  document.addEventListener("keydown", (e) => {
    if (finder.dialog.open) return;
    const typing = e.target.closest("input, textarea, select, [contenteditable]");
    if ((e.key === "/" && !typing) || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k")) {
      e.preventDefault();
      finder.open();
    } else if (e.key === "Escape" && !typing && activeCount() > 0) {
      resetAll();
      apply();
    }
  });

  // Highlight the category you're reading in the side index.
  function watchIndex() {
    if (!("IntersectionObserver" in window)) return;
    const io = new IntersectionObserver((entries) => {
      for (const en of entries) {
        if (!en.isIntersecting) continue;
        const id = en.target.id.slice(2);
        for (const [cid, e] of catEls) {
          const a = e.idx.querySelector("a");
          if (cid === id) a.setAttribute("aria-current", "true");
          else a.removeAttribute("aria-current");
        }
      }
    }, { rootMargin: "-30% 0px -60% 0px" });
    for (const e of catEls.values()) io.observe(e.section);
  }

  // ---------- finder (search dialog) ----------

  const finder = (() => {
    const dialog = document.getElementById("finder");
    const input = document.getElementById("finder-input");
    const results = document.getElementById("finder-results");
    const emptyMsg = h("p", { class: "finder__empty", hidden: true });
    results.after(emptyMsg);
    let shown = [];
    let active = 0;

    const haystack = new Map(tools.map((t) => [t.id, {
      name: norm(t.name),
      cat: norm(`${t.cat.name} ${groupName[t.cat.group]}`),
      swaps: norm(t.swaps.map((s) => D.swaps[s]).join(" ")),
      desc: norm(t.desc),
    }]));

    function search(q) {
      const words = norm(q).trim().split(/\s+/).filter(Boolean);
      if (!words.length) return tools.filter((t) => t.pick);
      const scored = [];
      for (const t of tools) {
        const s = haystack.get(t.id);
        let score = 0;
        for (const w of words) {
          let ws = 0;
          if (s.name.startsWith(w)) ws = 100;
          else if (` ${s.name}`.includes(` ${w}`)) ws = 80;
          else if (s.name.includes(w)) ws = 60;
          else if (s.swaps.includes(w)) ws = 50;
          else if (s.cat.includes(w)) ws = 40;
          else if (s.desc.includes(w)) ws = 10;
          if (!ws) { score = 0; break; }
          score += ws;
        }
        if (score) scored.push([score + (t.pick ? 5 : 0), t]);
      }
      return scored.sort((a, b) => b[0] - a[0]).slice(0, 30).map((x) => x[1]);
    }

    function render() {
      const q = input.value;
      shown = search(q);
      active = 0;
      results.replaceChildren(...shown.map((t, i) =>
        h("li", { class: "finder__opt", role: "option", id: `opt-${i}`, "aria-selected": i === 0 ? "true" : "false", "data-i": i },
          h("strong", { text: t.name }),
          h("span", { class: "label", text: t.cat.name }),
          h("small", { text: t.desc }))));
      emptyMsg.hidden = shown.length > 0;
      emptyMsg.textContent = `Nothing called “${q.trim()}”. Try the job instead, like “email” or “passwords”.`;
      input.setAttribute("aria-expanded", shown.length > 0);
      sync();
    }

    function sync() {
      results.querySelectorAll(".finder__opt").forEach((li, i) => li.setAttribute("aria-selected", i === active));
      const cur = document.getElementById(`opt-${active}`);
      if (cur) {
        input.setAttribute("aria-activedescendant", cur.id);
        cur.scrollIntoView({ block: "nearest" });
      } else {
        input.removeAttribute("aria-activedescendant");
      }
    }

    function choose(i) {
      const t = shown[i];
      if (!t) return;
      dialog.close();
      jumpTo(t.id);
    }

    input.addEventListener("input", render);
    input.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown") { e.preventDefault(); active = Math.min(active + 1, shown.length - 1); sync(); }
      else if (e.key === "ArrowUp") { e.preventDefault(); active = Math.max(active - 1, 0); sync(); }
      else if (e.key === "Enter") { e.preventDefault(); choose(active); }
    });
    results.addEventListener("click", (e) => {
      const li = e.target.closest(".finder__opt");
      if (li) choose(Number(li.dataset.i));
    });
    results.addEventListener("pointermove", (e) => {
      const li = e.target.closest(".finder__opt");
      if (li && Number(li.dataset.i) !== active) { active = Number(li.dataset.i); sync(); }
    });
    // A click on the backdrop lands on the dialog element itself.
    dialog.addEventListener("click", (e) => { if (e.target === dialog) dialog.close(); });
    document.getElementById("find-open").addEventListener("click", () => open());

    function open() {
      input.value = "";
      render();
      dialog.showModal();
      input.focus();
    }

    return { dialog, open };
  })();

  // ---------- start ----------

  readURL();
  renderStatic();
  if (!matchMedia("(min-width: 60rem)").matches) els.fold.open = false;
  apply();
  watchIndex();

  let hash = "";
  try { hash = decodeURIComponent(location.hash.slice(1)); } catch { /* malformed link: ignore the hash */ }
  if (byId.has(hash)) requestAnimationFrame(() => jumpTo(hash));
  else if (hash.startsWith("c-")) requestAnimationFrame(() => jumpToCat(hash.slice(2)));
})();
