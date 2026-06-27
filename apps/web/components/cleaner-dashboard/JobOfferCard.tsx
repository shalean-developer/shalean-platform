"use client";

import Link from "next/link";
import { useState } from "react";
import { Bath, Bed, Calendar, Clock, MapPin, Wallet } from "lucide-react";
import type { CleanerJobOffer } from "./types";
import { CountdownTimer } from "./CountdownTimer";
import { Button } from "@/components/ui/button";
import {
  formatCleanerJobEarningStrictDisplay,
  isCleanerJobEarningPositive,
  JOB_EARNING_LABEL,
  JOB_EARNING_UNAVAILABLE_LABEL,
} from "@/lib/cleaner/cleanerJobEarning";
import { formatZarFromCents } from "@/lib/cleaner/cleanerZarFormat";
import { cn } from "@/lib/utils";

type JobOfferCardProps = {
  offer: CleanerJobOffer;
  busy: boolean;
  onAccept: (id: string, uxVariant: string | null | undefined) => void;
  onDecline: (id: string) => void;
  onOfferExpired?: (id: string) => void;
};

/**
 * Dispatch-style "Job earning" panel — soft emerald surface with a wallet
 * icon bubble, small uppercase label, and a strong tabular amount on the
 * right. Mirrors the cross-surface {@link JobEarningInline} prominent
 * variant so every job-earning chip in the cleaner UI shares one visual
 * language.
 *
 * Wording is locked to "Job earning" per product spec — never
 * "Estimated payout" or "Potential earnings". R0 always reads as
 * "Job earning unavailable" (in amber) because acceptance would lead to a
 * job the cleaner cannot complete (the completion API rejects R0 with
 * `job_earning_unavailable`).
 */
