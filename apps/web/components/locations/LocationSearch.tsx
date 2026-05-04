"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { LocationCard } from "@/components/locations/LocationCard";

export type LocationSearchItem = {
  name: string;
  slug: string;
  description: string;
};

type Props = {
  items: readonly LocationSearchItem[];
  /** Called when user picks a quick suburb (optional analytics hook). */
  id?: string;
};

/**
 * Client-side filter over all hubs — keeps page static while improving find speed.
 */
export function LocationSearch({ items, id = "location-hub-search" }: Props) {
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return [];
    return items.filter(
      (it) => it.name.toLowerCase().includes(t) || it.slug.replace(/-/g, " ").includes(t),
    ).slice(0, 8);
  }, [items, q]);

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-6">
      <label htmlFor={id} className="sr-only">
        Search Cape Town suburbs
      </label>
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-zinc-400"
          aria-hidden
        />
        <input
          id={id}
          type="search"
          inputMode="search"
          autoComplete="off"
          placeholder="Enter your suburb…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="w-full rounded-xl border border-zinc-200 bg-zinc-50 py-3 pl-11 pr-4 text-base text-zinc-900 placeholder:text-zinc-500 focus:border-emerald-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
        />
      </div>
      {q.trim() ? (
        <div className="mt-4">
          {filtered.length === 0 ? (
            <p className="text-sm text-zinc-600">No match — try another spelling or browse by region below.</p>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {filtered.map((it) => (
                <li key={it.slug}>
                  <LocationCard name={it.name} slug={it.slug} description={it.description} />
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <p className="mt-3 text-xs text-zinc-500">Tip: type “Sea”, “Claremont”, or “Durbanville” to jump straight to a hub.</p>
      )}
    </div>
  );
}
