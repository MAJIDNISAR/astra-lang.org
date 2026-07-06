# astra-lang.org

Official website for the [Astra programming language](https://github.com/MAJIDNISAR/Astra)
and the Mifa package manager.

Static site (plain HTML + CSS, no build step) served via GitHub Pages.

## Pages

- `index.html` — home: the AI-first verify-repair-compile loop
- `language.html` — language tour: syntax, types, Result, closures, `dyn`, pipeline
- `mifa.html` — Mifa package manager: workflow, lockfile, milestones
- `progress.html` — ground-truth progress tracker for Astra and Mifa
- `about.html` — project story and creator

## Local preview

```bash
python3 -m http.server 8080
# open http://localhost:8080
```

## Deployment

Served by GitHub Pages from the `main` branch root.
Custom domain: `astra-lang.org` (see `CNAME`).

Created by [Majid Nisar](https://majidnisar.com) —
[project page](https://majidnisar.com/projects/astra/).
