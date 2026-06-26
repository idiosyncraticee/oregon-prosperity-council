# Heading-aware sub-page subsection splitting

**Date:** 2026-06-25
**Status:** Approved (design), pending implementation
**Repo:** oregon-prosperity-council
**Touches:** the shared `pdf-doctree` plugin engine **and** this repo's `scripts/build-outline.mjs`

## Problem

`tree/04-full-report/chapter-5-talent-development.md` (and every other chapter) is a
single flat leaf covering 4–6 PDF pages (10–17 KB of Markdown). An AI navigating the
progressive-disclosure tree must load the *entire* chapter to answer a question about
one part of it. The user wants each chapter broken into its natural subsections so a
typical question lands on a ~2–4 KB leaf:

- Background and Problem Statement
- Summary of Stakeholder Feedback
- Shared Vision
- Priority Recommendations
- Additional Recommendations

(Not every chapter has all five — see "Per-chapter variance" below.)

## Why the current pipeline can't do this

The `pdf-doctree` engine slices leaves **only along whole-page boundaries**:

- `build-section-plan.mjs` (`assignPageRanges`) gives each outline entry a page range
  `[page, nextEntry.page - 1]`, and `chunkSections` only sub-splits a leaf when it
  exceeds `MAX_LEAF_TOKENS` (8000) — and even then, only on page boundaries.
- `emit-doc-tree.mjs` (`readPageRange`) builds a leaf's body by concatenating **full**
  page-text files for its range.

The chapter subsections are **not page-aligned**: e.g. in Chapter 5, "Shared Vision"
and "Priority Recommendations" both sit on page 30, and "Best Practices" (an inline
callout, not a standalone subsection) plus "Additional Recommendations" share page 31.
A page-range model fundamentally cannot separate them. We need **heading-aware,
sub-page splitting**.

## Discovered constraint: the override gap

The repo's `CLAUDE.md` documents that "the planner (pdf-doctree v1.1.0+) prefers
`outline.override.json` over the PDF's bookmarks." **This is not true of the installed
engine.** The installed `pdf-engine/VERSION` is `1.0.0`, and `runPlan` reads only
`.extracted/outline.json`. On disk:

- `.extracted/outline.json` — PDF bookmarks only (0 chapters; Appendix D & F only)
- `outline.override.json` — the full reconstructed structure (5 chapters)

So the documented override contract was never installed. This design closes that gap as
a prerequisite (the subsection data lives in `outline.override.json`, so the planner
must actually read it).

## Approach (approved)

Generalize the shared `pdf-doctree` engine to support declared, heading-delimited
subsections. Structure stays *data* in `outline.override.json`; the engine does the
slicing. Benefits every future doc, not just this one.

Engine location: `$HOME/.claude/plugins/marketplaces/chris-skills/plugins/knowledge/skills/pdf-doctree`
(referenced via `$DOCTREE_SKILL`).

### 1. Schema — `subsections` on an outline node

A node that is currently a leaf (no `children`) may declare an ordered `subsections`
array:

```json
{
  "title": "Chapter 5: Talent Development",
  "page": 28,
  "subsections": [
    { "title": "Background & Problem Statement", "heading": "Background and Problem Statement" },
    { "title": "Summary of Stakeholder Feedback" },
    { "title": "Shared Vision" },
    { "title": "Priority Recommendations" },
    { "title": "Additional Recommendations" }
  ]
}
```

- `heading` is the literal text line in the extracted page text that starts the
  subsection. It is **optional** and defaults to `title`.
- A node with a non-empty `subsections` array becomes an **index** node; each
  subsection becomes a **child leaf**.
- A node may have either `children` or `subsections`, not both. (If both are present,
  the engine warns and ignores `subsections`.)

### 2. Planner changes (`lib/pdf-engine/build-section-plan.mjs`)

