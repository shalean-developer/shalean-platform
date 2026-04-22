import type { ReactNode } from "react";
import {
  formatLockedAppointmentLabel,
  getLockedBookingDisplayPrice,
  type LockedBooking,
} from "@/lib/booking/lockedBooking";
import type { BookingStep1State, PropertyTypeKind } from "./useBookingStep1";
import { BOOKING_EXTRA_LABELS } from "@/lib/booking/extraLabels";
import { getBookingSummaryServiceLabel } from "./serviceCategories";
import { getDemandPricingLabel } from "@/lib/pricing/slotSurge";
import { bookingCopy } from "@/lib/booking/copy";
import type { VipTier } from "@/lib/pricing/vipTier";
import { normalizeVipTier, vipDiscountLabel, vipTierDisplayName } from "@/lib/pricing/vipTier";

type BookingSummaryCardProps = {
  state: BookingStep1State;
  /** Step 4: no sidebar total until a slot is locked — show selection hint instead. */
  suppressEstimateUntilLocked?: boolean;
  /** When set, price and appointment are fixed — from `booking_locked` only. */
  locked?: LockedBooking | null;
  /** Steps 2–3: “From R …” smart-quote floor (not the slot total). */
  estimateFromZar?: number | null;
  /** Step 5: total due after discounts (matches pay footer). */
  amountToPayZar?: number;
  /** Step 3+ — from `booking_cleaner`; does not affect pricing. */
  selectedCleanerName?: string | null;
};

function SummaryRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="border-b border-zinc-200/70 px-3 py-3 last:border-b-0 dark:border-zinc-800/80">
      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        {label}
      </p>
      <div className="mt-1.5 text-sm font-medium text-zinc-900 dark:text-zinc-100">{children}</div>
    </div>
  );
}

function formatHoursLabel(hours: number): string {
  return hours % 1 === 0 ? `${hours}` : hours.toFixed(1).replace(/\.0$/, "");
}

function VipBadge({ tier }: { tier: VipTier }) {
  const base =
    "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide";
  if (tier === "platinum") {
    return (
      <span className={`${base} bg-violet-100 text-violet-900 dark:bg-violet-950/80 dark:text-violet-100`}>
        VIP {vipTierDisplayName(tier)}
      </span>
    );
  }
  if (tier === "gold") {
    return (
      <span className={`${base} bg-amber-100 text-amber-950 dark:bg-amber-950/60 dark:text-amber-100`}>
        VIP {vipTierDisplayName(tier)}
      </span>
    );
  }
  if (tier === "silver") {
    return (
      <span className={`${base} bg-zinc-200 text-zinc-800 dark:bg-zinc-700 dark:text-zinc-100`}>
        VIP {vipTierDisplayName(tier)}
      </span>
    );
  }
  return null;
}

function propertyLabel(t: PropertyTypeKind | null): string | null {
  if (t === "apartment") return "Apartment";
  if (t === "house") return "House";
  return null;
}

