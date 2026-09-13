"use client";

import { useState } from "react";
import { useFormContext } from "react-hook-form";
import {
  ChevronDown,
  ChevronUp,
  Clock,
  MapPin,
  Calendar,
  Users,
  Star,
  Pencil,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { SERVICE_CONFIG } from "@/src/features/booking-v2/config/serviceConfig";
import { recurringFrequencyLabel } from "@/src/features/booking-v2/config/recurringScheduleOptions";
import type { BookingV2FormData, BookingStep } from "@/src/features/booking-v2/types";
import { useBookingV2 } from "@/src/features/booking-v2/BookingV2Context";
import { formatEstimatedCleaningTimeLabel, estimatedCleaningHoursFromMinutes } from "@/lib/booking-v2/formatEstimatedCleaningTime";
import { estimateRecurringMonthlySpend } from "@/lib/recurring/estimateMonthlyRevenue";

function formatDate(dateStr: string): string {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr + "T00:00:00");
    return d.toLocaleDateString("en-ZA", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
  } catch {
    return dateStr;
  }
}

// ─── Reusable section scaffolding ───────────────────────────────────────────────

function SectionIcon({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50">
      <Icon className="h-4 w-4 text-blue-600" aria-hidden />
    </div>
  );
}

function EditLink({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      suppressHydrationWarning
      className="flex items-center gap-1 text-sm font-medium text-blue-600 transition hover:text-blue-700"
    >
      <Pencil className="h-3.5 w-3.5" aria-hidden />
      Edit
    </button>
  );
}

function Section({
  icon,
  label,
  onEdit,
  children,
}: {
  icon: LucideIcon;
  label: string;
  onEdit?: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2.5 px-4 py-2.5">
      <SectionIcon icon={icon} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p>
          {onEdit && <EditLink onClick={onEdit} />}
        </div>
        <div className="mt-1 min-w-0">{children}</div>
      </div>
    </div>
  );
}

// ─── Panel ──────────────────────────────────────────────────────────────────────