function JobEarningPanel({ offer }: { offer: CleanerJobOffer }) {
  const positive = isCleanerJobEarningPositive(offer.jobEarning);
  const ariaLabel = formatCleanerJobEarningStrictDisplay(offer.jobEarning);
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn(
        "flex items-center gap-3 rounded-xl px-3 py-2.5",
        positive
          ? "bg-emerald-500/10 dark:bg-emerald-500/15"
          : "bg-amber-500/10 dark:bg-amber-500/15",
      )}
    >
      <div
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-lg",
          positive
            ? "bg-emerald-600/15 text-emerald-700 dark:text-emerald-300"
            : "bg-amber-600/15 text-amber-700 dark:text-amber-300",
        )}
        aria-hidden
      >
        <Wallet className="size-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "text-xs font-semibold uppercase tracking-wider",
            positive
              ? "text-emerald-900/70 dark:text-emerald-100/80"
              : "text-amber-900/80 dark:text-amber-100/85",
          )}
        >
          {JOB_EARNING_LABEL}
        </p>
        {positive ? (
          <p
            className="mt-0.5 text-xl font-extrabold tabular-nums leading-none text-emerald-900 dark:text-emerald-50"
            data-testid="job-offer-earning-amount"
          >
            {formatZarFromCents(offer.jobEarning.amount_cents ?? 0)}
          </p>
        ) : (
          <p
            className="mt-0.5 text-sm font-semibold text-amber-900 dark:text-amber-100"
            data-testid="job-offer-earning-unavailable"
          >
            {JOB_EARNING_UNAVAILABLE_LABEL}
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * Inline metadata chip — icon + label, used for the
 * date / time / bedrooms / bathrooms row.
 */
function MetaChip({
  icon: Icon,
  children,
}: {
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  children: React.ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-foreground/80">
      <Icon className="size-3.5 text-muted-foreground" aria-hidden />
      {children}
    </span>
  );
}

/**
 * Dispatch-style offer card — premium workforce-app composition.
 *
 * Top row:    [NEW pill]                 [⏱ mm:ss countdown chip]
 * Title:      Standard Cleaning
 * Location:   📍 Claremont
 * Meta row:   📅 May 15 · 🕐 08:30 · 🛏 2 bed · 🛁 1 bath
 * Earning:    [💰] JOB EARNING            R400,00
 * Actions:    [   Accept   ] [  Decline  ]
 *
 * Visual chrome is intentionally minimal: rounded-2xl, soft shadow, no hard
 * border. The earning strip is the only tinted surface inside the card so it
 * pulls the eye to the most important number.
 */
export function JobOfferCard({ offer, busy, onAccept, onDecline, onOfferExpired }: JobOfferCardProps) {
  // SMS-fallback hint is a "is this offer younger than 20 minutes?" check.
  // We resolve it once at mount via a lazy state initializer so React's
  // purity rule isn't tripped by reading `Date.now()` during render. The
  // hint is intentionally non-reactive: once dismissed (offer cleared, SMS
  // arrives, or 20 min elapses), the user navigates away or the offer
  // disappears from the list — no need to re-evaluate inside the component.
  const [showSmsFallbackHint] = useState<boolean>(() => {
    if (offer.smsSentAt) return false;
    const tok = offer.offerToken?.trim();
    if (!tok) return false;
    const raw = offer.offerCreatedAtIso?.trim();
    if (!raw) return false;
    const created = Date.parse(raw);
    if (!Number.isFinite(created)) return false;
    return Date.now() - created < 20 * 60 * 1000;
  });

  // Prefer the structured pieces; fall back to the legacy single-line summary
  // so older mappers still render something sensible.
  const hasStructuredMeta =
    Boolean(offer.dateLabel) ||
    Boolean(offer.timeLabel) ||
    typeof offer.bedrooms === "number" ||
    typeof offer.bathrooms === "number";

  return (
    <article
      className="overflow-hidden rounded-2xl bg-card p-3.5 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_-12px_rgba(16,185,129,0.18)] ring-1 ring-border/50 transition-shadow duration-200 hover:shadow-[0_2px_4px_rgba(0,0,0,0.05),0_12px_28px_-12px_rgba(16,185,129,0.25)]"
      aria-label={`${offer.serviceLabel} offer in ${offer.suburb}`}
    >
      {showSmsFallbackHint && offer.offerToken ? (
        <div
          className="mb-2.5 flex items-center justify-between gap-2 rounded-lg bg-amber-500/10 px-2.5 py-1.5 text-xs text-amber-950 dark:text-amber-50"
          role="status"
        >
          <span className="min-w-0 truncate">
            <span className="font-semibold">SMS may not have arrived</span> — open the offer link.
          </span>
          <Link
            href={`/offer/${offer.offerToken}`}
            className="shrink-0 font-semibold underline-offset-2 hover:underline"
          >
            Open →
          </Link>
        </div>
      ) : null}

      {/* Top row — dispatch label + countdown chip. */}
      <div className="flex items-center justify-between gap-2">
        <span
          className={cn(
            "inline-flex max-w-[70%] items-center rounded-full px-2 py-0.5 text-xs font-bold uppercase tracking-wider text-white",
            offer.offerType === "preferred" ? "bg-violet-600" : "bg-emerald-600",
          )}
        >
          {offer.offerType === "preferred"
            ? offer.isUrgentOffer
              ? "Urgent job offer"
              : "Preferred customer request"
            : "New"}
        </span>
        <CountdownTimer
          variant="chip"
          expiresAtIso={offer.expiresAt}
          offerId={offer.id}
          onExpired={onOfferExpired}
        />
      </div>

      {offer.offerType === "preferred" ? (
        <p className="mt-2 text-xs font-medium leading-snug text-violet-900 dark:text-violet-100">
          {offer.isUrgentOffer
            ? "Accept quickly before this offer expires."
            : `Please accept before ${new Date(offer.acceptDeadlineIso ?? offer.expiresAt).toLocaleString("en-ZA", {
                timeZone: "Africa/Johannesburg",
                day: "2-digit",
                month: "short",
                hour: "2-digit",
                minute: "2-digit",
                hour12: false,
              })}.`}
        </p>
      ) : null}

      {/* Title. */}
      <h3 className="mt-2 truncate text-base font-bold leading-tight text-foreground">
        {offer.serviceLabel}
      </h3>

      {/* Location row. */}
      <p className="mt-1 flex items-center gap-1.5 text-[13px] text-muted-foreground">
        <MapPin className="size-3.5 shrink-0" aria-hidden />
        <span className="min-w-0 truncate">{offer.suburb}</span>
      </p>

      {/* Metadata row — date · time · bed · bath. */}
      {hasStructuredMeta ? (
        <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1">
          {offer.dateLabel ? <MetaChip icon={Calendar}>{offer.dateLabel}</MetaChip> : null}
          {offer.timeLabel ? <MetaChip icon={Clock}>{offer.timeLabel}</MetaChip> : null}
          {typeof offer.bedrooms === "number" ? (
            <MetaChip icon={Bed}>
              {offer.bedrooms} bed
            </MetaChip>
          ) : null}
          {typeof offer.bathrooms === "number" ? (
            <MetaChip icon={Bath}>
              {offer.bathrooms} bath
            </MetaChip>
          ) : null}
        </div>
      ) : (
        <p className="mt-2 text-[12px] text-muted-foreground">{offer.scheduleLine}</p>
      )}

      {/* Earning strip — the visual anchor of the card. */}
      <div className="mt-3">
        <JobEarningPanel offer={offer} />
      </div>

      {/* CTAs — Accept dominant, Decline subdued. */}
      <div className="mt-3 flex gap-2">
        <Button
          type="button"
          disabled={busy}
          className="h-10 flex-1 rounded-xl bg-emerald-600 text-sm font-semibold shadow-sm hover:bg-emerald-700 active:scale-[0.99]"
          onClick={() => onAccept(offer.id, offer.uxVariant)}
        >
          Accept
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={busy}
          className="h-10 flex-1 rounded-xl text-sm font-medium text-foreground/80 hover:bg-muted hover:text-foreground active:scale-[0.99]"
          onClick={() => onDecline(offer.id)}
        >
          Decline
        </Button>
      </div>
    </article>
  );
}
