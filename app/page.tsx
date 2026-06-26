import Link from "next/link";
import { getRoot, parseContentsRows, UPSTREAM_PDF_URL } from "@/lib/tree";
import { withBase } from "@/lib/base";

export default function Home() {
  const root = getRoot();
  const rows = root ? parseContentsRows(root) : [];

  return (
    <div>
      <section className="hero">
        <p className="eyebrow">Unofficial index · Oregon Prosperity Council · June 2026</p>
        <h1>
          An Unofficial Reader&apos;s Index to <em>Recommendations for Oregon&apos;s Long-Term
          Competitiveness &amp; Prosperity</em>
        </h1>
        <p className="lede">
          A navigable, summarized index of the Prosperity Council&apos;s 452-page report to Governor
          Tina Kotek — its ten priority recommendations, five policy chapters, and the full public
          record behind them. Browse by topic; every entry links back to the exact source page.
        </p>
        <div className="stats">
          <span><b>452</b> pages</span>
          <span><b>10</b> priority recommendations</span>
          <span><b>5</b> policy chapters</span>
          <span><b>47</b> public submissions</span>
          <span><b>6</b> appendices</span>
        </div>
      </section>

      <div className="callout">
        <b>Pointing an AI agent here?</b> Start at this index and follow links down — a typical
        question reaches the right section in two or three hops while loading only a few KB. Each
        page carries an AI-written summary and links back to the exact PDF page. Machine-readable
        map at <a href={withBase("/llms.txt")}>/llms.txt</a>; append <code>view raw markdown</code> on any page
        to fetch its source. Full document:{" "}
        <a href={UPSTREAM_PDF_URL} target="_blank" rel="noopener noreferrer">oregon.gov ↗</a>.
      </div>

      <h2 style={{ fontFamily: "var(--sans)", fontSize: "0.8rem", letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--muted)", marginTop: "2rem" }}>
        Contents
      </h2>
      <div className="section-grid">
        {rows.map((r) => (
          <Link key={r.href} href={r.href} className="card">
            <div className="ct">
              <h3>{r.title}</h3>
              <span className="pages">{r.pageLabel}</span>
            </div>
            <p>{r.desc.length > 180 ? r.desc.slice(0, 177) + "…" : r.desc}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
