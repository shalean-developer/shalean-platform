"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/utils";

type NavItem = { label: string; href: string };
type NavGroup = { label: string; items: readonly NavItem[] };

const OVERVIEW: NavItem = { label: "Overview", href: "/office/seo-insights" };
const LINKS: NavItem = { label: "Links", href: "/office/seo-insights/backlinks" };

const GROUPS: readonly NavGroup[] = [
  {
    label: "Search Insights",
    items: [
      { label: "Queries", href: "/office/seo-insights/queries" },
      { label: "Keywords", href: "/office/seo-insights/keywords" },
      { label: "Organic Revenue", href: "/office/seo-insights/organic-revenue" },
      { label: "Local SEO", href: "/office/seo-insights/local-seo" },
      { label: "Competitors", href: "/office/seo-insights/competitors" },
      { label: "Search Appearance", href: "/office/seo-insights/search-appearance" },
    ],
  },
  {
    label: "Content optimization",
    items: [
      { label: "Pages", href: "/office/seo-insights/page-groups" },
      { label: "Content Refresh", href: "/office/seo-insights/content-refresh" },
      { label: "Structured Data", href: "/office/seo-insights/structured-data" },
    ],
  },
  {
    label: "Site Health",
    items: [
      { label: "Issues", href: "/office/seo-insights/issues" },
      { label: "Indexing", href: "/office/seo-insights/indexing" },
      { label: "Web Vitals", href: "/office/seo-insights/web-vitals" },
      { label: "Performance & Automation", href: "/office/seo-insights/performance" },
    ],
  },
] as const;

function isActive(pathname: string, href: string) {
  return href === "/office/seo-insights" ? pathname === href : pathname.startsWith(href);
}

export function SeoManagementNav() {
  const pathname = usePathname();
  const [openGroup, setOpenGroup] = useState<string | null>(null);

  return (
    <nav
      aria-label="SEO management"
      className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm"
    >
      <Link
        href={OVERVIEW.href}
        onClick={() => setOpenGroup(null)}
        className={cn(
          "rounded-xl px-4 py-2.5 text-sm font-semibold transition",
          isActive(pathname, OVERVIEW.href)
            ? "bg-slate-900 text-white"
            : "text-slate-700 hover:bg-slate-100 hover:text-slate-950",
        )}
      >
        {OVERVIEW.label}
      </Link>

      {GROUPS.map((group) => {
        const groupActive = group.items.some((item) => isActive(pathname, item.href));
        const open = openGroup === group.label;
        return (
          <div key={group.label} className="relative">
            <button
              type="button"
              aria-expanded={open}
              aria-haspopup="menu"
              onClick={() => setOpenGroup(open ? null : group.label)}
              className={cn(
                "flex cursor-pointer items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition",
                groupActive
                  ? "bg-slate-900 text-white"
                  : "text-slate-700 hover:bg-slate-100 hover:text-slate-950",
              )}
            >
              {group.label}
              <span aria-hidden="true" className={cn("text-[10px] transition", open && "rotate-180")}>▼</span>
            </button>
            {open ? (
              <div
                role="menu"
                className="fixed left-4 right-4 z-50 mt-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl sm:absolute sm:left-0 sm:right-auto sm:w-64"
              >
                {group.items.map((item) => {
                  const active = isActive(pathname, item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      role="menuitem"
                      onClick={() => setOpenGroup(null)}
                      className={cn(
                        "block rounded-xl px-3 py-2.5 text-sm font-medium transition",
                        active
                          ? "bg-slate-900 text-white"
                          : "text-slate-700 hover:bg-slate-100 hover:text-slate-950",
                      )}
                    >
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            ) : null}
          </div>
        );
      })}

      <Link
        href={LINKS.href}
        onClick={() => setOpenGroup(null)}
        className={cn(
          "rounded-xl px-4 py-2.5 text-sm font-semibold transition",
          isActive(pathname, LINKS.href)
            ? "bg-slate-900 text-white"
            : "text-slate-700 hover:bg-slate-100 hover:text-slate-950",
        )}
      >
        {LINKS.label}
      </Link>
    </nav>
  );
}
