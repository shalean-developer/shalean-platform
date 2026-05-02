import type { CleanerEarningsSnapshot } from "./types";

type EarningsCardProps = {
  earnings: CleanerEarningsSnapshot;
};

export function EarningsCard({ earnings }: EarningsCardProps) {
  return (
    <div className="rounded-2xl bg-zinc-950 p-4 text-white dark:bg-zinc-900">
      <p className="text-sm text-white/80">Today&apos;s Earnings</p>
      <p className="text-2xl font-bold tabular-nums">{earnings.todayZarLabel}</p>
    </div>
  );
}
