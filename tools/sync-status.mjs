#!/usr/bin/env node
// Regenerate every status-derived fragment of the site from assets/status.json.
//
//   node tools/sync-status.mjs           rewrite the pages
//   node tools/sync-status.mjs --check   exit 1 if any page is out of date (CI)
//
// A fragment lives between paired comments in a root *.html file:
//   <!-- status:NAME -->…<!-- /status:NAME -->
// Only the text between them changes; the rest of each file stays byte for
// byte. Running it twice changes nothing.
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const status = JSON.parse(readFileSync(join(root, "assets/status.json"), "utf8"));
const check = process.argv.includes("--check");

const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function list(product) {
  const items = status[product].statuses
    .map((s) => `<li data-status="${s.id}"><b>${esc(s.name)}:</b> ${s.items.map(esc).join(", ")}</li>`)
    .join("\n  ");
  return `<ul class="status-list">\n  ${items}\n</ul>`;
}

function releasesTable() {
  const rows = status.releases
    .slice()
    .reverse()
    .map((r) => {
      const v = r.unreleased ? "main (not released)" : r.version;
      const t = r.tests == null ? "—" : r.tests;
      return `<tr><td data-label="Version">${esc(v)}</td><td data-label="Date">${esc(r.date)}</td><td data-label="Tests">${t}</td><td data-label="What changed">${esc(r.summary)}</td></tr>`;
    })
    .join("\n      ");
  return `<div class="table-wrap stack"><table>\n    <thead><tr><th>Version</th><th>Date</th><th>Tests</th><th>What changed</th></tr></thead>\n    <tbody>\n      ${rows}\n    </tbody>\n  </table></div>`;
}

function memoryTable() {
  const u = status.memory.unit;
  const rows = status.memory.cases
    .map((c) => `<tr><td data-label="Case">${esc(c.name)}</td><td data-label="Before">${c.before} ${esc(u)}</td><td data-label="After">${c.after} ${esc(u)}</td></tr>`)
    .join("\n      ");
  return `<div class="table-wrap stack"><table>\n    <thead><tr><th>Case</th><th>Before</th><th>After</th></tr></thead>\n    <tbody>\n      ${rows}\n    </tbody>\n  </table></div>`;
}

function orbData(product) {
  const json = JSON.stringify({ statuses: status[product].statuses }).replace(/</g, "\\u003c");
  return `<script type="application/json" class="orb-data" data-for="${product}">${json}</script>`;
}

const RENDER = {
  "release-version": () => esc(status.release.version),
  "release-tests": () => String(status.release.tests),
  "main-tests": () => String(status.main.tests),
  "release-checks": () => esc(status.main.releaseChecks),
  "astra-list": () => list("astra"),
  "mifa-list": () => list("mifa"),
  "releases-table": releasesTable,
  "memory-table": memoryTable,
  "orb-data:astra": () => orbData("astra"),
  "orb-data:mifa": () => orbData("mifa"),
};

const MARKER = /<!-- status:([a-z:-]+) -->([\s\S]*?)<!-- \/status:\1 -->/g;
let stale = 0;
let failed = false;

for (const file of readdirSync(root).filter((f) => f.endsWith(".html")).sort()) {
  const path = join(root, file);
  const before = readFileSync(path, "utf8");
  const changed = [];
  const after = before.replace(MARKER, (whole, name, inner) => {
    const render = RENDER[name];
    if (!render) {
      console.error(`${file}: unknown marker status:${name}`);
      failed = true;
      return whole;
    }
    const fresh = render();
    if (fresh !== inner) changed.push(name);
    return `<!-- status:${name} -->${fresh}<!-- /status:${name} -->`;
  });
  if (!changed.length) continue;
  stale += 1;
  if (check) {
    console.log(`${file}: out of date (${changed.join(", ")})`);
  } else {
    writeFileSync(path, after);
    console.log(`${file}: updated ${changed.join(", ")}`);
  }
}

if (failed) process.exit(2);
if (check && stale) process.exit(1);
if (!stale) console.log("Every page matches assets/status.json.");
