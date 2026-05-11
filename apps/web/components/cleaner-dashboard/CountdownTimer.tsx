"use client";

import { useEffect, useRef, useState } from "react";
import { Timer } from "lucide-react";
import { cn } from "@/lib/utils";

function formatTtlMs(ms: number): { label: string; expired: boolean; mmss: string | null } {
  if (ms <= 0) return { label: "Expired", expired: true, mmss: null };
  const totalS = Math.floor(ms / 1000);
  const m = Math.floor(totalS / 60);
  const s = totalS % 60;
  const mmss = `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return { label: `Accept in ${mmss}`, expired: false, mmss };
}

type CountdownTimerProps = {
  expiresAtIso: string;
  offerId: string;
  /** Fires once when TTL hits zero (server remains source of truth; UI drops stale card). */
  onExpired?: (offerId: string) => void;
  /**
   * Visual variant.
   *  - `text` (default): plain red text — back-compat for any callers
   *    rendering the countdown as a body line.
   *  - `chip`: rounded red pill with timer icon + `mm:ss` only. Used by
   *    the redesigned dispatch-style offer card so the countdown sits in
   *    the top-right of the card next to the `NEW` pill.
   */
  variant?: "text" | "chip";
};

export function CountdownTimer({ expiresAtIso, offerId, onExpired, variant = "text" }: CountdownTimerProps) {
  const [state, setState] = useState(() => formatTtlMs(new Date(expiresAtIso).getTime() - Date.now()));
  const firedRef = useRef(false);

  useEffect(() => {
    firedRef.current = false;
  }, [expiresAtIso, offerId]);

  useEffect(() => {
    const end = new Date(expiresAtIso).getTime();
    const tick = () => {
      const next = formatTtlMs(end - Date.now());
      setState(next);
      if (next.expired && onExpired && !firedRef.current) {
        firedRef.current = true;
        onExpired(offerId);
      }
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [expiresAtIso, offerId, onExpired]);

  if (variant === "chip") {
    // Urgency tone: red while > 0, muted/gray once expired.
    const cls = state.expired
      ? "bg-muted text-muted-foreground"
      : "bg-red-500/12 text-red-700 dark:bg-red-500/20 dark:text-red-200 motion-safe:animate-[pulse_2.4s_ease-in-out_infinite]";
    return (
      <span
        className={cn(
          "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums",
          cls,
        )}
        aria-label={state.expired ? "Offer expired" : `Accept within ${state.mmss}`}
      >
        <Timer className="size-3" aria-hidden />
        {state.expired ? "Expired" : state.mmss}
      </span>
    );
  }

  return (
    <p
      className={
        state.expired
          ? "text-xs font-medium text-muted-foreground"
          : "text-xs font-medium text-red-600 dark:text-red-400"
      }
    >
      {state.label}
    </p>
  );
}
