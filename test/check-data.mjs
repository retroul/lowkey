// Checks js/data.js for typos that would silently break filters.
// Run: node test/check-data.mjs
import { readFileSync } from "node:fs";
import vm from "node:vm";

const src = readFileSync(new URL("../js/data.js", import.meta.url), "utf8");
const DATA = vm.runInNewContext(src + "\nDATA;");
const errors = [];
const fail = (msg) => errors.push(msg);

const groupIds = new Set(DATA.groups.map((g) => g.id));
const catIds = new Set();
const usedSwaps = new Set();
const usedGroups = new Set();
let count = 0;

for (const cat of DATA.categories) {
  if (catIds.has(cat.id)) fail(`duplicate category id ${cat.id}`);
  catIds.add(cat.id);
  if (!groupIds.has(cat.group)) fail(`${cat.id}: unknown group ${cat.group}`);
  usedGroups.add(cat.group);
  if (!cat.look) fail(`${cat.id}: missing "look" text`);
  if (!cat.tools.length) fail(`${cat.id}: no tools`);

  const names = new Set();
  for (const t of cat.tools) {
    count++;
    const where = `${cat.id}/${t.name}`;
    if (names.has(t.name)) fail(`${where}: listed twice`);
    names.add(t.name);
    if (!/^https:\/\/[^\s"<>]+$/.test(t.url)) fail(`${where}: url must be https`);
    if (!t.desc || t.desc.length < 20) fail(`${where}: description too short`);
    if (!(t.level in DATA.levels)) fail(`${where}: bad level ${t.level}`);
    if (!(t.price in DATA.prices)) fail(`${where}: bad price ${t.price}`);
    if (!(t.license in DATA.licenses)) fail(`${where}: bad license ${t.license}`);
    if (!t.platforms.length) fail(`${where}: no platforms`);
    for (const p of t.platforms) if (!(p in DATA.platforms)) fail(`${where}: bad platform ${p}`);
    for (const v of [].concat(t.trait ?? [])) if (!(v in cat.trait.values)) fail(`${where}: bad trait ${v}`);
    if (t.trait == null) fail(`${where}: missing trait`);
    for (const s of t.swaps ?? []) {
      if (!(s in DATA.swaps)) fail(`${where}: bad swap ${s}`);
      usedSwaps.add(s);
    }
  }
}

for (const s of Object.keys(DATA.swaps)) if (!usedSwaps.has(s)) fail(`swap "${s}" has no tools`);
for (const g of groupIds) if (!usedGroups.has(g)) fail(`group "${g}" has no categories`);

if (errors.length) {
  console.error(errors.map((e) => "  x " + e).join("\n"));
  console.error(`${errors.length} problem(s)`);
  process.exit(1);
}
console.log(`ok: ${count} tools in ${catIds.size} categories, ${usedSwaps.size} swaps`);
