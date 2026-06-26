import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { SITE_NAME, UPSTREAM_PDF_URL } from "@/lib/tree";

export const metadata: Metadata = {
  title: {
    default: SITE_NAME,
    template: `%s · Oregon Prosperity Council Report`,
  },
  description:
    "A progressive-disclosure index of the Oregon Prosperity Council Report (June 2026) — recommendations for Oregon's long-term competitiveness and prosperity. Navigable by topic, summarized per section, with every entry linking back to the exact source page. Built for AI agents and humans.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a className="skip" href="#main">Skip to content</a>
        <header className="site-header">
          <div className="bar">
            <Link href="/" className="brand">
              <span className="brand-mark" aria-hidden>◆</span>
              <span className="brand-text">
                Oregon Prosperity Council Report
                <small>June 2026 · progressive-disclosure index</small>
              </span>
            </Link>
            <nav className="site-nav">
              <Link href="/">Index</Link>
              <Link href="/search/">Search</Link>
              <a href="/llms.txt">llms.txt</a>
              <a href={UPSTREAM_PDF_URL} target="_blank" rel="noopener noreferrer">Source PDF ↗</a>
            </nav>
          </div>
        </header>
        <main id="main" className="content">
          {children}
        </main>
        <footer className="site-footer">
          <div className="bar">
            <p>
              Unofficial navigable mirror of the{" "}
              <a href={UPSTREAM_PDF_URL} target="_blank" rel="noopener noreferrer">
                Oregon Prosperity Council Report (June 2026)
              </a>
              . All content is derived mechanically from the source PDF; every page links back to
              the original. Not affiliated with the State of Oregon.
            </p>
            <p className="muted">
              Built as a progressive-disclosure tree for AI agents — start at the{" "}
              <Link href="/">index</Link>, see <a href="/llms.txt">llms.txt</a>, or fetch any page&apos;s
              raw markdown.
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
