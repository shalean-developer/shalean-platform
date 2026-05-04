import Link from "next/link";
import { BLOG_TOPIC_FILTER_OPTIONS, type BlogTopicFilterId } from "@/lib/blog/blog-index-hub";

export function BlogTopicFilterNav({ active }: { active: BlogTopicFilterId | "all" }) {
  return (
    <nav className="flex flex-wrap gap-2.5" aria-label="Filter articles by category">
      {BLOG_TOPIC_FILTER_OPTIONS.map(({ id, label }) => {
        const href = id === "all" ? "/blog" : `/blog?topic=${encodeURIComponent(id)}`;
        const isActive = active === id;
        return (
          <Link
            key={id}
            href={href}
            className={`rounded-full border px-5 py-2.5 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${
              isActive
                ? "border-blue-600 bg-blue-600 text-white shadow-md shadow-blue-600/20"
                : "border-zinc-200 bg-white text-zinc-700 shadow-sm hover:border-zinc-300 hover:bg-zinc-50"
            }`}
            aria-current={isActive ? "page" : undefined}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
