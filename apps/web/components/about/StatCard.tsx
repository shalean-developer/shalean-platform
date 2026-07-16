import { cn } from "@/lib/utils";

type Props = {
  value: string;
  label: string;
  /** Optional footnote under label (e.g. source). */
  hint?: string;
  className?: string;
  emphasize?: boolean;
};

/**
 * Proof grid cell — large metric + short supporting line (max ~2 lines).
 */
export function StatCard({ value, label, hint, className, emphasize }: Props) {
  return (
    <div
      className={cn(
        "flex flex-col rounded-2xl border p-6 shadow-sm",
        emphasize
          ? "border-blue-200 bg-gradient-to-br from-blue-600 to-blue-800 text-white shadow-blue-900/20"
          : "border-zinc-200 bg-white",
        className,
      )}
    >
      <p
        className={cn(
          "text-3xl font-bold tracking-tight tabular-nums sm:text-4xl",
          emphasize ? "text-white" : "text-zinc-900",
        )}
      >
        {value}
      </p>
      <p className={cn("mt-2 text-sm font-medium leading-snug sm:text-base", emphasize ? "text-blue-50" : "text-zinc-600")}>
        {label}
      </p>
      {hint ? (
        <p className={cn("mt-2 text-xs", emphasize ? "text-blue-200/90" : "text-zinc-500")}>{hint}</p>
      ) : null}
    </div>
  );
}
