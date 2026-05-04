"use client";

import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";

export function BlogSidebarSearch() {
  const router = useRouter();
  const [q, setQ] = useState("");

  const onSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = q.trim();
      const params = new URLSearchParams();
      if (trimmed) params.set("q", trimmed);
      router.push(`/blog${params.toString() ? `?${params}` : ""}`);
    },
    [q, router],
  );

  return (
    <form onSubmit={onSubmit} className="rounded-xl border border-zinc-200/90 bg-white p-4 shadow-sm">
      <label htmlFor="blog-sidebar-search" className="sr-only">
        Search articles
      </label>
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-400"
          aria-hidden
        />
        <input
          id="blog-sidebar-search"
          type="search"
          name="q"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search guides…"
          className="w-full rounded-lg border border-zinc-200 bg-zinc-50/80 py-2.5 pl-10 pr-3 text-sm text-zinc-900 placeholder:text-zinc-400 outline-none ring-blue-500/0 transition focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-500/25"
          autoComplete="off"
        />
      </div>
      <button
        type="submit"
        className="mt-3 w-full rounded-lg bg-blue-600 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
      >
        Search
      </button>
    </form>
  );
}
