import type { CleanerJobOffer } from "./types";
import { JobOfferCard } from "./JobOfferCard";

type JobOffersSectionProps = {
  offers: CleanerJobOffer[];
  actingOfferId: string | null;
  onAccept: (id: string, uxVariant: string | null | undefined) => void;
  onDecline: (id: string) => void;
  onOfferExpired?: (id: string) => void;
};

/**
 * Job offers list — operational cockpit variant.
 *
 * When there ARE offers: render a compact "Offers · N" mini-header followed
 * by the offer cards. The mini-header sits in the foreground type scale
 * (no all-caps shouting) so it matches the dispatch-app feel of the cards
 * directly below it.
 *
 * When there are NO offers: render only an `sr-only` heading anchor so the
 * floating CTA / sticky pending hero (`href="#cleaner-offers-heading"`)
 * still resolves, but no visible "No new offers right now." dead-space
 * block adds noise to the dashboard.
 */
export function JobOffersSection({
  offers,
  actingOfferId,
  onAccept,
  onDecline,
  onOfferExpired,
}: JobOffersSectionProps) {
  if (offers.length === 0) {
    return (
      <h2 id="cleaner-offers-heading" className="sr-only">
        New job offers
      </h2>
    );
  }

  return (
    <section aria-labelledby="cleaner-offers-heading">
      <h2
        id="cleaner-offers-heading"
        className="mb-2 flex items-baseline gap-1.5 px-0.5 text-[13px] font-semibold tracking-tight text-foreground"
      >
        <span>Offers</span>
        <span aria-hidden className="text-muted-foreground/60">·</span>
        <span className="tabular-nums text-muted-foreground">{offers.length}</span>
      </h2>
      <div className="space-y-2">
        {offers.map((offer) => (
          <JobOfferCard
            key={offer.id}
            offer={offer}
            busy={actingOfferId === offer.id}
            onAccept={onAccept}
            onDecline={onDecline}
            onOfferExpired={onOfferExpired}
          />
        ))}
      </div>
    </section>
  );
}
