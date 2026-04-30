"use client";

export type AvatarStackCleaner = {
  cleaner_id: string;
  full_name: string | null;
  role: string;
};

function initial(name: string | null | undefined): string {
  const t = name?.trim();
  if (!t) return "?";
  return t.slice(0, 1).toUpperCase();
}

function orderedCleaners(cleaners: readonly AvatarStackCleaner[]): AvatarStackCleaner[] {
  const list = [...cleaners];
  list.sort((a, b) => {
    const la = String(a.role).toLowerCase() === "lead" ? 1 : 0;
    const lb = String(b.role).toLowerCase() === "lead" ? 1 : 0;
    return lb - la;
  });
  return list;
}

export function AvatarStack({ cleaners }: { cleaners: readonly AvatarStackCleaner[] | undefined }) {
  if (!cleaners?.length) return null;

  const ordered = orderedCleaners(cleaners);
  const tooltip = ordered.map((c) => c.full_name?.trim() || "Cleaner").join(", ");

  return (
    <div className="flex items-center" title={tooltip}>
      {ordered.slice(0, 3).map((c) => {
        const isLead = String(c.role).toLowerCase() === "lead";
        return (
          <div
            key={c.cleaner_id}
            className={[
              "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 text-[10px] font-semibold first:ml-0 -ml-2",
              isLead
                ? "border-violet-500 bg-violet-100 text-violet-900 ring-2 ring-violet-200 dark:border-violet-400 dark:bg-violet-950/60 dark:text-violet-100 dark:ring-violet-800"
                : "border-white bg-zinc-200 text-zinc-800 dark:border-zinc-900 dark:bg-zinc-700 dark:text-zinc-100",
            ].join(" ")}
          >
            {initial(c.full_name)}
          </div>
        );
      })}

      {ordered.length > 3 ? (
        <span className="ml-1.5 text-[11px] font-medium tabular-nums text-zinc-500 dark:text-zinc-400">
          +{ordered.length - 3}
        </span>
      ) : null}
    </div>
  );
}
