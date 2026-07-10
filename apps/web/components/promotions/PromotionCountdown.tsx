"use client";

import { useEffect, useState } from "react";

type Props = {
  endsAt: string | null;
  label?: string;
  className?: string;
};

function parts(ms: number) {
  if (ms <= 0) return { d: 0, h: 0, m: 0, s: 0, ended: true };
  const d = Math.floor(ms / 86_400_000);
  const h = Math.floor((ms % 86_400_000) / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  return { d, h, m, s, ended: false };
}

/** Live countdown for campaign end dates. */
export function PromotionCountdown({ endsAt, label = "Offer Ends In:", className }: Props) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!endsAt) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [endsAt]);

  if (!endsAt) return null;
  const { d, h, m, s, ended } = parts(new Date(endsAt).getTime() - now);

  if (ended) {
    return (
      <p className={className ?? "text-sm font-medium text-amber-700"}>Offer ending soon</p>
    );
  }

  const cells = [
    { n: d, u: "Days" },
    { n: h, u: "Hours" },
    { n: m, u: "Mins" },
    { n: s, u: "Secs" },
  ];

  return (
    <div className={className}>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <div className="flex gap-2">
        {cells.map((c) => (
          <div
            key={c.u}
            className="min-w-[3.25rem] rounded-lg bg-slate-900 px-2 py-1.5 text-center text-white"
          >
            <div className="text-lg font-bold tabular-nums leading-none">
              {String(c.n).padStart(2, "0")}
            </div>
            <div className="mt-0.5 text-[10px] uppercase tracking-wide text-slate-300">{c.u}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