**2a. Override support (prerequisite).** `runPlan` resolves its outline source as:
`<projectRoot>/outline.override.json` if it exists, else `<extractedDir>/outline.json`.
`runPlan`'s config must therefore carry `projectRoot` (already available via
`resolveProjectRoot()` in the thin wrapper `scripts/build-section-plan.mjs`; thread it
into `cfg`). Fallback preserves byte-identical behavior for any project without an
override file.

**2b. Subsection expansion pass.** After `linearize` → `assignPageRanges` →
`buildHierarchicalIds` → `textSizes`, run a new pass. For each flat node `n` carrying
`subsections`:

1. Build the concatenated text of `[n.startPage, n.endPage]` **with a char-offset → page
   map** (record the starting char offset of each page in the concatenation; the join
   uses `'\n'` exactly as `readPages` does so offsets stay consistent with emit).
2. Locate each declared subsection heading **sequentially**: search for heading *k*
   starting at the end offset of heading *k-1*. Match on a normalized, line-anchored,
   case-insensitive comparison (trim each line, collapse internal whitespace). Record
   each heading's char offset. **Warn and skip** any heading not found (this handles
   per-chapter variance gracefully).
3. Compute cut points so coverage is total with no gaps:
   - subsection 1 body = `text[0, offset₂)` — absorbs the chapter banner/preamble
   - subsection *k* (1 < k < n) body = `text[offsetₖ, offsetₖ₊₁)`
   - subsection *n* body = `text[offsetₙ, end)`
4. For each subsection, derive its **page range** from the offset map: the page
   containing the slice's first char through the page containing its last char.
   Adjacent subsections may share a boundary page (e.g. both cite p. 30). This overlap
   is in **citations only**, never in text, and verify tolerates it (see §5).
5. Convert `n` to `kind: 'index'`. Append a synthetic child leaf section for each found
   subsection, each carrying:
   - `breadcrumb: [...n.breadcrumb, subsection.title]`
   - `slug: '<n.slug>/<slugify(subsection.title)>'`
   - `level: n.level + 1`, `parentIndex: n.index`
   - `startPage` / `endPage` = the computed subsection page range
   - `chunks: [{ id: <slug>, pageRange: [start, end], slice: { startHeading, endHeading }, tokenEstimate }]`
     where `startHeading` is `null` for the first subsection (slice from top) and
     `endHeading` is `null` for the last (slice to end); `tokenEstimate` from the sliced
     text length.
   - `kind: 'leaf'`
6. Wire `n._childIndexes` / each child's `parentIndex` so the existing index/child
   plumbing (and `plan.sections[*].childIndexes`) is consistent.

The synthetic children are appended to the `kept`/`sections` array; downstream code
(emit, enrich, rollup) treats them as ordinary sections.

### 3. Emit changes (`lib/pdf-engine/emit-doc-tree.mjs`)

Add slice-aware body reading. Introduce `readChunkBody(cfg, chunk)`:

- Read `[chunk.pageRange[0], chunk.pageRange[1]]` via the existing
  `readPageWithReflows` path (same as `readPageRange`).
