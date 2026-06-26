import Link from "next/link";

export default function NotFound() {
  return (
    <div>
      <h1 className="page-title">Page not found</h1>
      <p style={{ color: "var(--ink-soft)" }}>
        That section isn&apos;t part of this index. Head back to the{" "}
        <Link href="/">report index</Link> or <Link href="/search/">search</Link>.
      </p>
    </div>
  );
}
