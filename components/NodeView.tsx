import Link from "next/link";
import { type Node, renderNodeParts, getNodes, UPSTREAM_PDF_URL } from "@/lib/tree";

/** Build breadcrumb links by walking the node's breadcrumb titles against known nodes. */
function Breadcrumbs({ node }: { node: Node }) {
  const all = getNodes();
  const byTitle = new Map<string, Node>();
  for (const n of all) byTitle.set(n.title, n);

  const trail: { label: string; href?: string }[] = [{ label: "Index", href: "/" }];
  for (let i = 0; i < node.breadcrumb.length; i++) {
    const title = node.breadcrumb[i];
    const isLast = i === node.breadcrumb.length - 1;
    const match = byTitle.get(title);
    trail.push({ label: title, href: isLast ? undefined : match?.href });
  }
  return (
    <nav className="breadcrumb" aria-label="Breadcrumb">
      {trail.map((t, i) => (
        <span key={i}>
          {i > 0 && <span className="sep">/</span>}
          {t.href ? <Link href={t.href}>{t.label}</Link> : <span>{t.label}</span>}
        </span>
      ))}
    </nav>
  );
}

export default function NodeView({ node }: { node: Node }) {
  const { tldrHtml, bodyHtml } = renderNodeParts(node);
  const [s, e] = node.pageRange ?? [null, null];
  const pageLabel = s == null ? null : s === e ? `p. ${s}` : `pp. ${s}–${e}`;
  const pdfHref = s == null ? UPSTREAM_PDF_URL : `${UPSTREAM_PDF_URL}#page=${s}`;
  const badgeClass = node.kind === "index" ? "badge index" : node.kind === "meta" ? "badge meta" : "badge";
  const badgeText = node.kind === "index" ? "Section index" : node.kind === "meta" ? "Meta" : "Leaf";

  return (
    <article>
      <Breadcrumbs node={node} />
      <h1 className="page-title">{node.title}</h1>
      <div className="page-meta">
        <span className={badgeClass}>{badgeText}</span>
        {pageLabel && (
          <a href={pdfHref} target="_blank" rel="noopener noreferrer">
            Source PDF {pageLabel} ↗
          </a>
        )}
        <a className="raw-link" href={node.rawHref}>view raw markdown</a>
      </div>

      {tldrHtml && (
        <aside className="tldr">
          <h2>AI summary</h2>
          <div dangerouslySetInnerHTML={{ __html: tldrHtml }} />
        </aside>
      )}

      <div className="prose" dangerouslySetInnerHTML={{ __html: bodyHtml }} />
    </article>
  );
}
