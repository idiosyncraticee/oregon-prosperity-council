#!/usr/bin/env node
// Prebuild: generate the static, agent-facing assets that live under public/ and
// are served as plain files behind the Cloudflare tunnel (no Node runtime needed):
//   public/raw/<treeRel>        raw markdown for every node ("view raw markdown")
//   public/raw-page/<NNNN>.txt  raw per-page extracted text (citation fallback)
//   public/search-index.json    client search index (title + summary + route)
//   public/llms.txt             machine-readable map for LLM agents (llmstxt.org)
//   public/llms-full.txt        every section's title + AI summary + source link
//   public/robots.txt           allow all + sitemap pointer
//   public/sitemap.xml          all page routes (absolute if SITE_URL is set)
//
// Run automatically via the npm `prebuild` hook before `next build`.

import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, rmSync, existsSync, copyFileSync } from "node:fs";
import { join, relative, dirname, sep } from "node:path";

const ROOT = process.cwd();
const TREE = join(ROOT, "tree");
const PAGES = join(ROOT, ".extracted", "pages");
const PUBLIC = join(ROOT, "public");
const SITE_URL = (process.env.SITE_URL || "").replace(/\/$/, ""); // e.g. https://prosperity.example.org
const UPSTREAM_PDF = "https://www.oregon.gov/gov/Documents/Oregon%20Prosperity%20Council%20Report_June%202026.pdf";

function walk(dir, acc = []) {
  if (!existsSync(dir)) return acc;
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, ent.name);
    if (ent.isDirectory()) walk(p, acc);
    else if (ent.isFile() && ent.name.endsWith(".md")) acc.push(p);
  }
  return acc;
}

