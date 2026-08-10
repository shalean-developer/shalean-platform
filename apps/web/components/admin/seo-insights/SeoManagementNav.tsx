"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const ITEMS = [
  { label: "Overview", href: "/office/seo-insights" },
  { label: "Issues", href: "/office/seo-insights/issues" },
  { label: "Pages", href: "/office/seo-insights/page-groups" },
  { label: "Queries", href: "/office/seo-insights/queries" },
  { label: "Performance & Automation", href: "/office/seo-insights/performance" },
] as const;

export function SeoManagementNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="SEO management" className="flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
      {ITEMS.map((item) => {
        const active = item.href === "/office/seo-insights" ? pathname === item.href : pathname.startsWith(item.href);
        return <Link key={item.href} href={item.href} className={cn("rounded-xl px-3 py-2 text-sm font-semibold transition", active ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900")}>{item.label}</Link>;
      })}
    </nav>
  );
}
