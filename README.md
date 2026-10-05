# Oregon Prosperity Council Report — June 2026 · Navigable Index

A **progressive-disclosure index** of the [Oregon Prosperity Council Report (June 2026)](https://www.oregon.gov/gov/Documents/Oregon%20Prosperity%20Council%20Report_June%202026.pdf) — "Recommendations for Oregon's Long-Term Competitiveness & Prosperity."

The 452-page PDF is split into ~150 small, summarized, cross-linked Markdown sections under [`tree/`](./tree/INDEX.md), and served as a static website built for **AI agents** (point ChatGPT/Claude at it and let it navigate) and humans. Every section carries an AI-written summary and links back to the exact source page.

```
Cover · Executive Summary (10 priority recommendations)
Full Report → Ch.1 Economic Development · Ch.2 Taxes · Ch.3 Permitting · Ch.4 Site Readiness · Ch.5 Talent
Appendix A Engagement Report · B Survey Questions · C Survey Data
Appendix D Facilitators' Guide · E Submissions & Feedback (47 named public submissions) · F Technical Report (52 data slides)
```

## Two layers

1. **The doc tree** ([`tree/`](./tree/INDEX.md)) — the source of truth. Plain Markdown, browsable on GitHub, navigable by any agent, greppable. Built by the [`pdf-doctree`](https://github.com) pipeline plus the project-local scripts in [`scripts/`](./scripts).
2. **The website** (this Next.js app) — a static export of the tree with a landing page, per-section pages, full-text search, raw-markdown endpoints, and an [`llms.txt`](#agents) manifest. **Live at [yex.ai/gov/oregon/prosperity-council](https://yex.ai/gov/oregon/prosperity-council/)**, composed into the yex.ai Atlas — see [Deploy](#deploy).

---

## Deploy

The live site is **[yex.ai/gov/oregon/prosperity-council](https://yex.ai/gov/oregon/prosperity-council/)**. To ship an update, one command:

```bash
npm run deploy:gov
```

It builds with `BASE_PATH=/gov/oregon/prosperity-council` and deploys `out/` to
the Vercel origin (`oregon-prosperity-council-gov`) that the yex.ai Cloudflare
Worker proxies to. **Full details in [`DEPLOY.md`](./DEPLOY.md).** No tunnel, no
server to keep running; routing lives in `yexai/data/atlas.ts` and doesn't change
on a content update.

## Run locally

```bash
npm install
npm run dev                 # dev server (regenerates public assets, then next dev)
# or preview the production static export:
npm run build && PORT=8788 npm run serve   # local-only; serve.mjs is a zero-dep static server over ./out
```

`out/` is a fully static folder — `serve.mjs` is for local preview only (it is
**not** in the live serving path). To preview as a standalone site at the root
(not under /gov), build without `BASE_PATH`.

<a name="agents"></a>
## For AI agents

- **Start here:** the site root (`/`) or [`tree/INDEX.md`](./tree/INDEX.md). Follow links down; a typical question reaches the right section in 2–3 hops.
- **Map:** [`/llms.txt`](./public) lists every top-level section with its summary. [`/llms-full.txt`](./public) is every section's title + AI summary + source page in one file.
- **Raw markdown:** every page links to its source under `/raw/<path>.md`. Raw extracted page text is at `/raw-page/<NNNN>.txt`.
- **Citations:** every summary bullet and section links to the exact `…#page=N` of the source PDF on oregon.gov.

See [`CLAUDE.md`](./CLAUDE.md) for the navigation contract.

---

## Rebuild the doc tree from the PDF

The PDF → tree pipeline lives in the `pdf-doctree` skill (v1.1.0+; the heavy scripts stay in the plugin). This repo holds the config and one project-local script, `scripts/build-outline.mjs`, that reconstructs this document's real structure — its embedded bookmarks only covered two of six appendices (~57 of 452 pages).

```bash
# 0. ensure the source PDF is present (gitignored; re-download if missing)
curl -L -o source/oregon-prosperity-council-report-june-2026.pdf \
  "https://www.oregon.gov/gov/Documents/Oregon%20Prosperity%20Council%20Report_June%202026.pdf"

export DOCTREE_SKILL="$HOME/.claude/plugins/marketplaces/chris-skills/plugins/knowledge/skills/pdf-doctree"

# 1. extract text + bookmark outline + fingerprint
node "$DOCTREE_SKILL/scripts/run.mjs" extract --project-root .

# 2. reconstruct the TRUE structure → outline.override.json
#    (TOC + appendix dividers + Appendix E "Contents" list; the planner prefers
#     this over the PDF's partial bookmarks, and extract never clobbers it)
node scripts/build-outline.mjs

# 3. plan → emit  (the skill handles sparse-leaf files, multi-part nav, and
#                  oversized-page splitting natively as of v1.1.0)
node "$DOCTREE_SKILL/scripts/run.mjs" plan --project-root .
node "$DOCTREE_SKILL/scripts/run.mjs" emit --project-root .

# 4. enrich (Haiku TL;DRs via your Claude subscription) → merge → rollup
node "$DOCTREE_SKILL/scripts/run.mjs" enrich --project-root .
node "$DOCTREE_SKILL/scripts/run.mjs" merge  --project-root .
node "$DOCTREE_SKILL/scripts/run.mjs" rollup --project-root .

# 5. verify (structure, page coverage, PDF links, internal-link integrity)
node "$DOCTREE_SKILL/scripts/run.mjs" verify --project-root .
```

Enrichment requires the `claude` CLI on PATH (`claude` is authenticated via your subscription — no API key). It's idempotent and resumable.

### The one project-local script

| Script | What it does |
| --- | --- |
| `scripts/build-outline.mjs` | Reconstructs the document's real hierarchy (the PDF's bookmarks only covered Appendices D & F) from its printed Table of Contents, the appendix dividers, and the Appendix E "Contents" list — including all 47 named public submissions and Appendix F's 4 sections / 52 slides — and writes it to `outline.override.json`. The Appendix-E submission boundaries (`​.extracted/appendix-e-subs.json`) were mapped by a fan-out of parallel page-band readers. |

> The earlier `normalize-plan.mjs` and `postprocess-tree.mjs` helpers are gone: the fixes they made (promoting sparse sections to real files, cross-file part navigation, oversized-page splitting, internal-link checking) are now built into the `pdf-doctree` skill itself.

## Layout

```
tree/                 the doc tree (committed) — start at tree/INDEX.md
  INDEX.md            top-level map
  04-full-report/     Ch.1–5
  09-appendix-e-…/    47 public submissions
  10-appendix-f-…/    technical slides, grouped into 4 sections
.extracted/pages/     per-page raw extracted text (committed; raw-text fallback)
scripts/              project-local pipeline helpers
app/ lib/ components/  the Next.js static site
serve.mjs             zero-dependency static server — LOCAL PREVIEW ONLY (not the live path)
scripts/deploy-gov.mjs  one-command deploy to yex.ai/gov (see DEPLOY.md)
doctree.config.json   PDF path, upstream URL, enrichment prompt
CLAUDE.md             agent navigation contract
```

Unofficial mirror. All content is derived mechanically from the source PDF; not affiliated with the State of Oregon.

## License

The code in this repository (`app/`, `components/`, `lib/`, `scripts/`, and the build configuration) is released under the [MIT License](./LICENSE).

The report text under `tree/` and `.extracted/` is derived from the Oregon Prosperity Council Report (June 2026), published by the State of Oregon. That content belongs to its authors and is not covered by the MIT License. This is an unofficial index.
