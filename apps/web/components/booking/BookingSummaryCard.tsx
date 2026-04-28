import {
  formatLockedAppointmentLabel,
  getLockedBookingDisplayPrice,
  type LockedBooking,
} from "@/lib/booking/lockedBooking";
import { BOOKING_CHECKOUT_LOCK_VERSION } from "@/lib/booking/checkoutLockValidation";
import type { BookingStep1State } from "./useBookingStep1";
import { getBookingSummaryServiceLabel } from "./serviceCategories";
import { getDemandPricingLabel } from "@/lib/pricing/slotSurge";
import { bookingCopy } from "@/lib/booking/copy";
import type { VipTier } from "@/lib/pricing/vipTier";
import { normalizeVipTier, vipDiscountLabel, vipTierDisplayName } from "@/lib/pricing/vipTier";
import { Bath, Bed, Clock3, DoorOpen, MapPin, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

type BookingSummaryCardProps = {
  state: BookingStep1State;
  /** Step 4: shown in “When” before a slot is locked (e.g. selected date + “pick a time”). */
  scheduleDateHint?: string | null;
  /** Step 4: no sidebar total until a slot is locked — show selection hint instead. */
  suppressEstimateUntilLocked?: boolean;
  /** When set, price and appointment are fixed — from `booking_locked` only. */
  locked?: LockedBooking | null;
  /** Steps 2–3: “From R …” smart-quote floor (not the slot total). */
  estimateFromZar?: number | null;
  /** Details step: plan preview total (UI discount on `estimateFromZar`). */
  estimatePlanDiscountedZar?: number | null;
  /** e.g. `weekly plan (10% off)` — paired with `estimatePlanDiscountedZar`. */
  estimatePlanLabel?: string | null;
  /** Step 5: total due after discounts (matches pay footer). */
  amountToPayZar?: number;
  /** Step 3+ — from `booking_cleaner`; does not affect pricing. */
  selectedCleanerName?: string | null;
  /** Hide estimate footnotes on small screens (shown in footer insight banner instead). */
  hideMobilePricingFootnotes?: boolean;
  /** Bundled ZAR total for selected extras (details / quote; null when none or catalog missing). */
  selectedExtrasBundledZar?: number | null;
};

function formatHoursLabel(hours: number): string {
  return hours % 1 === 0 ? `${hours}` : hours.toFixed(1).replace(/\.0$/, "");
}

function MetricTile({
  label,
  value,
  icon,
}: {
  label: string;
  value: number;
  icon: "bed" | "bath" | "door";
}) {
  const Icon = icon === "bed" ? Bed : icon === "bath" ? Bath : DoorOpen;
  return (
    <div className="rounded-xl border border-zinc-200/70 bg-white/80 p-3 text-center dark:border-zinc-800/80 dark:bg-zinc-950/50">
      <Icon className="mx-auto h-4 w-4 text-blue-600" aria-hidden />
      <p className="mt-1 text-[11px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">{value}</p>
    </div>
  );
}

function CompactDetailRow({
  label,
  value,
  icon,
}: {
  label: "What" | "Where" | "When";
  value: string;
  icon: "what" | "where" | "when";
}) {
  const Icon = icon === "what" ? Sparkles : icon === "where" ? MapPin : Clock3;
  return (
    <div className="grid grid-cols-[80px_1fr] items-center gap-x-3 text-sm">
      <p className="flex items-center gap-1.5 font-medium text-zinc-500 dark:text-zinc-400">
        <Icon className="h-4 w-4 text-blue-600" aria-hidden />
        {label}:
      </p>
      <p className="font-semibold text-zinc-900 dark:text-zinc-100">{value}</p>
    </div>
  );
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

export function BookingSummaryCard({
  state,
  scheduleDateHint = null,
  suppressEstimateUntilLocked = false,
  locked = null,
  estimateFromZar = null,
  estimatePlanDiscountedZar = null,
  estimatePlanLabel = null,
  amountToPayZar,
  selectedCleanerName = null,
  hideMobilePricingFootnotes = false,
  selectedExtrasBundledZar = null,
}: BookingSummaryCardProps) {
  const whatValue =
    state.service === null ? "Not selected" : getBookingSummaryServiceLabel(state.service, state.service_type);
  const whereValue = state.location.trim() || "Not set";
  const whenValue = locked
    ? formatLockedAppointmentLabel(locked)
    : scheduleDateHint?.trim()
      ? scheduleDateHint.trim()
      : "Select in next step";

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

      <div className="mt-4 grid grid-cols-3 gap-4">
        <MetricTile label="Bedrooms" value={state.rooms} icon="bed" />
        <MetricTile label="Bathrooms" value={state.bathrooms} icon="bath" />
        <MetricTile label="Extra" value={state.extraRooms} icon="door" />
      </div>

      <div className="mt-3 space-y-2 rounded-xl border border-zinc-200/60 bg-white/80 p-3 dark:border-zinc-800/80 dark:bg-zinc-950/60">
        <CompactDetailRow label="What" value={whatValue} icon="what" />
        <CompactDetailRow label="Where" value={whereValue} icon="where" />
        <CompactDetailRow label="When" value={whenValue} icon="when" />
      </div>

      {state.extras.length > 0 && selectedExtrasBundledZar != null ? (
        <p className="mt-3 text-sm font-medium tabular-nums text-zinc-800 dark:text-zinc-100">
          Selected add-ons:{" "}
          <span className="text-blue-600 dark:text-blue-400">
            R {selectedExtrasBundledZar.toLocaleString("en-ZA")}
          </span>
          <span className="mt-0.5 block text-xs font-normal text-zinc-500 dark:text-zinc-400 sm:ml-2 sm:mt-0 sm:inline">
            (bundled where it saves you money)
          </span>
        </p>
      ) : null}

      {!locked && estimateFromZar != null && !suppressEstimateUntilLocked ? (
        <div className="mt-4 space-y-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-4 dark:border-blue-900/50 dark:bg-blue-950/35">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Estimated price (before time selection)
          </p>
          {estimatePlanDiscountedZar != null &&
          estimatePlanLabel &&
          estimatePlanDiscountedZar !== estimateFromZar ? (
            <>
              <p className="text-sm font-medium tabular-nums text-zinc-700 dark:text-zinc-300">
                R {estimateFromZar.toLocaleString("en-ZA")}{" "}
                <span className="font-normal text-zinc-500 dark:text-zinc-400">per visit (list)</span>
              </p>
              <p className="text-2xl font-bold tabular-nums text-emerald-800 dark:text-emerald-300">
                R {estimatePlanDiscountedZar.toLocaleString("en-ZA")}{" "}
                <span className="block text-sm font-semibold leading-snug text-emerald-900/90 dark:text-emerald-200/90 sm:inline sm:pl-1">
                  with {estimatePlanLabel}
                </span>
              </p>
            </>
          ) : (
            <p className="text-2xl font-bold tabular-nums text-zinc-900 dark:text-zinc-50">
              From R {estimateFromZar.toLocaleString("en-ZA")}
            </p>
          )}
          <div className={cn(hideMobilePricingFootnotes && "max-lg:hidden")}>
            <p className="text-xs text-zinc-600 dark:text-zinc-400">{bookingCopy.checkout.widgetEstimateNote}</p>
            <p className="mt-1 text-xs text-emerald-700 dark:text-emerald-400/90">
              You may get a lower price by choosing a flexible time
            </p>
          </div>
          <p className="mt-2 text-xs font-medium text-zinc-700 dark:text-zinc-300">
            {bookingCopy.summary.finalPriceConfirmed}
          </p>
        </div>
      ) : null}

      {locked ? (
        <div className="mt-4 space-y-2 border-t border-zinc-200/80 pt-4 dark:border-zinc-800/80">
          {locked.pricingVersion === BOOKING_CHECKOUT_LOCK_VERSION ? (
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
          {locked.pricingVersion === BOOKING_CHECKOUT_LOCK_VERSION ? (
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
          {typeof locked.quoteSubtotalZar === "number" &&
          Number.isFinite(locked.quoteSubtotalZar) &&
          typeof locked.quoteVipSavingsZar === "number" &&
          Number.isFinite(locked.quoteVipSavingsZar) &&
          locked.quoteVipSavingsZar > 0 ? (
            <div className="space-y-1 rounded-lg border border-emerald-200/70 bg-emerald-50/50 px-3 py-2 text-xs dark:border-emerald-900/40 dark:bg-emerald-950/25">
              <p className="flex justify-between tabular-nums text-zinc-700 dark:text-zinc-300">
                <span>Cleaning service (base)</span>
                <span>R {locked.quoteSubtotalZar.toLocaleString("en-ZA")}</span>
              </p>
              <p className="flex justify-between tabular-nums font-medium text-emerald-900 dark:text-emerald-200">
                <span>VIP ({vipTierDisplayName(normalizeVipTier(locked.vipTier))})</span>
                <span>−R {locked.quoteVipSavingsZar.toLocaleString("en-ZA")}</span>
              </p>
              {typeof locked.quoteAfterVipSubtotalZar === "number" &&
              Number.isFinite(locked.quoteAfterVipSubtotalZar) ? (
                <p className="text-[11px] leading-snug text-zinc-600 dark:text-zinc-400">
                  After loyalty: R {locked.quoteAfterVipSubtotalZar.toLocaleString("en-ZA")} — your visit total below
                  includes time and demand. {bookingCopy.checkout.pricingRoundingNote}
                </p>
              ) : null}
            </div>
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
              <p className="flex items-end justify-between gap-3">
                <span className="text-xs font-semibold uppercase tracking-wide text-emerald-900/90 dark:text-emerald-200/90">
                  Total to pay
                </span>
                <span className="text-2xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                  R {amountToPayZar.toLocaleString("en-ZA")}
                </span>
              </p>
              <p className="mt-1 flex justify-between text-sm text-zinc-600 dark:text-zinc-400">
                <span>Visit total</span>
                <span className="font-medium tabular-nums text-zinc-700 dark:text-zinc-300">
                  R {getLockedBookingDisplayPrice(locked).toLocaleString("en-ZA")}
                </span>
              </p>
            </>
          ) : (
            <p className="flex items-end justify-between gap-3">
              <span className="text-sm font-semibold text-emerald-800 dark:text-emerald-200">
                {typeof amountToPayZar === "number" && Number.isFinite(amountToPayZar) ? "Total to pay" : "Visit total"}
              </span>
              <span className="text-2xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                R{" "}
                {(typeof amountToPayZar === "number" && Number.isFinite(amountToPayZar)
                  ? amountToPayZar
                  : getLockedBookingDisplayPrice(locked)
                ).toLocaleString("en-ZA")}
              </span>
            </p>
          )}
          <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300">{bookingCopy.summary.finalPriceConfirmed}</p>
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
