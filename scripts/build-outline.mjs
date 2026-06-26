#!/usr/bin/env node
// Doc-specific outline synthesizer for the Oregon Prosperity Council Report.
//
// WHY THIS EXISTS:
// The source PDF's embedded bookmark outline only covers Appendix D (pp.87-91)
// and Appendix F (pp.401-452) — leaving ~395 pages of the actual report with no
// structure. Auto-planning from that outline dumps the entire body into one
// mislabeled leaf. This script reconstructs the document's TRUE structure from
// its printed Table of Contents (p.3), the Appendix dividers, and the Appendix E
// "Contents" list, then writes a clean hierarchical `outline.override.json` that
// the pdf-doctree planner (stage 2, v1.1.0+) consumes INSTEAD of the bookmark
// outline. The override lives at the project root so re-running `extract` never
// clobbers it. (Before v1.1.0 this wrote `.extracted/outline.json` directly.)
//
// Inputs:
//   .extracted/outline.json          — the raw bookmark outline from `extract` (for App F slide titles+pages)
//   .extracted/appendix-e-subs.json  — { submissions: [{startPage, title}, ...] } in document order
// Output:
//   outline.override.json            — synthesized hierarchical outline (committed)
//
// Re-run plan -> emit -> merge -> rollup -> verify after this to regenerate the tree.

