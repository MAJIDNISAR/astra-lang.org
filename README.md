# astra-lang.org

Official website for the [Astra programming language](https://github.com/MAJIDNISAR/Astra)
and the Mifa package manager.

Static site (plain HTML + CSS, no build step) served via GitHub Pages.

## Pages

- `index.html` — home: the AI-first verify-repair-compile loop
- `start.html` — getting started: download or clone → verify → compile → REPL → Mifa
- `language.html` — language tour: syntax, types, Result, closures, `dyn`, pipeline
- `mifa.html` — Mifa package manager: workflow, lockfile, milestones
- `vision.html` — v0.9→v1.0 roadmap, agent-native keywords, comparison table
- `benchmarks.html` — validated metrics (D1–D5) with reproduce-it-yourself commands
- `agents.html` — machine interface spec: JSON diagnostics contract + error-code catalog
- `progress.html` — ground-truth progress tracker for Astra and Mifa
- `about.html` — project story and creator
- `download.html` — downloads (currently "coming soon": no public binaries yet)

## Local preview

```bash
python3 -m http.server 8080
# open http://localhost:8080
```

Plus: `404.html` (custom error page), `robots.txt`, `sitemap.xml`,
`assets/favicon.svg`, and `assets/og.png` (1200×630 social preview). All pages
carry canonical URLs, Open Graph / Twitter large-card meta, and the home page
includes Schema.org JSON-LD.

## Design notes

- `assets/style.css`: every value is a token in `:root`. The dark theme swaps
  color tokens only, under `prefers-color-scheme` or `data-theme="dark"`.
- `assets/site.js` (deferred) adds the theme toggle, the phone menu, copy
  buttons and focusable scrolling code blocks. Every page works without it: the
  nav collapses only after the script has built the menu button.
- A tiny inline script in each `<head>` applies a stored theme before first
  paint.
- Tables: `.table-wrap.stack` (≤3 columns) become cards under 640px;
  `.table-wrap.scroll` matrices scroll inside a labelled, focusable region.
  Cells carry `data-label`; badge-only cells carry `badge-cell`.
- `<pre data-copy="none">` opts a code block out of the copy button.

## Deployment

Served by GitHub Pages from the `main` branch root.
Custom domain: `astra-lang.org` (see `CNAME`).

Created by [Majid Nisar](https://majidnisar.com) —
[project page](https://majidnisar.com/projects/astra/).
