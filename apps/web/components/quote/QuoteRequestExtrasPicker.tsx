"use client";

import { cn } from "@/lib/utils";
import type { QuotePublicServiceExtra } from "@/lib/quote/types";

type Props = {
  extras: QuotePublicServiceExtra[];
  selectedExtraSlugs: string[];
  onSelectedExtraSlugsChange: (slugs: string[]) => void;
  serviceName?: string;
  className?: string;
};

export function QuoteRequestExtrasPicker({
  extras,
  selectedExtraSlugs,
  onSelectedExtraSlugsChange,
  serviceName,
  className,
}: Props) {
  if (extras.length === 0) return null;

  function toggleExtra(slug: string) {
    if (selectedExtraSlugs.includes(slug)) {
      onSelectedExtraSlugsChange(selectedExtraSlugs.filter((s) => s !== slug));
    } else {
      onSelectedExtraSlugsChange([...selectedExtraSlugs, slug]);
    }
  }

  return (
    <div className={cn("space-y-3", className)}>
      <div>
        <p className="text-sm font-semibold text-slate-800">Optional extras</p>
        <p className="text-xs text-slate-500">
          {serviceName
            ? `Add-ons available for ${serviceName} — skip if none needed.`
            : "Select any add-ons you want included in your quote."}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {extras.map((extra) => {
          const checked = selectedExtraSlugs.includes(extra.slug);
          return (
            <button
              key={extra.id}
              type="button"
              onClick={() => toggleExtra(extra.slug)}
              className={cn(
                "inline-flex min-h-11 items-center gap-2 rounded-xl border px-3 py-2 text-left text-sm transition",
                checked
                  ? "border-blue-600 bg-blue-50 text-blue-700"
                  : "border-slate-200 bg-white text-slate-800 hover:border-blue-200 hover:bg-blue-50/40",
              )}
              aria-pressed={checked}
            >
              <div
                className={cn(
                  "flex h-4 w-4 shrink-0 items-center justify-center rounded border-2 transition",
                  checked ? "border-blue-600 bg-blue-600" : "border-slate-300 bg-white",
                )}
              >
                {checked ? (
                  <svg viewBox="0 0 12 10" className="h-2.5 w-2.5" aria-hidden>
                    <path
                      d="M1 5l3.5 3.5L11 1"
                      stroke="white"
                      strokeWidth="2"
                      fill="none"
                      strokeLinecap="round"
                    />
                  </svg>
                ) : null}
              </div>
              <span className="font-medium">{extra.name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