- If `chunk.slice` is present: split into lines, find the `startHeading` line
  (inclusive; `null` → from the top) and the `endHeading` line (exclusive; `null` → to
  the end) using the **same** normalized, line-anchored match as the planner, and return
  only that slice. Otherwise return the full concatenation (today's behavior).

`emitLeaf` calls `readChunkBody` instead of `readPageRange`. Frontmatter, source links,
breadcrumb, footer, and INDEX rendering already key off `pageRange` / `slug` /
`breadcrumb` and need no change. The chapter INDEX is produced automatically by
`emitIndex` (rollup TL;DR + a table of subsection children). Because the first
subsection absorbs the chapter banner, the existing `emitIndex` "intro" logic finds no
leftover preamble and the INDEX stays a clean landing page.

### 4. `scripts/build-outline.mjs` changes (this repo)

- Define the canonical chapter subsection skeleton (heading strings exactly as they
  appear in the extracted text):
  `Background and Problem Statement`, `Summary of Stakeholder Feedback`,
  `Shared Vision`, `Priority Recommendations`, `Additional Recommendations`.
- For each Chapter node, read its page-range text and attach a `subsections` array
  containing **only** the canonical headings actually present in that chapter, in
  document order. (`title` may be a lightly prettified label, e.g. `Background &
  Problem Statement`; `heading` is the exact in-text string.)
- The narrative `Introduction: Pillars of Prosperity` gets **no** subsections (it has no
  such headings) and stays a single leaf.
- The Executive Summary is out of scope for this pass (different internal structure).

**Per-chapter variance** (from scanning the current leaves — re-verify at
implementation time):
- Ch. 1: Background, Stakeholder Feedback, Shared Vision, Additional Recommendations
  (no "Priority Recommendations" heading)
- Ch. 2: Background, Stakeholder Feedback, Shared Vision, Priority Recommendations
  (no "Additional Recommendations" heading)
- Ch. 3–5: all five
The "scan and include only what's present" logic makes this self-maintaining, so the
exact per-chapter lists do not need to be hard-coded.

### 5. Verify (`verify-doc-tree.mjs`) — no change needed

Confirmed safe:
- Coverage is an OR'd boolean array over pages, so **overlapping citations pass**.
- Leaf size limit is 15000 tokens (subsection leaves are far smaller; the old flat
  chapter at ~14 KB was near the line). Index limit is 12000 tokens (chapter INDEX is
  small).
- Every directory must contain `INDEX.md`; emit writes one for each index node.
- PDF/raw links must resolve; subsection leaves cite real pages.

### 6. Cleanup, rebuild, hygiene

- **Orphaned sidecars:** when `chapter-N-….md` becomes `chapter-N-…/INDEX.md`, the old
  sibling `chapter-N-….enrich.json` is preserved by `wipeOutputPreserving` (which keeps
  `.enrich.json`) but is now orphaned. Delete these stale chapter-level sidecars so
  rollup/merge regenerate fresh per-leaf TL;DRs and the chapter INDEX TL;DR.
- **Rebuild:** `build-outline` → `plan` → `emit` → `verify` → `enrich` → `merge` →
  `rollup`, then `npm run build`.
- **Engine versioning:** bump `pdf-engine/VERSION` (1.1.0 = override support, 1.2.0 =
  subsections) and update the skill's `SKILL.md` / `README.md` notes describing the
  `subsections` field and override resolution.

### 7. Testing

Add a focused, self-contained test under the skill (the engine currently ships no test
harness — add a minimal `scripts/test/` runner or a single `*.test.mjs` invoked by
`node`):

- Synthetic fixture: a handful of `page-NNNN.txt` files with known headings spanning
  page boundaries, plus an `outline.override.json` declaring subsections (including one
  heading deliberately absent, and a subsection boundary that falls mid-page).
- Run `plan` then `emit` against the fixture and assert:
  1. the parent node became an index with the expected number of child leaves
  2. each subsection leaf's body contains its own heading and **not** the next
     subsection's heading (correct slice boundaries)
  3. the first subsection includes the preamble/banner text
  4. an absent declared heading is skipped with a warning (no crash, no empty leaf)
  5. total page coverage is complete and boundary-page citations overlap as expected

## Result

`/n/04-full-report/chapter-5-talent-development/` becomes an **index** page listing five
individually navigable subsection leaves (each ~2–4 KB), and the same applies to all
five chapters. The engine is now general enough to do heading-aware splitting for any
future document by declaring `subsections` in its override outline.

## Non-goals

- Splitting the Executive Summary or appendices (future, declarable later).
- Auto-detecting headings from text (declared headings only — robust against mangled
  PDF extraction and inconsistent presence).
- Any change to the website's rendering code (it already renders index dirs + leaves
  from the tree).
