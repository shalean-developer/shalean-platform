"use client";

import Link from "next/link";
import { ArrowRight, Search } from "lucide-react";
import { useMemo, useState } from "react";
import type { ServicesHubAreaLink } from "@/lib/services/servicesHubAreas";

type Group = { region: string; items: ServicesHubAreaLink[] };

type Props = {
  groups: Group[];
};

export function ServicesAreasSection({ groups }: Props) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return groups;
    return groups
      .map((g) => ({
        region: g.region,
        items: g.items.filter((item) => item.label.toLowerCase().includes(q)),
      }))
      .filter((g) => g.items.length > 0);
  }, [groups, query]);

  return (
    <div>
      <div className="relative mt-[var(--ui-space-8)] max-w-lg">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search Cape Town suburbs…"
          className="w-full rounded-[var(--ui-radius-pill)] border border-[#DBEAFE] bg-background py-[var(--ui-space-3)] pl-12 pr-[var(--ui-space-4)] text-[length:var(--ui-text-small)] text-foreground shadow-[var(--ui-shadow-sm)] outline-none placeholder:text-muted-foreground focus:border-primary/50 focus:ring-2 focus:ring-ring"
          aria-label="Search suburbs"
          autoComplete="off"
        />
      </div>

      <div className="mt-[var(--ui-space-10)] grid gap-[var(--ui-space-5)] md:grid-cols-2 xl:grid-cols-3">
        {filtered.map((g) => (
          <section
            key={g.region}
            className="rounded-[var(--ui-radius-marketing)] border border-[#DBEAFE] bg-background p-[var(--ui-space-6)] shadow-[var(--ui-shadow-sm)]"
          >
            <h3 className="text-[length:var(--ui-text-caption)] font-semibold uppercase tracking-[0.14em] text-primary">
              {g.region}
            </h3>
            <ul className="mt-[var(--ui-space-4)] space-y-[var(--ui-space-1)]">
              {g.items.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="group flex min-h-11 items-center justify-between gap-[var(--ui-space-3)] rounded-[var(--ui-radius-xl)] px-[var(--ui-space-3)] text-[length:var(--ui-text-small)] font-medium text-foreground transition hover:bg-[#EFF6FF] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span>{item.label}</span>
                    <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-primary" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="mt-[var(--ui-space-8)] text-[length:var(--ui-text-small)] text-muted-foreground">
          No suburbs match &ldquo;{query}&rdquo;. Try another spelling.
        </p>
      ) : null}
    </div>
  );
}
