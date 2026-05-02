import type { CleanerJobOffer } from "./types";
import { JobOfferCard } from "./JobOfferCard";

type JobOffersSectionProps = {
  offers: CleanerJobOffer[];
  actingOfferId: string | null;
  onAccept: (id: string, uxVariant: string | null | undefined) => void;
  onDecline: (id: string) => void;
  onOfferExpired?: (id: string) => void;
};

export function JobOffersSection({ offers, actingOfferId, onAccept, onDecline, onOfferExpired }: JobOffersSectionProps) {
  return (
    <section aria-labelledby="cleaner-offers-heading">
      <h2 id="cleaner-offers-heading" className="mb-2 text-lg font-semibold text-foreground">
        🔥 New Job Offers
      </h2>

      {offers.length === 0 ? (
        <p className="text-sm text-muted-foreground">No job offers right now.</p>
      ) : (
        <div className="space-y-3">
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
      )}
    </section>
  );
}
