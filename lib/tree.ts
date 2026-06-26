import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import MarkdownIt from "markdown-it";
import { withBase } from "./base";

export const REPO_ROOT = process.cwd();
export const TREE_DIR = path.join(REPO_ROOT, "tree");
export const PAGES_DIR = path.join(REPO_ROOT, ".extracted", "pages");

export const UPSTREAM_PDF_URL =
  "https://www.oregon.gov/gov/Documents/Oregon%20Prosperity%20Council%20Report_June%202026.pdf";
export const SITE_NAME = "Oregon Prosperity Council Report — June 2026";

export type Node = {
  /** absolute path to the .md file */
  fileAbs: string;
  /** path relative to tree/, e.g. "04-full-report/INDEX.md" */
  treeRel: string;
  /** site route, e.g. "/", "/n/04-full-report", "/n/.../slide-3-..." */
  route: string;
  kind: string; // index | section | meta
  title: string;
  breadcrumb: string[];
  pageRange: [number, number] | null;
  tldr: string | null;
  /** raw markdown body (frontmatter stripped) */
  body: string;
  /** raw full file content incl. frontmatter */
  raw: string;
  /** link form of route (trailing slash for pages), e.g. "/", "/n/04-full-report/" */
  href: string;
  /** static raw-markdown URL, e.g. "/raw/04-full-report/INDEX.md" */
  rawHref: string;
};

/** Canonical route -> link href (trailing slash for static hosting). */
export function hrefForRoute(route: string): string {
  return route === "/" ? "/" : route.replace(/\/?$/, "/");
}

// ── filesystem walk ───────────────────────────────────────────────────────────
function walk(dir: string, acc: string[] = []): string[] {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, acc);
    else if (ent.isFile() && ent.name.endsWith(".md")) acc.push(p);
  }
  return acc;
}

function routeForTreeRel(treeRel: string): string {
  // normalize separators
  const rel = treeRel.split(path.sep).join("/");
  if (rel === "INDEX.md") return "/";
  if (rel.endsWith("/INDEX.md")) return "/n/" + rel.slice(0, -"/INDEX.md".length);
  return "/n/" + rel.replace(/\.md$/, "");
}

function extractTitle(body: string, fallback: string): string {
  const m = body.match(/^#\s+(.+?)\s*$/m);
  const t = m ? m[1].trim() : fallback;
  // drop the chunk-pagination suffix ("-- Part 1 of 31", "— cont. 2") for display
  return t.replace(/\s+(--|—)\s+(Part\s+\d+\s+of\s+\d+|cont\.\s*\d+)$/i, "");
}

function extractTldr(body: string): string | null {
  const m = body.match(/<!-- enrich:begin -->([\s\S]*?)<!-- enrich:end -->/);
  if (!m) return null;
  const block = m[1];
  // prose paragraph that follows the "## TL;DR ..." heading
  const tm = block.match(/##\s+TL;DR[^\n]*\n+([\s\S]*?)(\n\n|\*\*Key points)/);
  if (tm) return tm[1].replace(/\s+/g, " ").trim();
  return null;
}

// ── module-level cache ────────────────────────────────────────────────────────
let _nodes: Node[] | null = null;
let _byRoute: Map<string, Node> | null = null;

export function getNodes(): Node[] {
  if (_nodes) return _nodes;
  const files = fs.existsSync(TREE_DIR) ? walk(TREE_DIR) : [];
  const nodes: Node[] = files.map((fileAbs) => {
    const raw = fs.readFileSync(fileAbs, "utf8");
    const parsed = matter(raw);
    const treeRel = path.relative(TREE_DIR, fileAbs);
    const body = parsed.content;
    const fm = parsed.data as Record<string, unknown>;
    const breadcrumb = Array.isArray(fm.breadcrumb) ? (fm.breadcrumb as string[]) : [];
    const pr = fm.page_range as number[] | undefined;
    return {
      fileAbs,
      treeRel,
      route: routeForTreeRel(treeRel),
      kind: (fm.kind as string) || "section",
      title: extractTitle(body, path.basename(treeRel, ".md")),
      breadcrumb,
      pageRange: Array.isArray(pr) && pr.length === 2 ? [pr[0], pr[1]] : null,
      tldr: extractTldr(body),
      body,
      raw,
      href: hrefForRoute(routeForTreeRel(treeRel)),
      rawHref: "/raw/" + treeRel.split(path.sep).join("/"),
    };
  });
  // stable order: by route
  nodes.sort((a, b) => a.route.localeCompare(b.route));
  _nodes = nodes;
  _byRoute = new Map(nodes.map((n) => [n.route, n]));
  return nodes;
}

export function getByRoute(route: string): Node | undefined {
  getNodes();
  return _byRoute!.get(route);
}

export function getRoot(): Node | undefined {
  return getByRoute("/");
}

/** Convert a tree slug array (from /n/[...slug]) to a Node. */
export function getNodeBySlug(slug: string[]): Node | undefined {
  return getByRoute("/n/" + slug.join("/"));
}

// ── link rewriting ────────────────────────────────────────────────────────────
/** Rewrite a single href (relative to fromFileAbs) into a site URL. */
export function rewriteHref(href: string, fromFileAbs: string): string {
  const trimmed = href.trim();
  if (/^[a-z]+:/i.test(trimmed) || trimmed.startsWith("#") || trimmed.startsWith("//")) {
    return trimmed; // external / absolute / pure-anchor
  }
  const [pathPart, frag] = trimmed.split("#");
  const abs = path.resolve(path.dirname(fromFileAbs), pathPart);

  // raw per-page text → static /raw-page/NNNN.txt
  const pageMatch = abs.match(/[/\\]\.extracted[/\\]pages[/\\]page-(\d+)\.txt$/);
  if (pageMatch) return `/raw-page/${pageMatch[1]}.txt`;

  // bare .extracted/pages directory link → point at the source PDF
  if (/[/\\]\.extracted[/\\]pages\/?$/.test(abs)) return UPSTREAM_PDF_URL;

  // internal tree markdown → node page route (trailing slash for static hosting)
  if (abs.startsWith(TREE_DIR) && abs.endsWith(".md")) {
    const treeRel = path.relative(TREE_DIR, abs);
    let r = hrefForRoute(routeForTreeRel(treeRel));
    if (frag) r += "#" + frag;
    return r;
  }
  // anything else: leave as-is
  return trimmed;
}

/**
 * Rewrite every markdown link target in a body relative to its source file.
 *
 * The output is rendered to raw <a> tags inside dangerouslySetInnerHTML, which
 * Next.js does NOT base-prefix — so we apply withBase() here. (rewriteHref
 * itself stays un-prefixed because parseContentsRows feeds its result into
 * <Link>, which Next auto-prefixes; prefixing there would double the base.)
 */
export function rewriteLinks(body: string, fromFileAbs: string): string {
  return body.replace(
    /\]\(([^)]+)\)/g,
    (_m, href) => `](${withBase(rewriteHref(href, fromFileAbs))})`
  );
}

