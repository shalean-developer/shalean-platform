"use client";

import { useEffect, useState } from "react";
import { Clock, MapPin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { CleanerOfferRow } from "@/lib/cleaner/cleanerOfferRow";

export function CleanerOffersPanel({
  offer,
  busy,
  onAccept,
  onDecline,
}: {
  offer: CleanerOfferRow | null;
  busy: boolean;
  onAccept: (offerId: string) => Promise<void>;
  onDecline: (offerId: string) => Promise<void>;
}) {
  const [secLeft, setSecLeft] = useState(0);

  useEffect(() => {
    if (!offer?.expires_at) {
      setSecLeft(0);
      return;
    }
    const tick = () => {
      const end = new Date(offer.expires_at).getTime();
      setSecLeft(Math.max(0, Math.floor((end - Date.now()) / 1000)));
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [offer?.expires_at, offer?.id]);

  if (!offer?.booking) return null;

  const b = offer.booking;

  return (
    <Card className="mb-4 rounded-2xl border-amber-200 bg-amber-50/90 shadow-sm dark:border-amber-900/50 dark:bg-amber-950/35">
      <CardContent className="space-y-3 p-4">
        <div className="flex items-center justify-between gap-2">
          <Badge variant="warning">New offer</Badge>
          <span className="flex items-center gap-1 text-xs font-semibold text-amber-950 dark:text-amber-100">
            <Clock className="h-3.5 w-3.5" aria-hidden />
            {secLeft}s
          </span>
        </div>
        <div>
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Job available</h2>
          <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-200">
            {b.customer_name?.trim() || "Customer"} · {b.service ?? "Cleaning"}
          </p>
          <p className="mt-1 flex items-start gap-2 text-sm text-zinc-600 dark:text-zinc-300">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-amber-800 dark:text-amber-200" aria-hidden />
            <span>{b.location?.trim() || "Location TBD"}</span>
          </p>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            {b.date ?? "—"} {b.time ?? ""}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button
            size="lg"
            className="h-12 rounded-xl text-base"
            disabled={busy || secLeft <= 0}
            onClick={() => void onAccept(offer.id)}
          >
            Accept
          </Button>
          <Button
            variant="outline"
            size="lg"
            className="h-12 rounded-xl border-zinc-300 text-base dark:border-zinc-600"
            disabled={busy}
            onClick={() => void onDecline(offer.id)}
          >
            Decline
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
