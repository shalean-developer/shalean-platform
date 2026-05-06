import Link from "next/link";
import type { ClusterRelatedGuideItem } from "@/lib/blog/fetch-cluster-related-guides";
import { linkInNavClassName } from "@/lib/ui/linkClassNames";

function intentLine(label: string): string {
  return label === "Guide" ? "Guide" : `${label} guide`;
}

export function BlogClusterRelatedGuides({ items }: { items: ClusterRelatedGuideItem[] }) {
  if (!items.length) return null;

  return (
    <nav className="not-prose border-t border-zinc-200/90 pt-10" aria-labelledby="cluster-related-guides-heading">
      <h2 id="cluster-related-guides-heading" className="text-lg font-semibold text-zinc-900">
        Related guides (Shalean cluster)
      </h2>
      <p className="mt-2 text-sm text-zinc-600">
        Still deciding or planning your next step? These reads stay in the same topical cluster.
      </p>
      <ul className="mt-4 space-y-3">
        {items.map((it) => (
          <li key={it.slug} className="flex flex-col gap-0.5 sm:flex-row sm:flex-wrap sm:items-baseline sm:gap-x-2">
            <Link
              href={`/blog/${it.slug}`}
              className={`${linkInNavClassName} text-base font-medium text-blue-800`}
              aria-label={`${it.title} (${intentLine(it.intentLabel)})`}
            >
              {it.title}
            </Link>
            <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{intentLine(it.intentLabel)}</span>
          </li>
        ))}
      </ul>
    </nav>
  );
}
