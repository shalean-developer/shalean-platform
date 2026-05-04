import Link from "next/link";

const SITE_ORIGIN = "https://www.shalean.co.za";

export type SeoBreadcrumbItem = {
  name: string;
  /** Path starting with `/` or absolute URL. Set `current` so the UI shows plain text while JSON-LD still gets `item`. */
  href?: string;
  current?: boolean;
};

type Props = {
  items: SeoBreadcrumbItem[];
  className?: string;
  /** When false, only the visible nav is rendered (use when JSON-LD is inlined in a page `@graph`). Default true. */
  includeJsonLd?: boolean;
};

function itemUrl(href: string | undefined): string | undefined {
  if (!href) return undefined;
  if (href.startsWith("http")) return href;
  return `${SITE_ORIGIN}${href.startsWith("/") ? href : `/${href}`}`;
}

/**
 * Visible breadcrumb trail + matching `BreadcrumbList` JSON-LD (absolute `item` URLs).
 */
export function SeoBreadcrumbs({ items, className, includeJsonLd = true }: Props) {
  const ld = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => {
      const url = itemUrl(it.href);
      return {
        "@type": "ListItem",
        position: i + 1,
        name: it.name,
        ...(url ? { item: url } : {}),
      };
    }),
  };

  return (
    <>
      <nav aria-label="Breadcrumb" className={className ?? "mb-6"}>
        <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-zinc-500 dark:text-zinc-400">
          {items.map((it, i) => (
            <li key={`${it.name}-${i}`} className="flex items-center gap-2">
              {i > 0 ? (
                <span aria-hidden className="text-zinc-300 dark:text-zinc-600">
                  /
                </span>
              ) : null}
              {it.href && !it.current ? (
                <Link href={it.href} className="transition hover:text-emerald-700 dark:hover:text-emerald-400">
                  {it.name}
                </Link>
              ) : (
                <span className="font-medium text-zinc-900 dark:text-zinc-100">{it.name}</span>
              )}
            </li>
          ))}
        </ol>
      </nav>
      {includeJsonLd ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(ld).replace(/</g, "\\u003c") }}
        />
      ) : null}
    </>
  );
}