export function BookingV2SummaryPanel({ collapsed: defaultCollapsed = false }: { collapsed?: boolean }) {
  const [open, setOpen] = useState(!defaultCollapsed);
  const [priceBreakdownOpen, setPriceBreakdownOpen] = useState(false);
  const { watch } = useFormContext<BookingV2FormData>();
  const { liveConfig, goToStep } = useBookingV2();
  const values = watch();

  const config = SERVICE_CONFIG[values.serviceSlug];
  const pricing = values.pricingSummary;
  const displayTotal = pricing.estimated_total ?? pricing.total ?? 0;
  const durationHours = estimatedCleaningHoursFromMinutes(
    pricing.estimated_duration_minutes,
    liveConfig?.estimatedDurationHours ?? config.estimatedDurationHours,
  );
  const hasAddress = values.address.length >= 5;
  const hasDate = /^\d{4}-\d{2}-\d{2}$/.test(values.date);
  const hasExtras = values.selectedExtras.length > 0;
  const hasPriceBreakdown = pricing.lineItems.length > 0;

  const edit = (step: BookingStep) => () => goToStep(step);

  const durationLabel = pricing.estimated_duration_minutes > 0
    ? formatEstimatedCleaningTimeLabel(pricing.estimated_duration_minutes).replace("Estimated cleaning time: ", "")
    : `${durationHours} hours`;

  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white shadow-sm">
      {/* Mobile toggle header */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex min-h-12 w-full items-center justify-between gap-2 px-4 py-3 sm:px-5 sm:py-4 lg:hidden"
        aria-expanded={open}
      >
        <div className="flex min-w-0 items-center gap-2">
          <config.icon className="h-4 w-4 shrink-0 text-blue-600" aria-hidden />
          <span className="truncate text-sm font-semibold text-slate-800">Booking summary</span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {displayTotal > 0 && (
            <span className="text-sm font-bold text-blue-600">R{displayTotal.toLocaleString("en-ZA")}</span>
          )}
          {open ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
        </div>
      </button>

      <div
        className={cn(
          "lg:flex lg:flex-col",
          !open && "hidden",
        )}
      >
        {/* Desktop header */}
        <div className="hidden shrink-0 items-center gap-2.5 border-b border-slate-100 px-4 py-3 lg:flex">
          <SectionIcon icon={config.icon} />
          <p className="text-base font-bold text-slate-900">{config.label}</p>
        </div>

        <div className="divide-y divide-slate-100 border-b border-slate-100">
          {/* Location */}
          {hasAddress && (
            <Section icon={MapPin} label="Location" onEdit={edit(1)}>
              <p className="break-words text-sm font-medium text-slate-800">{values.address}</p>
              {values.suburb && (
                <p className="text-sm text-slate-500">
                  {values.suburb}
                  {values.city ? `, ${values.city}` : ""}
                </p>
              )}
            </Section>
          )}

          {/* Date & time */}
          {hasDate && (
            <Section icon={Calendar} label="Date & Time" onEdit={edit(2)}>
              <p className="text-sm font-medium text-slate-800">{formatDate(values.date)}</p>
              {values.time && <p className="text-sm text-slate-500">{values.time}</p>}
              {values.bookingType === "recurring" && values.recurringFrequency && (
                <p className="mt-1 text-xs font-medium text-blue-600">
                  Recurring: {recurringFrequencyLabel(values.recurringFrequency)}
                  {(values.recurringDays ?? []).length > 0
                    ? ` · ${values.recurringDays.join(", ")}`
                    : ""}
                </p>
              )}
            </Section>
          )}

          {/* Cleaners */}
          {values.cleanerMode === "individual_cleaners" && values.cleanerCount > 0 && (
            <Section icon={Users} label="Cleaners" onEdit={edit(2)}>
              <p className="flex items-center gap-1.5 text-sm font-medium text-slate-800">
                <span>{values.cleanerCount} cleaner{values.cleanerCount > 1 ? "s" : ""}</span>
                <span className="text-slate-300" aria-hidden>·</span>
                <Clock className="h-3.5 w-3.5 text-slate-400" aria-hidden />
                <span className="text-slate-500">{durationLabel}</span>
              </p>

              {values.selectedCleanerDetails.length > 0 && (
                <p className="mt-1 truncate text-xs text-blue-600">
                  {values.selectedCleanerDetails.map((cleaner) => cleaner.name).join(", ")}
                </p>
              )}
            </Section>
          )}

          {values.cleanerMode === "team" && (
            <Section icon={Users} label="Team" onEdit={edit(2)}>
              <p className="text-sm font-medium text-slate-800">
                {values.assignedTeamId
                  ? values.assignedTeamName?.trim() || "Selected team"
                  : "Best available team"}
              </p>
            </Section>
          )}

          {/* Extras */}
          {hasExtras ? (
            <Section icon={Star} label="Extras" onEdit={edit(1)}>
              <ul className="space-y-1">
                {values.selectedExtras.map((id) => {
                  const extra = (liveConfig?.extras ?? []).find((e) => e.id === id);
                  return (
                    <li key={id} className="flex items-center justify-between gap-2 text-sm text-slate-700">
                      <span className="min-w-0 truncate">{extra?.label ?? id}</span>
                      <span className="shrink-0 font-medium text-slate-800">
                        +R{(extra?.priceZar ?? 0).toLocaleString("en-ZA")}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </Section>
          ) : null}

          {/* Manual quote notice */}
          {values.equipmentRequired === "yes" && values.equipmentQuote?.manual_quote_required && (
            <div className="mx-4 mb-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 sm:mx-5">
              {values.equipmentQuote.manual_quote_message}
            </div>
          )}

          {/* Price breakdown */}
          {hasPriceBreakdown && (
            <div className="px-4 py-2.5">
              <button
                type="button"
                onClick={() => setPriceBreakdownOpen((current) => !current)}
                className="flex w-full items-center justify-between gap-2 text-sm font-medium text-blue-600 hover:text-blue-700"
                aria-expanded={priceBreakdownOpen}
              >
                <span>View price breakdown</span>
                {priceBreakdownOpen
                  ? <ChevronUp className="h-4 w-4" aria-hidden />
                  : <ChevronDown className="h-4 w-4" aria-hidden />}
              </button>
              {priceBreakdownOpen && (
                <ul className="mt-2 space-y-1.5 border-t border-slate-100 pt-2">
                  {pricing.lineItems.map((item, i) => (
                    <li key={`${item.label}-${i}`} className="flex items-center justify-between gap-2 text-sm text-slate-600">
                      <span className="min-w-0 truncate">{item.label}</span>
                      <span className="shrink-0 tabular-nums">
                        {item.amountZar < 0 ? "-" : ""}R{Math.abs(item.amountZar).toLocaleString("en-ZA")}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        {/* Compact total and reassurance */}
        <div className="shrink-0 space-y-2 px-4 py-3">
          <div className="rounded-xl bg-blue-50 px-3.5 py-2.5 ring-1 ring-inset ring-blue-100">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-base font-bold text-slate-900">
                {values.bookingType === "recurring" ? "Price per visit" : "Estimated total"}
              </span>
              <span className="text-lg font-extrabold text-blue-600">
                {hasPriceBreakdown
                  ? `R${displayTotal.toLocaleString("en-ZA")}`
                  : `From R${(liveConfig?.basePrice ?? config.basePrice).toLocaleString("en-ZA")}`}
              </span>
            </div>
            {values.bookingType === "recurring" && values.recurringFrequency ? (
              <div className="mt-1.5 space-y-0.5 text-xs text-slate-600">
                {(() => {
                  const { visitsPerMonth, estimatedMonthlyZar } = estimateRecurringMonthlySpend({
                    frequency: values.recurringFrequency,
                    daysOfWeek: values.recurringDays ?? [],
                    pricePerVisitZar: displayTotal,
                  });
                  return (
                    <>
                      <p>
                        {recurringFrequencyLabel(values.recurringFrequency)} plan
                        {(values.recurringDays ?? []).length > 0
                          ? ` · ${values.recurringDays.join(", ")}`
                          : ""}
                      </p>
                      <p>
                        About {visitsPerMonth} visit{visitsPerMonth === 1 ? "" : "s"}/month · estimated
                        monthly total R{estimatedMonthlyZar.toLocaleString("en-ZA")}
                      </p>
                      <p className="font-medium text-slate-700">
                        Pay today: R{displayTotal.toLocaleString("en-ZA")} (this visit)
                      </p>
                      <p className="text-slate-500">
                        Each visit is billed at this per-visit price. Future visits are charged
                        separately (or on your monthly invoice if your account uses monthly billing).
                      </p>
                    </>
                  );
                })()}
              </div>
            ) : (
              <p className="mt-0.5 text-xs text-slate-500">Final amount confirmed before payment.</p>
            )}
          </div>

          <p className="text-center text-[11px] font-medium text-slate-500">
            Vetted cleaners · Secure payment · No hidden fees
          </p>
        </div>
      </div>
    </div>
  );
}