import { readFile, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const EX = join(ROOT, '.extracted');

const PAGE_COUNT = 452;

// ---- Chapter subsections: heading-aware sub-page splitting ----
// Each Full Report chapter follows a canonical skeleton of in-text headings.
// We declare the full skeleton once, then SCAN each chapter's extracted page
// text and attach only the headings actually present (per-chapter variance is
// real: e.g. Ch.1 has no "Priority Recommendations", Ch.2 no "Additional
// Recommendations"). The `heading` is the EXACT in-text line; `title` is a
// lightly prettified label. The downstream planner (pdf-doctree v1.2.0+) reads
// `subsections` and slices each chapter leaf along these headings. See
// docs/superpowers/specs/2026-06-25-heading-aware-subsection-splitting-design.md
const CHAPTER_SUBSECTIONS = [
  { title: 'Background & Problem Statement', heading: 'Background and Problem Statement' },
  { title: 'Summary of Stakeholder Feedback', heading: 'Summary of Stakeholder Feedback' },
  { title: 'Shared Vision', heading: 'Shared Vision' },
  { title: 'Priority Recommendations', heading: 'Priority Recommendations' },
  { title: 'Additional Recommendations', heading: 'Additional Recommendations' },
];

// Normalize a line for matching: trim, collapse internal whitespace, lowercase.
const normLine = (s) => String(s).trim().replace(/\s+/g, ' ').toLowerCase();

// Read the extracted text for a page (1-based), or '' if it doesn't exist.
function readPageText(page) {
  const f = join(EX, 'pages', `page-${String(page).padStart(4, '0')}.txt`);
  return existsSync(f) ? readFileSync(f, 'utf8') : '';
}

// Scan pages [startPage, endPage] and return the canonical subsections whose
// heading appears as a line-anchored, normalized match, preserving canonical order.
function scanChapterSubsections(startPage, endPage) {
  const lines = new Set();
  for (let p = startPage; p <= endPage; p++) {
    for (const line of readPageText(p).split('\n')) lines.add(normLine(line));
  }
  return CHAPTER_SUBSECTIONS.filter((s) => lines.has(normLine(s.heading))).map((s) => ({
    title: s.title,
    heading: s.heading,
  }));
}

// ---- Appendix F: regroup the 52 bookmark "slides" under their 4 sections ----
// The original outline has an "Appendix F ... .pdf" node whose children are
// "Slide N: Title" entries (pages 401-452). Slides 2/26/34/39 are section
// dividers; slide 1 is the title slide. We turn the 4 dividers into section
// indexes and nest the content slides beneath them.
function buildAppendixF(originalOutline) {
  // find the Appendix F pass-through node (title ends in .pdf, contains "Technical")
  const fNode = findNode(originalOutline, (n) =>
    /technical appendix\.pdf$/i.test(n.title || '') ||
    (/\.pdf$/i.test(n.title || '') && (n.children || []).some((c) => /^slide\s*1\b/i.test(c.title || '')))
  );
  const slides = (fNode?.children || [])
    .map((c) => {
      const m = String(c.title || '').match(/^slide\s*(\d+)\s*:?\s*(.*)$/i);
      return { num: m ? Number(m[1]) : null, title: (m ? m[2] : c.title || '').trim(), page: c.page };
    })
    .filter((s) => Number.isInteger(s.page));

  // Section dividers by slide number -> {sectionTitle, dividerPage}
  const sectionDefs = [
    { num: 2, title: 'Section 1: Economic Competitiveness' },
    { num: 26, title: 'Section 2: Tax Burden' },
    { num: 34, title: 'Section 3: Comprehensive Tax Reform Scenarios' },
    { num: 39, title: 'Section 4: What Is Good Growth? Productivity, Labor Share & Compensation' },
  ];
  const dividerNums = new Set(sectionDefs.map((s) => s.num));

  // Assign each content slide to the most recent section divider that precedes it.
  const sections = sectionDefs.map((d) => {
    const div = slides.find((s) => s.num === d.num);
    return { title: d.title, page: div ? div.page : null, children: [] };
  });
  for (const s of slides) {
    if (s.num === 1 || dividerNums.has(s.num)) continue; // skip title + dividers
    // find owning section: last section whose divider page <= slide page
    let owner = null;
    for (const sec of sections) {
      if (sec.page != null && s.page >= sec.page) owner = sec;
    }
    if (!owner) owner = sections[0];
    owner.children.push({
      title: `Slide ${s.num}: ${s.title}`,
      page: s.page,
      children: [],
    });
  }
  return {
    title: 'Appendix F: Technical Report — Data & Research',
    page: 400, // divider page; title slide is 401
    children: sections,
  };
}

function findNode(nodes, pred) {
  for (const n of nodes) {
    if (pred(n)) return n;
    const hit = findNode(n.children || [], pred);
    if (hit) return hit;
  }
  return null;
}

// ---- Appendix E: 47 submissions become named leaves under the appendix index ----
function buildAppendixE(subs) {
  // subs: [{startPage, title}] in document order. Number them for stable, ordered slugs.
  const children = [
    { title: 'Submissions & Feedback — Contents', page: 93, children: [] },
  ];
  subs.forEach((s, i) => {
    const n = String(i + 1).padStart(2, '0');
    children.push({
      title: `${n}. ${s.title}`,
      page: s.startPage,
      children: [],
    });
  });
  return {
    title: 'Appendix E: Submissions & Feedback',
    page: 92, // divider page; contents on 93-94
    children,
  };
}

async function main() {
  // Raw bookmark outline from `extract` (used only for Appendix F's 52 slide
  // titles/pages). Fall back to the legacy backup if present.
  const rawOutlinePath = existsSync(join(EX, 'outline.json'))
    ? join(EX, 'outline.json')
    : join(EX, 'outline.original.json');
  const original = JSON.parse(await readFile(rawOutlinePath, 'utf8'));
  const subsRaw = JSON.parse(await readFile(join(EX, 'appendix-e-subs.json'), 'utf8'));
  const subs = subsRaw.submissions || subsRaw;

  const outline = [
    { title: 'Cover & Acknowledgments', page: 1, children: [] },
    { title: 'Table of Contents', page: 3, children: [] },
    { title: 'Executive Summary', page: 4, children: [] },
    {
      title: 'Full Report',
      page: 9,
      children: [
        { title: 'Introduction: Pillars of Prosperity', page: 9, children: [] },
        { title: 'Chapter 1: Statewide Economic Development Strategy & Structural Reform', page: 13, children: [] },
        { title: 'Chapter 2: Taxes', page: 16, children: [] },
        { title: 'Chapter 3: Permitting & Regulations', page: 21, children: [] },
        { title: 'Chapter 4: Site Readiness & Infrastructure', page: 25, children: [] },
        { title: 'Chapter 5: Talent Development', page: 28, children: [] },
      ],
    },
    { title: 'Appendix A: Prosperity Council Engagement Report', page: 34, children: [] },
    { title: 'Appendix B: Prosperity Council Survey Questions', page: 51, children: [] },
    { title: 'Appendix C: Survey Data', page: 55, children: [] },
    { title: "Appendix D: Listening Session Facilitators' Guide", page: 86, children: [] },
    buildAppendixE(subs),
    buildAppendixF(original),
  ];

  // Attach heading-delimited `subsections` to each Full Report chapter by scanning
  // its page range. The chapter's range runs from its own page to the page before
  // the next Full Report sibling (and the last chapter to the page before whatever
  // follows Full Report — Appendix A). The Introduction is narrative and gets none.
  const fullReport = outline.find((n) => n.title === 'Full Report');
  const fullReportIdx = outline.indexOf(fullReport);
  const afterFullReport = outline[fullReportIdx + 1]; // Appendix A
  const sib = fullReport.children;
  const chapterCounts = [];
  for (let i = 0; i < sib.length; i++) {
    const node = sib[i];
    if (!/^Chapter\b/.test(node.title)) continue; // skip the Introduction
    const next = sib[i + 1] || afterFullReport;
    const endPage = next.page - 1;
    const subsections = scanChapterSubsections(node.page, endPage);
    node.subsections = subsections;
    chapterCounts.push(`${node.title.match(/^Chapter\s+\d+/)[0]}=${subsections.length}`);
  }

  // Write the project-root override that the planner (v1.1.0+) prefers over the
  // PDF's bookmark outline. extract never clobbers this.
  await writeFile(join(ROOT, 'outline.override.json'), JSON.stringify(outline, null, 2));

  const countLeaves = (nodes) =>
    nodes.reduce((a, n) => a + (n.children?.length ? countLeaves(n.children) : 1), 0);
  console.error(
    `[build-outline] top=${outline.length} leaves≈${countLeaves(outline)} ` +
      `appendixE_subs=${subs.length} pageCount=${PAGE_COUNT}`
  );
  console.error(`[build-outline] chapter subsections: ${chapterCounts.join(' ')}`);
}

main().catch((e) => {
  console.error('[build-outline] FAILED:', e.message);
  process.exit(1);
});
