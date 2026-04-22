"use client";

type Tone = "green" | "amber" | "red" | "zinc" | "blue";

const TONE_CLASS: Record<Tone, string> = {
  green: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200",
  amber: "bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200",
  red: "bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-200",
  zinc: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200",
  blue: "bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-200",
};

export default function StatusBadge({ label, tone }: { label: string; tone?: Tone }) {
  return (
    <span className={["inline-flex rounded-full px-2 py-0.5 text-xs font-semibold", TONE_CLASS[tone ?? "zinc"]].join(" ")}>
      {label}
    </span>
  );
}
