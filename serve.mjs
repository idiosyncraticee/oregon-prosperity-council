#!/usr/bin/env node
// Zero-dependency static file server for the exported site (out/), built to sit
// behind a Cloudflare Tunnel. Handles clean URLs (trailingSlash export →
// directory/index.html), correct content types, and basic caching headers.
//
//   npm run build      # produces ./out
//   PORT=8788 npm run serve
//   cloudflared tunnel --url http://localhost:8788
//
// No framework, no runtime deps — just Node's http + fs.

import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { join, normalize, extname } from "node:path";

const ROOT = join(process.cwd(), process.env.SITE_DIR || "out");
const PORT = Number(process.env.PORT || 8788);
const HOST = process.env.HOST || "0.0.0.0";

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".png": "image/png",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
};

async function tryFiles(urlPath) {
  // candidate resolution order for a request path
  const clean = decodeURIComponent(urlPath.split("?")[0]);
  const safe = normalize(clean).replace(/^(\.\.[/\\])+/, "");
  const candidates = [];
  if (safe.endsWith("/")) {
    candidates.push(join(ROOT, safe, "index.html"));
  } else {
    candidates.push(join(ROOT, safe)); // exact file (e.g. /raw/x.md, /llms.txt)
    candidates.push(join(ROOT, safe + ".html")); // /n/foo → n/foo.html (defensive)
    candidates.push(join(ROOT, safe, "index.html")); // /n/foo → n/foo/index.html
  }
  for (const c of candidates) {
    try {
      const s = await stat(c);
      if (s.isFile()) return c;
    } catch {
      /* keep trying */
    }
  }
  return null;
}

const server = createServer(async (req, res) => {
  try {
    const file = await tryFiles(req.url || "/");
    if (!file) {
      const nf = join(ROOT, "404.html");
      try {
        const body = await readFile(nf);
        res.writeHead(404, { "content-type": "text/html; charset=utf-8" });
        return res.end(body);
      } catch {
        res.writeHead(404, { "content-type": "text/plain" });
        return res.end("404 Not Found");
      }
    }
    const body = await readFile(file);
    const type = TYPES[extname(file).toLowerCase()] || "application/octet-stream";
    const cache = file.endsWith(".html")
      ? "public, max-age=0, must-revalidate"
      : "public, max-age=3600";
    res.writeHead(200, { "content-type": type, "cache-control": cache });
    res.end(body);
  } catch (err) {
    res.writeHead(500, { "content-type": "text/plain" });
    res.end("500 Internal Server Error");
    console.error(err);
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Serving ${ROOT} at http://${HOST}:${PORT}`);
  console.log(`Cloudflare tunnel:  cloudflared tunnel --url http://localhost:${PORT}`);
});
