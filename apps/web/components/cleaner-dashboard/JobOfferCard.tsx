import type { CleanerJobOffer } from "./types";
import { CountdownTimer } from "./CountdownTimer";
import { Button } from "@/components/ui/button";

type JobOfferCardProps = {
  offer: CleanerJobOffer;
  busy: boolean;
  onAccept: (id: string, uxVariant: string | null | undefined) => void;
  onDecline: (id: string) => void;
  onOfferExpired?: (id: string) => void;
};

export function JobOfferCard({ offer, busy, onAccept, onDecline, onOfferExpired }: JobOfferCardProps) {
  return (
    <div className="space-y-3 rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="flex justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium text-foreground">{offer.serviceLabel}</p>
          <p className="text-sm text-muted-foreground">{offer.suburb}</p>
        </div>
        <p className="shrink-0 text-lg font-semibold tabular-nums text-foreground">{offer.payZarLabel}</p>
      </div>

      <p className="text-sm text-muted-foreground">{offer.scheduleLine}</p>

      <CountdownTimer expiresAtIso={offer.expiresAt} offerId={offer.id} onExpired={onOfferExpired} />

      <div className="flex gap-2">
        <Button
          type="button"
          disabled={busy}
          className="h-11 flex-1 rounded-xl bg-emerald-600 text-base font-semibold hover:bg-emerald-700"
          onClick={() => onAccept(offer.id, offer.uxVariant)}
        >
          Accept
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          className="h-11 flex-1 rounded-xl text-base font-semibold"
          onClick={() => onDecline(offer.id)}
        >
          Decline
        </Button>
      </div>
    </div>
  );
}