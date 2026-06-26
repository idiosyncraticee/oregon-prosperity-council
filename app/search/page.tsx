"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type Entry = { title: string; href: string; crumb: string; tldr: string; pages: string };

function highlight(text: string, q: string) {
  if (!q) return text;
  const terms = q.split(/\s+/).filter((t) => t.length > 1).map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (!terms.length) return text;
  const re = new RegExp(`(${terms.join("|")})`, "gi");
  const parts = text.split(re);
  return parts.map((p, i) => (re.test(p) ? <mark key={i}>{p}</mark> : <span key={i}>{p}</span>));
}

export default function SearchPage() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [q, setQ] = useState("");

  useEffect(() => {
    fetch("/search-index.json")
      .then((r) => r.json())
      .then(setEntries)
      .catch(() => setEntries([]));
  }, []);

  const results = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return entries.slice(0, 0);
    const terms = query.split(/\s+/).filter(Boolean);
    const scored = entries
      .map((e) => {
        const hay = (e.title + "  " + e.tldr + "  " + e.crumb).toLowerCase();
        let score = 0;
        for (const t of terms) {
          if (!hay.includes(t)) return { e, score: -1 };
          if (e.title.toLowerCase().includes(t)) score += 5;
          if (e.tldr.toLowerCase().includes(t)) score += 2;
          score += 1;
        }
        return { e, score };
      })
      .filter((x) => x.score >= 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 60);
    return scored.map((x) => x.e);
  }, [q, entries]);

  return (
    <div>
      <h1 className="page-title">Search</h1>
      <p style={{ color: "var(--ink-soft)", marginTop: "-0.4rem", marginBottom: "1.2rem" }}>
        Full-text search across {entries.length || "all"} sections of the report — titles and
        AI-written summaries.
      </p>
      <input
        autoFocus
        className="search-box"
        placeholder="Search recommendations, taxes, permitting, submissions, data…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        type="search"
      />
      {q.trim() && (
        <p className="search-meta">
          {results.length} result{results.length === 1 ? "" : "s"} for “{q.trim()}”
        </p>
      )}
      <div>
        {results.map((e) => (
          <Link key={e.href} href={e.href} className="result">
            <div className="crumb">{e.crumb} {e.pages && `· ${e.pages}`}</div>
            <h3>{highlight(e.title, q)}</h3>
            {e.tldr && <p>{highlight(e.tldr.length > 220 ? e.tldr.slice(0, 217) + "…" : e.tldr, q)}</p>}
          </Link>
        ))}
      </div>
    </div>
  );
}
