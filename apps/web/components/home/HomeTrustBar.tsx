import { CreditCard, ShieldCheck, Star, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { icon: Star, label: "4.9 ★★★★★", sub: "Trusted by Cape Town households" },
  { icon: ShieldCheck, label: "Vetted Cleaners", sub: "Background-checked teams" },
  { icon: CreditCard, label: "Secure Payments", sub: "Pay safely online" },
  { icon: Zap, label: "Same-Day Available", sub: "When slots open up" },
] as const;

export function HomeTrustBar() {
  return (
    <section className="border-y border-zinc-200 bg-white px-4 py-8 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-4">
        {items.map(({ icon: Icon, label, sub }) => (
          <div
            key={label}
            className={cn(
              "flex flex-1 items-center gap-3 rounded-xl border border-zinc-100 bg-zinc-50/80 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900/60",
              "min-w-0 sm:min-w-[140px] sm:flex-1 sm:justify-center",
            )}
          >
            <Icon className="size-8 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{label}</p>
              <p className="text-xs text-zinc-600 dark:text-zinc-400">{sub}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
