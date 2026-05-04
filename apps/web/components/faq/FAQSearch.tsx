"use client";

import { Search } from "lucide-react";

type Props = {
  value: string;
  onChange: (value: string) => void;
  id?: string;
};

export function FAQSearch({ value, onChange, id = "faq-search" }: Props) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-5">
      <label htmlFor={id} className="sr-only">
        Search FAQ topics
      </label>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-zinc-400" aria-hidden />
        <input
          id={id}
          type="search"
          inputMode="search"
          autoComplete="off"
          placeholder="Search questions (e.g. price, supplies, same-day)"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-xl border border-zinc-200 bg-zinc-50 py-3 pl-11 pr-4 text-base text-zinc-900 placeholder:text-zinc-500 focus:border-emerald-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
        />
      </div>
    </div>
  );
}
