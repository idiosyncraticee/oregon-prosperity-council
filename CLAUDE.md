# CLAUDE.md

Guidance for Claude Code (and other agents) working in this repo.

## What this repo is

A progressive-disclosure index of the **Oregon Prosperity Council Report (June 2026)** — a 452-page PDF split into ~150 small, summarized, cross-linked Markdown sections under [`tree/`](./tree/INDEX.md), plus a static website (Next.js export) that serves the tree for browsing, search, and AI navigation. The site is meant to be self-hosted behind a Cloudflare Tunnel.

The tree under `tree/` is the **source of truth** for any question about this document. Every leaf cites its exact PDF pages; every AI summary bullet has a page anchor.

## Rules for answering questions about the report

1. **Never read the source PDF directly.** It costs 100K+ tokens. Always navigate `tree/` instead.
2. **Start at [`tree/INDEX.md`](./tree/INDEX.md).** Follow links down: area `INDEX.md` → sub-`INDEX.md` → leaf. A typical question lands on a leaf in 2–3 hops, loading <20KB.
3. **Use the `## TL;DR` blocks.** Each leaf has a Haiku-generated summary between `<!-- enrich:begin -->` / `<!-- enrich:end -->`, with per-bullet `#page=N` citations. The raw text below it is ground truth if you need a specific number or quote.
4. **Cite PDF pages.** Reproduce the `…oregon.gov…#page=N` links so the user can verify.
5. **If a leaf's text looks mangled** (Appendix C survey data is column-shredded by PDF extraction), open the raw page text at `.extracted/pages/page-NNNN.txt` — it's the exact extracted text and is greppable.
6. **Never fabricate numbers, positions, or attributions.** If you can't cite a page, say so.

### Where things are

| Topic | Location |
| --- | --- |
| The 10 priority recommendations | [`tree/03-executive-summary.md`](./tree/03-executive-summary.md) |
| Policy detail (econ dev, taxes, permitting, site readiness, talent) | [`tree/04-full-report/`](./tree/04-full-report/INDEX.md) |
| How the public was engaged / survey | Appendices A–C (`tree/05…`, `06…`, `07…`) |
| What 47 organizations & individuals submitted | [`tree/09-appendix-e-submissions-feedback/`](./tree/09-appendix-e-submissions-feedback/INDEX.md) |
| The data & charts behind the findings | [`tree/10-appendix-f-…/`](./tree/10-appendix-f-technical-report-data-research/INDEX.md) |

## Rebuilding the tree or the site

See [`README.md`](./README.md). Short version:

```bash
export DOCTREE_SKILL="$HOME/.claude/plugins/marketplaces/chris-skills/plugins/knowledge/skills/pdf-doctree"
node "$DOCTREE_SKILL/scripts/run.mjs" extract --project-root .
node scripts/build-outline.mjs        # writes outline.override.json
node "$DOCTREE_SKILL/scripts/run.mjs" plan --project-root .
node "$DOCTREE_SKILL/scripts/run.mjs" emit --project-root .
node "$DOCTREE_SKILL/scripts/run.mjs" enrich --project-root . && node "$DOCTREE_SKILL/scripts/run.mjs" merge --project-root . && node "$DOCTREE_SKILL/scripts/run.mjs" rollup --project-root .
node "$DOCTREE_SKILL/scripts/run.mjs" verify --project-root .

npm install && npm run build && PORT=8788 npm run serve    # the website
```

## Why the tree was reconstructed (don't undo this)

The PDF's embedded bookmark outline only covered Appendix D (pp.87–91) and Appendix F (pp.401–452) — leaving ~395 pages with no structure. The real hierarchy is rebuilt by `scripts/build-outline.mjs` from the printed Table of Contents (p.3), the appendix divider pages, and the Appendix E "Contents" list, and written to **`outline.override.json`** (committed). The planner (`pdf-doctree` v1.1.0+) prefers `outline.override.json` over the PDF's bookmarks, and `extract` never clobbers it — so re-running `extract` is safe. If you change the structure, edit `build-outline.mjs` and re-run it before `plan`.

## Gotchas

- **Scripts split across two homes.** The pipeline lives in the `pdf-doctree` plugin (`$DOCTREE_SKILL`, v1.1.0+ — it now handles sparse-leaf files, multi-part navigation, oversized-page splitting, and internal-link checking natively). Only the document-specific structure reconstruction (`scripts/build-outline.mjs`) and the web-asset generator (`scripts/gen-public-assets.mjs`) live here.
- **`--json-schema` is a trap** for the enrich step (`claude -p`). The pipeline embeds the schema in the system prompt instead. Don't add it.
- **Generated public/ assets** (`public/raw/`, `public/raw-page/`, `llms.txt`, etc.) are rebuilt by `scripts/gen-public-assets.mjs` on every `build`/`dev` — don't hand-edit them.
- **`out/` is the deployable.** It's a pure static export; serve with `serve.mjs` (zero deps) or any static host.
