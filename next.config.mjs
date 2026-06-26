// When composed into yex.ai, this explorer is served at a sub-path behind a
// Cloudflare Tunnel. Set BASE_PATH=/gov/oregon/prosperity-council (yex.ai's
// scripts/deploy-tunnel.mjs passes this automatically) to build with that base;
// unset, it builds at the root for standalone hosting. Next prefixes all asset
// and <Link> URLs with basePath automatically.
const BASE_PATH = process.env.BASE_PATH; // e.g. "/gov/oregon/prosperity-council"

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Fully static export — a folder of HTML/MD/TXT that any static server can host
  // (designed to be served behind a Cloudflare Tunnel with no Node runtime).
  output: "export",
  trailingSlash: true,
  reactStrictMode: true,
  images: { unoptimized: true },
  ...(BASE_PATH ? { basePath: BASE_PATH, assetPrefix: BASE_PATH } : {}),
  // Expose the base path to both server and client bundles so lib/base.ts can
  // prefix the surfaces Next does NOT auto-prefix (plain <a>, fetch, markdown
  // links). Always defined (empty string at root) so client reads never throw.
  env: { NEXT_PUBLIC_BASE_PATH: BASE_PATH || "" },
  // pin the tracing root (a stray lockfile in $HOME otherwise triggers a warning)
  outputFileTracingRoot: import.meta.dirname,
};

export default nextConfig;