export function BookingSummaryCard({
  state,
  suppressEstimateUntilLocked = false,
  locked = null,
  estimateFromZar = null,
  amountToPayZar,
  selectedCleanerName = null,
}: BookingSummaryCardProps) {
  const serviceLine =
    state.service === null
      ? "Not selected"
      : `Service: ${getBookingSummaryServiceLabel(state.service, state.service_type)}`;

  const extrasLabels = state.extras
    .map((id) => BOOKING_EXTRA_LABELS[id] ?? id)
    .filter(Boolean);

  const extrasContent =
    extrasLabels.length === 0 ? (
      "No extras"
    ) : extrasLabels.length <= 3 ? (
      <ul className="list-inside list-disc space-y-1 text-zinc-700 dark:text-zinc-300">
        {extrasLabels.map((line) => (
          <li key={line} className="marker:text-primary">
            {line}
          </li>
        ))}
      </ul>
    ) : (
      <span>
        {extrasLabels.length === 1
          ? "1 extra selected"
          : `${extrasLabels.length} extras selected`}
      </span>
    );

  const showSelectSlotHint = !locked && suppressEstimateUntilLocked;

  return (
    <section
      className="rounded-2xl border border-zinc-200/80 bg-zinc-50/90 p-5 shadow-sm shadow-zinc-900/5 backdrop-blur-sm sm:p-6 dark:border-zinc-800 dark:bg-zinc-900/40 dark:shadow-black/25"
      aria-label="Booking summary"
    >
      <h2 className="text-base font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
        Booking summary
      </h2>
      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
        {locked
          ? bookingCopy.summary.lockedHint
          : suppressEstimateUntilLocked
            ? bookingCopy.summary.selectTimeHint
            : "Updates as you make changes."}
      </p>

      {state.location.trim() || propertyLabel(state.propertyType) ? (
        <div className="mt-3 rounded-xl border border-zinc-200/60 bg-white/60 px-3 py-2.5 text-sm dark:border-zinc-800/80 dark:bg-zinc-950/50">
          {state.location.trim() ? (
            <p className="font-medium text-zinc-900 dark:text-zinc-50">{state.location.trim()}</p>
          ) : null}
          {propertyLabel(state.propertyType) ? (
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{propertyLabel(state.propertyType)}</p>
          ) : null}
        </div>
      ) : null}

      <div className="mt-4 space-y-0 rounded-xl border border-zinc-200/60 bg-white/80 dark:border-zinc-800/80 dark:bg-zinc-950/60">
        <div className="border-b border-zinc-200/70 px-3 py-3 dark:border-zinc-800/80">
          <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{serviceLine}</p>
        </div>
        <div className="border-t border-b border-zinc-200/70 px-3 py-3 dark:border-zinc-800/80">
          <p className="flex justify-between text-sm text-zinc-700 dark:text-zinc-300">
            <span className="text-zinc-500 dark:text-zinc-400">Rooms</span>
            <span className="font-medium tabular-nums text-zinc-900 dark:text-zinc-100">{state.rooms}</span>
          </p>
          <p className="mt-2 flex justify-between text-sm text-zinc-700 dark:text-zinc-300">
            <span className="text-zinc-500 dark:text-zinc-400">Bathrooms</span>
            <span className="font-medium tabular-nums text-zinc-900 dark:text-zinc-100">{state.bathrooms}</span>
          </p>
          <p className="mt-2 flex justify-between text-sm text-zinc-700 dark:text-zinc-300">
            <span className="text-zinc-500 dark:text-zinc-400">Extra rooms</span>
            <span className="font-medium tabular-nums text-zinc-900 dark:text-zinc-100">{state.extraRooms}</span>
          </p>
        </div>
        <SummaryRow label="Extras">{extrasContent}</SummaryRow>
      </div>

      {!locked && estimateFromZar != null && !suppressEstimateUntilLocked ? (
        <div className="mt-4 space-y-1 rounded-xl border border-dashed border-zinc-300/90 bg-white/70 px-3 py-3 dark:border-zinc-600 dark:bg-zinc-950/40">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Estimated price
          </p>
          <p className="text-2xl font-bold tabular-nums text-zinc-900 dark:text-zinc-50">
            From R {estimateFromZar.toLocaleString("en-ZA")}
          </p>
          <p className="text-xs text-zinc-600 dark:text-zinc-400">
            Exact amount depends on the time you choose — shown on each slot in the next step.
          </p>
        </div>
      ) : null}

      {locked ? (
        <div className="mt-4 space-y-2 border-t border-zinc-200/80 pt-4 dark:border-zinc-800/80">
          {locked.pricingVersion === 2 ? (
            <div className="flex flex-wrap items-center gap-2">
              <VipBadge tier={normalizeVipTier(locked.vipTier)} />
              {normalizeVipTier(locked.vipTier) !== "regular" ? (
                <p className="text-xs font-medium text-emerald-800 dark:text-emerald-300">
                  VIP {vipTierDisplayName(normalizeVipTier(locked.vipTier))} — {vipDiscountLabel(normalizeVipTier(locked.vipTier))}{" "}
                  discount applied
                </p>
              ) : (
                <p className="text-xs text-zinc-600 dark:text-zinc-400">Member pricing: sign in to unlock loyalty discounts.</p>
              )}
            </div>
          ) : null}
          {locked.pricingVersion === 2 ? (
            <p className="text-xs text-zinc-600 dark:text-zinc-400">
              {getDemandPricingLabel(locked.time) === "peak"
                ? "Popular time — a little busier than other windows."
                : getDemandPricingLabel(locked.time) === "value"
                  ? "Great value time — quieter window."
                  : "Standard rate for this visit."}
            </p>
          ) : null}
          <p className="flex justify-between gap-3 text-sm text-zinc-700 dark:text-zinc-300">
            <span className="shrink-0 text-zinc-500 dark:text-zinc-400">Appointment</span>
            <span className="text-right font-medium text-zinc-900 dark:text-zinc-100">
              {formatLockedAppointmentLabel(locked)}
            </span>
          </p>
          {selectedCleanerName ? (
            <p className="flex justify-between gap-3 text-sm text-zinc-700 dark:text-zinc-300">
              <span className="shrink-0 text-zinc-500 dark:text-zinc-400">Cleaner</span>
              <span className="text-right font-medium text-zinc-900 dark:text-zinc-100">
                {selectedCleanerName}
              </span>
            </p>
          ) : null}
          <p className="flex justify-between text-sm text-zinc-700 dark:text-zinc-300">
            <span className="text-zinc-500 dark:text-zinc-400">Duration (est.)</span>
            <span className="font-medium tabular-nums text-zinc-900 dark:text-zinc-100">
              {formatHoursLabel(locked.finalHours)} hrs
            </span>
          </p>
          {typeof amountToPayZar === "number" &&
          Number.isFinite(amountToPayZar) &&
          Math.round(amountToPayZar) !== Math.round(getLockedBookingDisplayPrice(locked)) ? (
            <>
              <p className="flex justify-between font-semibold">
                <span className="text-emerald-800 dark:text-emerald-200">Total to pay</span>
                <span className="text-xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                  R {amountToPayZar.toLocaleString("en-ZA")}
                </span>
              </p>
              <p className="flex justify-between text-xs text-zinc-600 dark:text-zinc-400">
                <span>Visit price (locked)</span>
                <span className="font-medium tabular-nums">
                  R {getLockedBookingDisplayPrice(locked).toLocaleString("en-ZA")}
                </span>
              </p>
            </>
          ) : (
            <p className="flex justify-between font-semibold">
              <span className="text-emerald-800 dark:text-emerald-200">
                {typeof amountToPayZar === "number" && Number.isFinite(amountToPayZar) ? "Total to pay" : "Final price"}
              </span>
              <span className="text-xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                R{" "}
                {(typeof amountToPayZar === "number" && Number.isFinite(amountToPayZar)
                  ? amountToPayZar
                  : getLockedBookingDisplayPrice(locked)
                ).toLocaleString("en-ZA")}
              </span>
            </p>
          )}
        </div>
      ) : null}

      {showSelectSlotHint ? (
        <div className="mt-4 border-t border-zinc-200/80 pt-4 dark:border-zinc-800/80">
          <p className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
            {bookingCopy.summary.selectTimeHint}
          </p>
        </div>
      ) : null}

    </section>
  );
}
