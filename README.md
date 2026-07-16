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

## Local preview

```bash
python3 -m http.server 8080
# open http://localhost:8080
```

Plus: `404.html` (custom error page), `robots.txt`, `sitemap.xml`,
`assets/favicon.svg`. All pages carry canonical URLs, Open Graph / Twitter
meta, and the home page includes Schema.org JSON-LD.

## Deployment

Served by GitHub Pages from the `main` branch root.
Custom domain: `astra-lang.org` (see `CNAME`).

Created by [Majid Nisar](https://majidnisar.com) —
[project page](https://majidnisar.com/projects/astra/).
