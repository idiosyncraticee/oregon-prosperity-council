// Base-path awareness for composition into yex.ai under /gov/oregon/prosperity-council.
//
// When BASE_PATH is set at build time, Next.js AUTO-PREFIXES `<Link>` hrefs and
// `_next` assets — those must be left as bare root-absolute paths (`/n/...`).
// But Next does NOT touch:
//   • plain `<a href="/...">` (nav/footer llms.txt, "view raw markdown")
//   • `fetch("/...")` from client components (the search index)
//   • links inside markdown rendered via dangerouslySetInnerHTML
// Those surfaces must be prefixed manually with `withBase()`.
//
// The base path is exposed to BOTH server and client bundles as
// NEXT_PUBLIC_BASE_PATH (injected by next.config.mjs via `env`), so this module
// works identically in server components, client components, and SSG.

export const BASE =
  process.env.NEXT_PUBLIC_BASE_PATH || process.env.BASE_PATH || "";

/**
 * Prefix a root-absolute path with the configured base path.
 *
 * Only touches paths that begin with a single "/" — external URLs
 * (`https://…`), protocol-relative (`//host`), anchors (`#…`), and relative
 * paths are returned unchanged. Idempotent: a path already under BASE is left
 * as-is, so it is safe to call more than once.
 */
export function withBase(p: string): string {
  if (!BASE) return p;
  if (!p.startsWith("/") || p.startsWith("//")) return p; // external/relative/anchor
  if (p === BASE || p.startsWith(BASE + "/")) return p; // already prefixed
  return BASE + p;
}
