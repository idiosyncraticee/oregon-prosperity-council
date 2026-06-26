import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getNodes, getNodeBySlug } from "@/lib/tree";
import NodeView from "@/components/NodeView";

export const dynamicParams = false;

export function generateStaticParams() {
  return getNodes()
    .filter((n) => n.route !== "/")
    .map((n) => ({ slug: n.route.replace(/^\/n\//, "").split("/") }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string[] }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const node = getNodeBySlug(slug);
  if (!node) return {};
  const desc = node.tldr ?? `Section of the Oregon Prosperity Council Report (June 2026).`;
  return { title: node.title, description: desc.slice(0, 180) };
}

export default async function NodePage({
  params,
}: {
  params: Promise<{ slug: string[] }>;
}) {
  const { slug } = await params;
  const node = getNodeBySlug(slug);
  if (!node) notFound();
  return <NodeView node={node} />;
}
