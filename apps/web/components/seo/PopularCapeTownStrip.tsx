"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { footerPopularStripForPathname } from "@/lib/seo/footerPopularStrip";
import { cn } from "@/lib/utils";

type Props = {
  /** `zinc` matches `FooterSection`; `marketing` matches dark marketing homepage footer. */
  theme: "zinc" | "marketing";
  className?: string;
};

/** Visible crawl-friendly strip — heading + links adapt to `/locations/*` and `/services/*`. */
export function PopularCapeTownStrip({ theme, className }: Props) {
  const pathname = usePathname() ?? "";
  const { title, links } = footerPopularStripForPathname(pathname);

  const wrap =
    theme === "zinc"
      ? "rounded-xl border border-zinc-800 bg-zinc-900/60 px-4 py-4"
      : "rounded-xl border border-white/15 bg-white/5 px-4 py-4";
  const titleCls = theme === "zinc" ? "text-blue-400" : "text-sky-400";
  const linkCls =
    theme === "zinc"
      ? "font-medium text-zinc-200 underline-offset-4 transition hover:text-white hover:underline"
      : "font-medium text-white/90 underline-offset-4 transition hover:text-white hover:underline";

  return (
    <nav aria-label={title} className={cn(wrap, className)}>
      <p className={cn("text-xs font-semibold uppercase tracking-wide", titleCls)}>{title}</p>
      <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm">
        {links.map((item) => (
          <li key={item.href}>
            <Link href={item.href} className={linkCls}>
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
