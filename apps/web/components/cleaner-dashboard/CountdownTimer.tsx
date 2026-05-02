"use client";

import { useEffect, useRef, useState } from "react";

function formatTtlMs(ms: number): string {
  if (ms <= 0) return "Expired";
  const totalS = Math.floor(ms / 1000);
  const m = Math.floor(totalS / 60);
  const s = totalS % 60;
  return `Accept in ${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

type CountdownTimerProps = {
  expiresAtIso: string;
  offerId: string;
  /** Fires once when TTL hits zero (server remains source of truth; UI drops stale card). */
  onExpired?: (offerId: string) => void;
};

export function CountdownTimer({ expiresAtIso, offerId, onExpired }: CountdownTimerProps) {
  const [label, setLabel] = useState(() => formatTtlMs(new Date(expiresAtIso).getTime() - Date.now()));
  const firedRef = useRef(false);

  useEffect(() => {
    firedRef.current = false;
  }, [expiresAtIso, offerId]);

  useEffect(() => {
    const end = new Date(expiresAtIso).getTime();
    const tick = () => {
      const next = formatTtlMs(end - Date.now());
      setLabel(next);
      if (next === "Expired" && onExpired && !firedRef.current) {
        firedRef.current = true;
        onExpired(offerId);
      }
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [expiresAtIso, offerId, onExpired]);

  const expired = label === "Expired";
  return (
    <p
      className={
        expired
          ? "text-xs font-medium text-muted-foreground"
          : "text-xs font-medium text-red-600 dark:text-red-400"
      }
    >
      {label}
    </p>
  );
}
