import Link from "next/link";
import { getRoot, parseContentsRows, UPSTREAM_PDF_URL } from "@/lib/tree";
import { withBase } from "@/lib/base";

export default function Home() {
  const root = getRoot();
  const rows = root ? parseContentsRows(root) : [];

  return (
    <div>
      <section className="hero">
        <p className="eyebrow">Unofficial · Built for AI agents, not human reading</p>
        <h1>
          An Unofficial, Agent-Readable Index to the Oregon Prosperity Council&apos;s
          <em> Recommendations for Oregon&apos;s Long-Term Competitiveness &amp; Prosperity</em>
        </h1>
        <p className="lede">
          This is <b>not the official report</b> and is <b>not meant for human consumption</b>. It
          exists so you can point an <b>AI agent — Claude or ChatGPT</b> — at this URL and have it
          navigate the Prosperity Council&apos;s 452-page report to Governor Tina Kotek without
          loading the whole PDF: ten priority recommendations, five policy chapters, and the full
          public record, split into small cross-linked pages that each cite their exact source page.
          Hand the link to your agent and ask your question.
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

      <section className="examples">
        <p className="examples-label">Hand this link to Claude or ChatGPT, then ask things like:</p>
        <ul className="examples-list">
          <li>&ldquo;What are the ten priority recommendations, and which one is ranked first?&rdquo;</li>
          <li>&ldquo;Summarize what the report says about permitting and site readiness, with page citations.&rdquo;</li>
          <li>&ldquo;Which organizations submitted feedback, and what did the homebuilders association argue?&rdquo;</li>
          <li>&ldquo;What does the report recommend on business taxes, and what data backs it up?&rdquo;</li>
          <li>&ldquo;How was the public engaged, and what did the survey find about Oregonians&apos; top concerns?&rdquo;</li>
        </ul>
      </section>

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
