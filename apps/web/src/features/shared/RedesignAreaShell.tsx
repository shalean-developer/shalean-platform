import Link from "next/link";
import type { ReactNode } from "react";
import { REDESIGN_AREAS, type RedesignAreaId } from "@/src/features/shared/redesignAreas";

type RedesignAreaShellProps = {
  area: RedesignAreaId;
  children?: ReactNode;
};

export function RedesignAreaShell({ area, children }: RedesignAreaShellProps) {
  const meta = REDESIGN_AREAS[area];
  const otherAreas = (Object.keys(REDESIGN_AREAS) as RedesignAreaId[]).filter((id) => id !== area);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-10 sm:px-6">
      <header className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">UI redesign preview</p>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">{meta.title}</h1>
        <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">{meta.description}</p>
      </header>

      <section
        className="rounded-2xl border border-dashed border-zinc-300 bg-white p-6 dark:border-zinc-700 dark:bg-zinc-900"
        aria-label="Placeholder content"
      >
        {children ?? (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Shell page only — no Supabase, Paystack, or auth wiring yet. Build out flows in{" "}
            <code className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs dark:bg-zinc-800">src/features/{area}</code>.
          </p>
        )}
      </section>

      <section className="space-y-3 rounded-xl border border-zinc-200 bg-zinc-50/80 p-4 dark:border-zinc-800 dark:bg-zinc-900/50">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Production system (unchanged)</h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          <Link href={meta.legacyRoute} className="font-medium text-blue-700 underline-offset-2 hover:underline dark:text-blue-400">
            {meta.legacyLabel}
          </Link>
        </p>
      </section>

      <nav className="border-t border-zinc-200 pt-6 dark:border-zinc-800" aria-label="Other redesign areas">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-500">Other preview routes</p>
        <ul className="flex flex-wrap gap-2">
          {otherAreas.map((id) => {
            const item = REDESIGN_AREAS[id];
            return (
              <li key={id}>
                <Link
                  href={item.route}
                  className="inline-flex rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 transition hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                >
                  {item.title}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