function parseFrontmatter(raw) {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?/);
  const data = {};
  let body = raw;
  if (m) {
    body = raw.slice(m[0].length);
    for (const line of m[1].split("\n")) {
      const km = line.match(/^(\w+):\s*(.*)$/);
      if (!km) continue;
      let [, k, v] = km;
      v = v.trim();
      if (/^\[.*\]$/.test(v)) {
        try { data[k] = JSON.parse(v.replace(/'/g, '"')); } catch { data[k] = v; }
      } else data[k] = v.replace(/^["']|["']$/g, "");
    }
  }
  return { data, body };
}

function routeForTreeRel(treeRel) {
  const rel = treeRel.split(sep).join("/");
  if (rel === "INDEX.md") return "/";
  if (rel.endsWith("/INDEX.md")) return "/n/" + rel.slice(0, -"/INDEX.md".length);
  return "/n/" + rel.replace(/\.md$/, "");
}
const hrefForRoute = (r) => (r === "/" ? "/" : r.replace(/\/?$/, "/"));

function title(body, fallback) {
  const m = body.match(/^#\s+(.+?)\s*$/m);
  const t = m ? m[1].trim() : fallback;
  return t.replace(/\s+(--|—)\s+(Part\s+\d+\s+of\s+\d+|cont\.\s*\d+)$/i, "");
}
function tldr(body) {
  const m = body.match(/<!-- enrich:begin -->([\s\S]*?)<!-- enrich:end -->/);
  if (!m) return "";
  const t = m[1].match(/##\s+TL;DR[^\n]*\n+([\s\S]*?)(\n\n|\*\*Key points)/);
  return t ? t[1].replace(/\s+/g, " ").trim() : "";
}

function ensureDir(p) { mkdirSync(p, { recursive: true }); }

// ── clean & rebuild generated public assets (preserve hand-authored files) ─────
for (const d of ["raw", "raw-page"]) {
  const p = join(PUBLIC, d);
  if (existsSync(p)) rmSync(p, { recursive: true, force: true });
}
ensureDir(PUBLIC);

const files = walk(TREE);
const nodes = files.map((fileAbs) => {
  const raw = readFileSync(fileAbs, "utf8");
  const { data, body } = parseFrontmatter(raw);
  const treeRel = relative(TREE, fileAbs).split(sep).join("/");
  const route = routeForTreeRel(treeRel);
  return {
    fileAbs, treeRel, route, href: hrefForRoute(route),
    kind: data.kind || "section",
    title: title(body, treeRel),
    breadcrumb: Array.isArray(data.breadcrumb) ? data.breadcrumb : [],
    pageRange: Array.isArray(data.page_range) ? data.page_range : null,
    tldr: tldr(body), raw,
  };
}).sort((a, b) => a.route.localeCompare(b.route));

// 1) raw markdown copies
for (const n of nodes) {
  const dest = join(PUBLIC, "raw", n.treeRel);
  ensureDir(dirname(dest));
  writeFileSync(dest, n.raw);
}

// 2) raw page text copies
let pageCount = 0;
if (existsSync(PAGES)) {
  ensureDir(join(PUBLIC, "raw-page"));
  for (const f of readdirSync(PAGES)) {
    const m = f.match(/^page-(\d+)\.txt$/);
    if (!m) continue;
    copyFileSync(join(PAGES, f), join(PUBLIC, "raw-page", `${m[1]}.txt`));
    pageCount++;
  }
}

// helpers to distinguish real sections from chunk-part / continuation artifacts
const isCont = (route) => /-cont-\d+$/.test(route);
const isChunkPart = (route) => /-(part|cont)-\d+$/.test(route);

// 3) search index (exclude continuation files: they carry no summary)
const pagesLabel = (pr) => (!pr ? "" : pr[0] === pr[1] ? `p. ${pr[0]}` : `pp. ${pr[0]}–${pr[1]}`);
const searchEntries = nodes
  .filter((n) => n.kind !== "meta" && !isCont(n.route))
  .map((n) => ({
    title: n.title,
    href: n.href,
    crumb: n.breadcrumb.slice(0, -1).join(" › ") || "Report",
    tldr: n.tldr,
    pages: pagesLabel(n.pageRange),
  }));
writeFileSync(join(PUBLIC, "search-index.json"), JSON.stringify(searchEntries));

// 4) llms.txt (llmstxt.org convention) — a clean hierarchical map, excluding
//    chunk-part artifacts. Index sections (Full Report, Appendix E, Appendix F)
//    get their direct children nested beneath them.
const abs = (href) => (SITE_URL ? SITE_URL + href : href);
const linkLine = (n, indent = "") =>
  `${indent}- [${n.title}](${abs(n.href)})${n.tldr ? ": " + n.tldr.replace(/\n/g, " ") : ""}`;
const realNodes = nodes.filter((n) => n.kind !== "meta" && !isChunkPart(n.route));
const topLevel = realNodes.filter((n) => n.breadcrumb.length === 1).sort((a, b) => a.route.localeCompare(b.route));
const pageStart = (n) => (n.pageRange ? n.pageRange[0] : 1e9);
const childrenOf = (parentTitle) =>
  realNodes
    .filter((n) => n.breadcrumb.length === 2 && n.breadcrumb[0] === parentTitle)
    .sort((a, b) => pageStart(a) - pageStart(b) || a.route.localeCompare(b.route));

const llms = [];
llms.push(`# Oregon Prosperity Council Report — June 2026`);
llms.push("");
llms.push(`> Recommendations for Oregon's Long-Term Competitiveness & Prosperity. The Prosperity Council's June 2026 report to Governor Tina Kotek: 10 priority recommendations across economic development, taxes, permitting, site readiness, and talent, plus the full engagement record and technical research behind them.`);
llms.push("");
llms.push(`This site is a progressive-disclosure mirror of the 452-page report, split into small, summarized, cross-linked sections so an AI agent can navigate it without loading the whole PDF. Every page has an AI-written summary and links back to the exact source page. Append the "view raw markdown" path (under /raw/) to fetch any section's source. The complete document is at ${UPSTREAM_PDF}.`);
llms.push("");
llms.push(`## Report`);
for (const n of topLevel) {
  if (/Appendix [EF]:/.test(n.title)) continue; // listed in their own sections below
  llms.push(linkLine(n));
  if (n.kind === "index") for (const c of childrenOf(n.title)) llms.push(linkLine(c, "  "));
}
llms.push("");
llms.push(`## Public submissions — Appendix E (47 organizations & individuals)`);
const appE = topLevel.find((n) => /Appendix E:/.test(n.title));
if (appE) { llms.push(linkLine(appE)); for (const c of childrenOf(appE.title)) llms.push(linkLine(c, "  ")); }
llms.push("");
llms.push(`## Technical report — Appendix F (data & research)`);
const appF = topLevel.find((n) => /Appendix F:/.test(n.title));
if (appF) { llms.push(linkLine(appF)); for (const c of childrenOf(appF.title)) llms.push(linkLine(c, "  ")); }
llms.push("");
llms.push(`## Reference`);
llms.push(`- [Full report index](${abs("/")})`);
llms.push(`- [Search](${abs("/search/")})`);
llms.push(`- [Every section summarized (llms-full.txt)](${abs("/llms-full.txt")})`);
llms.push(`- [Source PDF (oregon.gov)](${UPSTREAM_PDF})`);
llms.push("");
writeFileSync(join(PUBLIC, "llms.txt"), llms.join("\n"));

// 5) llms-full.txt — every section's title + summary + source link
const full = [];
full.push(`# Oregon Prosperity Council Report — June 2026 — Full Section Digest`);
full.push("");
full.push(`Every section of the report with its AI-written summary and source page. Generated from the progressive-disclosure tree. Source PDF: ${UPSTREAM_PDF}`);
full.push("");
for (const n of nodes) {
  if (n.kind === "meta" || isCont(n.route)) continue; // continuation files carry no summary
  full.push(`## ${n.title}`);
  const meta = [];
  if (n.pageRange) meta.push(`Pages ${n.pageRange[0]}–${n.pageRange[1]} (${UPSTREAM_PDF}#page=${n.pageRange[0]})`);
  meta.push(`Page: ${abs(n.href)}`);
  full.push(meta.join(" · "));
  if (n.tldr) { full.push(""); full.push(n.tldr); }
  full.push("");
}
writeFileSync(join(PUBLIC, "llms-full.txt"), full.join("\n"));

// 6) robots.txt
const robots = [
  "User-agent: *",
  "Allow: /",
  SITE_URL ? `Sitemap: ${SITE_URL}/sitemap.xml` : "# Set SITE_URL at build time to emit an absolute Sitemap URL here.",
  "",
].join("\n");
writeFileSync(join(PUBLIC, "robots.txt"), robots);

// 7) sitemap.xml
const urls = ["/", "/search/", ...nodes.filter((n) => n.route !== "/").map((n) => n.href)];
const base = SITE_URL || "";
const sitemap =
  `<?xml version="1.0" encoding="UTF-8"?>\n` +
  `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
  urls.map((u) => `  <url><loc>${base}${u}</loc></url>`).join("\n") +
  `\n</urlset>\n`;
writeFileSync(join(PUBLIC, "sitemap.xml"), sitemap);

console.error(
  `[gen-public-assets] nodes=${nodes.length} raw-pages=${pageCount} search=${searchEntries.length} ` +
    `llms.txt+full+sitemap+robots written${SITE_URL ? ` (SITE_URL=${SITE_URL})` : " (relative URLs; set SITE_URL for absolute)"}`
);
