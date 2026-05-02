"use client";

import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type CleanerStateBannerProps = {
  browserOnline: boolean;
  /** Platform “available for offers” (matches `mapCleanerMeToMobileProfile` / PATCH `is_available`). */
  receivingOffers: boolean;
  /** Cleaner’s weekday roster includes today (Johannesburg civil day). */
  rosterIncludesToday: boolean;
  onGoAvailable?: () => void;
  onGoOffline?: () => void;
  availabilityBusy?: boolean;
  /** Inside {@link CleanerHeroStack} — no outer card chrome (shared shell). */
  embedded?: boolean;
};

/**
 * Primary dashboard control: network + availability, with explicit go online / go offline actions.
 */
export function CleanerStateBanner({
  browserOnline,
  receivingOffers,
  rosterIncludesToday,
  onGoAvailable,
  onGoOffline,
  availabilityBusy,
  embedded,
}: CleanerStateBannerProps) {
  const busy = Boolean(availabilityBusy);
  const shell = (tone: "red" | "amber" | "emerald", extra: string) =>
    cn(
      "transition-[background-color,border-color,color] duration-200 ease-out",
      embedded ? "px-0 py-0" : "rounded-2xl border px-4 py-4",
      !embedded && tone === "red" && "border-red-500/35 bg-red-500/10",
      !embedded && tone === "amber" && "border-amber-500/45 bg-amber-500/10",
      !embedded && tone === "emerald" && "border-emerald-500/45 bg-emerald-500/10",
      embedded && tone === "red" && "rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-3",
      embedded && tone === "amber" && "rounded-xl border border-amber-500/35 bg-amber-500/10 px-3 py-3",
      embedded && tone === "emerald" && "rounded-xl border border-emerald-500/35 bg-emerald-500/10 px-3 py-3",
      extra,
    );

  if (!browserOnline) {
    return (
      <section
        aria-label="Connection and availability"
        className={shell("red", "text-red-950 dark:text-red-50")}
      >
        <p className="text-lg font-bold tracking-tight">You&apos;re offline</p>
        <p className="mt-1 text-sm font-normal leading-relaxed text-red-900/85 dark:text-red-100/85">
          Reconnect to the internet, then you can go online for offers again.
        </p>
      </section>
    );
  }

  if (!receivingOffers) {
    return (
      <section
        aria-label="Availability control"
        className={shell("amber", "text-amber-950 dark:text-amber-50")}
      >
        <p className="text-lg font-bold tracking-tight">You&apos;re not receiving offers</p>
        <p className="mt-1 text-sm font-normal leading-relaxed text-amber-900/90 dark:text-amber-100/85">
          Go online when you&apos;re ready — we&apos;ll match you to jobs automatically.
        </p>
        {onGoAvailable ? (
          <Button
            type="button"
            size="default"
            role="button"
            aria-pressed={false}
            aria-label="Go online for job offers"
            className="mt-4 min-h-11 w-full bg-amber-600 text-white transition-colors duration-200 hover:bg-amber-600/90 active:scale-[0.98] sm:w-auto"
            disabled={busy}
            onClick={() => onGoAvailable()}
          >
            {busy ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
                Saving…
              </>
            ) : (
              "Go online"
            )}
          </Button>
        ) : null}
      </section>
    );
  }

  return (
    <section
      aria-label="Availability control"
      className={shell("emerald", "text-emerald-950 dark:text-emerald-50")}
    >
      <p className="text-lg font-bold tracking-tight">You&apos;re available</p>
      <p className="mt-1 text-sm font-medium text-emerald-900/95 dark:text-emerald-100/90">Waiting for job offers</p>
      <p className="mt-1 text-sm font-normal leading-relaxed text-emerald-900/85 dark:text-emerald-100/80">
        We&apos;ll send work your way when dispatch finds a fit. Stay on this screen if you can.
      </p>
      {!rosterIncludesToday ? (
        <p className="mt-2 text-xs font-normal text-emerald-900/75 dark:text-emerald-100/70">
          Your usual roster doesn&apos;t include today — you can still get offers.
        </p>
      ) : null}
      {onGoOffline ? (
        <Button
          type="button"
          variant="outline"
          size="default"
          role="button"
          aria-pressed={true}
          aria-label="Go offline — stop receiving job offers"
          className="mt-4 min-h-11 w-full border-2 border-emerald-700/50 bg-emerald-950/5 text-emerald-950 shadow-sm transition-colors duration-200 hover:bg-emerald-950/10 active:scale-[0.98] dark:border-emerald-300/45 dark:bg-emerald-950/20 dark:text-emerald-50 dark:hover:bg-emerald-950/30 sm:w-auto"
          disabled={busy}
          onClick={() => onGoOffline()}
        >
          {busy ? (
            <>
              <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
              Saving…
            </>
          ) : (
            "Go offline"
          )}
        </Button>
      ) : null}
    </section>
  );
}