// ── markdown rendering ────────────────────────────────────────────────────────
const md = new MarkdownIt({ html: false, linkify: true, typographer: false, breaks: false });

// Open external links in a new tab; mark the enrich block.
const defaultLinkOpen =
  md.renderer.rules.link_open ||
  ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));
md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
  const href = tokens[idx].attrGet("href") || "";
  if (/^https?:\/\//i.test(href)) {
    tokens[idx].attrSet("target", "_blank");
    tokens[idx].attrSet("rel", "noopener noreferrer");
  }
  return defaultLinkOpen(tokens, idx, options, env, self);
};

export function renderNodeHtml(node: Node): string {
  // strip the enrich HTML comment markers so they don't show, but keep the content
  let body = node.body.replace(/<!-- enrich:(begin|end) -->/g, "");
  body = body.replace(/<!-- \/?ppnav:[a-z]+ -->/g, "");
  body = rewriteLinks(body, node.fileAbs);
  return md.render(body);
}

/**
 * Render a node into a styled TL;DR callout + the remaining body.
 * The leading H1, the "> **Source:**" line, and the "Breadcrumb:" line are
 * stripped from the body because the page chrome shows them instead.
 */
export function renderNodeParts(node: Node): { tldrHtml: string | null; bodyHtml: string } {
  let src = node.body.replace(/<!-- \/?ppnav -->/g, "");

  let tldrSrc: string | null = null;
  const enrich = src.match(/<!-- enrich:begin -->([\s\S]*?)<!-- enrich:end -->/);
  if (enrich) {
    tldrSrc = enrich[1].trim();
    src = src.replace(enrich[0], "");
  }

  // strip the chrome-duplicated lines from the body
  src = src
    .replace(/^#\s+.+?\n/, "") // leading H1
    .replace(/^>\s+\*\*Source:\*\*.*\n/m, "") // source line
    .replace(/^Breadcrumb:.*\n/m, "") // breadcrumb line
    .replace(/^\s+/, "");

  const bodyHtml = md.render(rewriteLinks(src, node.fileAbs));
  const tldrHtml = tldrSrc ? md.render(rewriteLinks(tldrSrc, node.fileAbs)) : null;
  return { tldrHtml, bodyHtml };
}

export function renderMarkdownString(src: string): string {
  return md.render(src);
}

// ── parse an INDEX node's "Contents" table rows ──────────────────────────────
export type ChildRow = {
  kind: "doc" | "dir";
  title: string;
  href: string; // site route
  pageLabel: string;
  pdfHref: string;
  desc: string;
};

export function parseContentsRows(node: Node): ChildRow[] {
  const rows: ChildRow[] = [];
  const lineRe =
    /^\|\s*\[(doc|dir)\]\s*\[([^\]]+)\]\(([^)]+)\)\s*\|\s*\[([^\]]+)\]\(([^)]+)\)\s*\|\s*([\s\S]*?)\s*\|\s*$/;
  for (const line of node.body.split("\n")) {
    const m = line.match(lineRe);
    if (!m) continue;
    rows.push({
      kind: m[1] as "doc" | "dir",
      title: m[2].replace(/\\\|/g, "|").trim(),
      href: rewriteHref(m[3], node.fileAbs),
      pageLabel: m[4],
      pdfHref: rewriteHref(m[5], node.fileAbs),
      desc: m[6].replace(/\\\|/g, "|").replace(/\s+/g, " ").trim(),
    });
  }
  return rows;
}

// ── raw page text ─────────────────────────────────────────────────────────────
export function getPageText(n: string): string | null {
  const padded = n.padStart(4, "0");
  const p = path.join(PAGES_DIR, `page-${padded}.txt`);
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p, "utf8");
}

export function allPageNumbers(): string[] {
  if (!fs.existsSync(PAGES_DIR)) return [];
  return fs
    .readdirSync(PAGES_DIR)
    .map((f) => f.match(/^page-(\d+)\.txt$/)?.[1])
    .filter((x): x is string => Boolean(x));
}
