"use client";

import Link from "next/link";
import { Search } from "lucide-react";
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
      <div className="relative mt-6 max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-400" aria-hidden />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search suburbs…"
          className="w-full rounded-xl border border-zinc-200 bg-white py-3 pl-10 pr-3 text-sm text-blue-950 shadow-sm outline-none ring-blue-600/15 placeholder:text-zinc-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-500/30"
          aria-label="Search suburbs"
          autoComplete="off"
        />
      </div>

      <div className="mt-10 grid gap-10 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((g) => (
          <div key={g.region}>
            <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-500">{g.region}</h3>
            <ul className="mt-3 space-y-2">
              {g.items.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="text-sm font-medium text-blue-900 underline decoration-blue-200 underline-offset-4 transition hover:decoration-blue-600"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="mt-8 text-sm text-zinc-600">No suburbs match &ldquo;{query}&rdquo;. Try another spelling.</p>
      ) : null}
    </div>
  );
}
