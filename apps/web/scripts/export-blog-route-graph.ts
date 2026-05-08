/**
 * Export canonical / redirect / ownership graphs for editorial routes (static, no HTTP).
 *
 * `npm run export:blog-route-graph`
 *
 * Optional outputs:
 * - `BLOG_ROUTE_GRAPH_JSON=out/blog-graph.json`
 * - `BLOG_ROUTE_GRAPH_MERMAID=out/blog-graph.mmd`
 * - `BLOG_ROUTE_GRAPH_DOT=out/blog-graph.dot`
 */

import { mkdirSync, writeFileSync } from "fs";
import { dirname } from "path";
import {
  BLOG_REDIRECT_SOURCE_TO_DEST,
  DEV_BLOG_STATIC_LINK_ALLOWLIST,
  REDIRECT_ALIAS_BLOG_SLUGS,
  REDIRECT_DESTINATION_BLOG_SLUGS,
  blogSlugFromPathname,
  getBlogRouteOwnership,
  normalizeBlogPathname,
} from "../lib/blog/validBlogRoutes";

function main(): void {
  const canonicalNodes = [...DEV_BLOG_STATIC_LINK_ALLOWLIST].sort();
  const aliasNodes = [...REDIRECT_ALIAS_BLOG_SLUGS].sort();
  const destNodes = [...REDIRECT_DESTINATION_BLOG_SLUGS].sort();

  const redirectEdges: { from: string; to: string }[] = [];
  for (const [src, dest] of BLOG_REDIRECT_SOURCE_TO_DEST) {
    const fromSlug = blogSlugFromPathname(src);
    const toSlug = dest.startsWith("/blog/") ? blogSlugFromPathname(dest) : null;
    redirectEdges.push({
      from: fromSlug ?? src,
      to: toSlug ?? normalizeBlogPathname(dest),
    });
  }

  const ownership: Record<string, string> = {};
  for (const slug of canonicalNodes) {
    ownership[slug] = getBlogRouteOwnership(slug);
  }

  const graph = {
    generatedAt: new Date().toISOString(),
    canonicalPoolSize: canonicalNodes.length,
    redirectAliasCount: aliasNodes.length,
    redirectDestinationBlogSlugCount: destNodes.length,
    redirectEdges,
    ownership,
  };

  const jsonOut = process.env.BLOG_ROUTE_GRAPH_JSON?.trim();
  if (jsonOut) {
    mkdirSync(dirname(jsonOut), { recursive: true });
    writeFileSync(jsonOut, JSON.stringify(graph, null, 2), "utf8");
    console.log(`Wrote ${jsonOut}`);
  }

  const mermaidOut = process.env.BLOG_ROUTE_GRAPH_MERMAID?.trim();
  if (mermaidOut) {
    const lines = ["flowchart LR"];
    for (const e of redirectEdges.slice(0, 400)) {
      const safeFrom = String(e.from).replace(/[^a-zA-Z0-9_-]/g, "_");
      const safeTo = String(e.to).replace(/[^a-zA-Z0-9_-]/g, "_");
      lines.push(`  ${safeFrom}["${e.from}"] --> ${safeTo}["${e.to}"]`);
    }
    mkdirSync(dirname(mermaidOut), { recursive: true });
    writeFileSync(mermaidOut, `${lines.join("\n")}\n`, "utf8");
    console.log(`Wrote ${mermaidOut}`);
  }

  const dotOut = process.env.BLOG_ROUTE_GRAPH_DOT?.trim();
  if (dotOut) {
    const lines = ["digraph blog_redirects {"];
    for (const e of redirectEdges.slice(0, 400)) {
      lines.push(`  "${String(e.from).replace(/"/g, '\\"')}" -> "${String(e.to).replace(/"/g, '\\"')}";`);
    }
    lines.push("}");
    mkdirSync(dirname(dotOut), { recursive: true });
    writeFileSync(dotOut, `${lines.join("\n")}\n`, "utf8");
    console.log(`Wrote ${dotOut}`);
  }

  console.log(JSON.stringify(graph, null, 2));
}

main();
