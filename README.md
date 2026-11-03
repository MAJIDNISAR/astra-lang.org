# astra-lang.org

Official website for the [Astra programming language](https://github.com/MAJIDNISAR/Astra)
and the Mifa package manager.

Static site (plain HTML + CSS, no build step) served via GitHub Pages.

## Pages

- `index.html`: home. Night hero with the status globe (`assets/orb.js`: Astra's features as stars on a turning sphere, Mifa as its moon, status shown as star magnitude), the verify/fix panels, the loop, the command list, measured figures, and the status sheet on a 1750 star-atlas plate
- `start.html`: getting started
- `language.html`: language tour
- `agents.html`: the machine interface: JSON diagnostics, fix edits, error-code catalog
- `mifa.html`: the package manager, with its own globe
- `progress.html`: the tracker, plus 3D charts of every release and of memory before/after (`assets/viz.js`)
- `benchmarks.html`, `vision.html`, `about.html`, `download.html` (early access; no public links yet)

## Updating the site for a release

1. Edit `assets/status.json`: the release, test counts, feature statuses for Astra and Mifa, the release list, memory figures.
2. Run `node tools/sync-status.mjs`. It rewrites every fragment between `<!-- status:NAME -->` markers (version, test counts, the globe data, the fallback lists and tables) and leaves the rest of each page untouched. `--check` exits 1 if a page is out of date.
3. Update any prose that names the release (download page, release notes on the progress page), then `sitemap.xml` dates.

The globe (`orb.js`) reads the generated `script.orb-data` blocks. The 3D charts (`viz.js`) come in five kinds, each a `<figure data-viz="…">`:

| Kind | Data | Where |
|---|---|---|
| `releases` | `assets/status.json` releases; linked both ways with the page's `.timeline` | progress (timeline), about |
| `memory` | `assets/status.json` memory | progress |
| `grid` | the HTML table named by `data-source` (rows × numeric columns; taller is faster, log scale) | benchmarks |
| `levels` | the table named by `data-source`, each cell's `data-level` 0 to 3 | vision (comparison) |
| `bars` | the `.bar-row` list named by `data-source` | benchmarks, progress |

Table-driven charts read the table at runtime, so editing a table updates its chart. Without JavaScript every page still shows the same data as lists and tables.

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

- Direction: a star atlas (Astra means "the stars"). One typeface, Epilogue, for everything except code; night (#050f16), white and one orange; fields instead of rules; no gradients, shadows or eyebrow labels. Checked with the taste lint/inspector and the ux-ui hardcode gate (every value in `assets/style.css` is a token).
- Pictures: John Bevis's 1750 star chart (public domain, Wikimedia Commons) and Gerhard Emmoser's 1579 celestial globe with clockwork (The Met, CC0), credited in every footer (`assets/credits.json`).

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
