"use client";

import { cn } from "@/lib/utils";

type StepHeaderProps = {
  /** Omit to show only subtitle copy (e.g. schedule step: no “Schedule” title). */
  title?: string;
  subtitle?: string;
  /** Second line of helper copy (smaller). */
  subtitleSecondary?: string;
  badge?: string;
  /** When set with `badge`, show the badge on small screens too (default: `sm+` only). */
  badgeAlwaysVisible?: boolean;
};

/** Primary heading for the active checkout step (step counts live in the progress header). */
export function StepHeader({
  title,
  subtitle,
  subtitleSecondary,
  badge,
  badgeAlwaysVisible,
}: StepHeaderProps) {
  const hasTitle = Boolean(title?.trim());
  const hasBody = Boolean(subtitle ?? subtitleSecondary);
  const rich = Boolean(hasTitle && (subtitle ?? subtitleSecondary ?? badge));
  const leadOnly = !hasTitle && hasBody;

  return (
    <div className={cn((rich || leadOnly) && "space-y-1.5")}>
      {hasTitle ? (
        <div className="flex flex-wrap items-center gap-2 gap-y-1">
          <h1
            className={cn(
              "font-semibold tracking-tight",
              rich
                ? "text-xl text-blue-700 dark:text-blue-400 sm:text-2xl"
                : "text-2xl text-zinc-900 dark:text-zinc-50 sm:text-[1.75rem] sm:leading-snug",
            )}
          >
            {title}
          </h1>
          {badge ? (
            <span
              className={cn(
                "rounded-full border border-emerald-200/90 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-100",
                badgeAlwaysVisible ? "inline-flex max-w-full shrink leading-tight" : "hidden sm:inline",
              )}
            >
              {badge}
            </span>
          ) : null}
        </div>
      ) : null}
      {subtitle ? (
        <p
          className={cn(
            "leading-snug",
            leadOnly
              ? "text-sm text-zinc-700 dark:text-zinc-300"
              : "text-sm text-zinc-600 dark:text-zinc-400",
          )}
        >
          {subtitle}
        </p>
      ) : null}
      {subtitleSecondary ? (
        <p className="text-xs leading-snug text-zinc-500 dark:text-zinc-500">{subtitleSecondary}</p>
      ) : null}
    </div>
  );
}
