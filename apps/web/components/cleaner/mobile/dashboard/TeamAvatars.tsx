"use client";

import { cn } from "@/lib/utils";

const FALLBACK = ["NK", "TM", "SR", "JD", "AL"] as const;
const RING = "ring-2 ring-white dark:ring-zinc-900";

type Props = {
  count: number;
  soloInitial: string;
  className?: string;
};

export function TeamAvatars({ count, soloInitial, className }: Props) {
  const n = Math.min(Math.max(count, 1), 5);
  const labels =
    count <= 1
      ? [soloInitial.slice(0, 2).toUpperCase() || "—"]
      : FALLBACK.slice(0, n);
  const tones = [
    "bg-blue-600 text-white",
    "bg-violet-600 text-white",
    "bg-emerald-600 text-white",
    "bg-amber-600 text-white",
    "bg-sky-600 text-white",
  ] as const;
  return (
    <div className={cn("flex shrink-0 items-center", className)}>
      {labels.map((lab, i) => (
        <div
          key={`${lab}-${i}`}
          className={cn(
            "flex h-10 w-10 items-center justify-center rounded-full text-[11px] font-bold tracking-tight",
            RING,
            i > 0 && "-ml-2.5",
            tones[i % tones.length]!,
          )}
          aria-hidden
        >
          {lab}
        </div>
      ))}
    </div>
  );
}
