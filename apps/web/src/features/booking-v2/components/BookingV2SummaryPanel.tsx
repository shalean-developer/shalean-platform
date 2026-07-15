"use client";

import { useState } from "react";
import { useFormContext } from "react-hook-form";
import {
  ChevronDown,
  ChevronUp,
  ShieldCheck,
  CreditCard,
  ThumbsUp,
  Clock,
  MapPin,
  Calendar,
  Users,
  Star,
  Tag,
  Pencil,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { SERVICE_CONFIG } from "@/src/features/booking-v2/config/serviceConfig";
import { recurringFrequencyLabel } from "@/src/features/booking-v2/config/recurringScheduleOptions";
import type { BookingV2FormData, BookingStep } from "@/src/features/booking-v2/types";
import { useBookingV2 } from "@/src/features/booking-v2/BookingV2Context";
import { formatAreasServedPreview } from "@/src/features/booking-v2/components/CleanerCard";
import { formatEstimatedCleaningTimeLabel, estimatedCleaningHoursFromMinutes } from "@/lib/booking-v2/formatEstimatedCleaningTime";

const TRUST_BADGES = [
  { Icon: ShieldCheck, title: "Vetted cleaners", desc: "Background checked & verified", color: "text-green-600" },
  { Icon: CreditCard, title: "Secure payment", desc: "Your payment is safe and protected", color: "text-blue-600" },
  { Icon: ThumbsUp, title: "Satisfaction guarantee", desc: "We'll make it right", color: "text-green-600" },
] as const;

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
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50">
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
    <div className="flex items-start gap-3 px-4 py-3 sm:px-5">
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

  const durationRow = (
    <div className="mt-2 flex items-center gap-1.5 text-xs text-slate-500">
      <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span>
        {pricing.estimated_duration_minutes > 0
          ? formatEstimatedCleaningTimeLabel(pricing.estimated_duration_minutes)
          : `Estimated cleaning time: ${durationHours} hours`}
      </span>
    </div>
  );

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
          "lg:flex lg:max-h-[calc(100dvh-7rem)] lg:flex-col",
          !open && "hidden",
        )}
      >
        {/* Desktop header */}
        <div className="hidden shrink-0 items-center gap-3 border-b border-slate-100 px-5 py-3 lg:flex">
          <SectionIcon icon={config.icon} />
          <p className="text-base font-bold text-slate-900">{config.label}</p>
        </div>

        {/* Sections (desktop: scroll independently so the panel never grows past viewport) */}
        <div className="divide-y divide-slate-100 border-b border-slate-100 lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
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
              <p className="text-sm font-medium text-slate-800">
                {values.cleanerCount} cleaner{values.cleanerCount > 1 ? "s" : ""}
              </p>

              {values.selectedCleanerDetails.length > 0 && (
                <div className="mt-2 space-y-2">
                  {values.selectedCleanerDetails.map((c) => (
                    <div
                      key={c.id}
                      className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5"
                    >
                      <div
                        className={cn(
                          "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                          c.avatarColor,
                        )}
                        aria-hidden
                      >
                        {c.initials}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-slate-800">{c.name}</p>
                        <p className="flex flex-wrap items-center gap-x-1 gap-y-0.5 text-xs text-slate-500">
                          {c.rating != null && (
                            <span className="flex items-center gap-0.5">
                              <Star className="h-3 w-3 fill-amber-400 text-amber-400" aria-hidden />
                              {c.rating.toFixed(1)}
                            </span>
                          )}
                          <span>· {c.jobsCompleted} jobs</span>
                        </p>
                        {(() => {
                          const areas = formatAreasServedPreview(c.areasServed);
                          if (!areas) return null;
                          return (
                            <p className="mt-0.5 truncate text-xs text-slate-400">
                              {areas.primary}
                              {areas.moreCount > 0 ? ` +${areas.moreCount} more` : ""}
                            </p>
                          );
                        })()}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <p className="mt-2 text-xs font-medium text-blue-600">
                {values.selectedCleanerIds.length > 0
                  ? `${values.selectedCleanerIds.length} preferred cleaner${values.selectedCleanerIds.length > 1 ? "s" : ""} selected`
                  : "Best available cleaner"}
              </p>
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

          {/* Extras + duration */}
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
              {durationRow}
            </Section>
          ) : (
            <div className="px-4 py-3 sm:px-5">{durationRow}</div>
          )}

          {/* Manual quote notice */}
          {values.equipmentRequired === "yes" && values.equipmentQuote?.manual_quote_required && (
            <div className="mx-4 mb-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 sm:mx-5">
              {values.equipmentQuote.manual_quote_message}
            </div>
          )}

          {/* Price breakdown */}
          {hasPriceBreakdown && (
            <Section icon={Tag} label="Price breakdown">
              <ul className="space-y-1.5">
                {pricing.lineItems.map((item, i) => (
                  <li
                    key={`${item.label}-${i}`}
                    className="flex items-center justify-between gap-2 text-sm text-slate-600"
                  >
                    <span className="min-w-0 truncate">{item.label}</span>
                    <span className="shrink-0 tabular-nums">
                      {item.amountZar < 0 ? "-" : ""}R{Math.abs(item.amountZar).toLocaleString("en-ZA")}
                    </span>
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </div>

        {/* Total + trust footer (pinned on desktop) */}
        <div className="shrink-0 space-y-3 px-4 py-4 sm:px-5">
            <div className="rounded-xl bg-blue-50 px-4 py-3 ring-1 ring-inset ring-blue-100">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-base font-bold text-slate-900">
                {values.bookingType === "recurring" ? "Price per visit" : "Estimated total"}
              </span>
              <span className="text-xl font-extrabold text-blue-600">
                {hasPriceBreakdown
                  ? `R${displayTotal.toLocaleString("en-ZA")}`
                  : `From R${(liveConfig?.basePrice ?? config.basePrice).toLocaleString("en-ZA")}`}
              </span>
            </div>
            {values.bookingType === "recurring" && values.recurringFrequency ? (
              <div className="mt-1.5 space-y-0.5 text-xs text-slate-600">
                <p>
                  {recurringFrequencyLabel(values.recurringFrequency)} plan
                  {(values.recurringDays ?? []).length > 0
                    ? ` · ${values.recurringDays.join(", ")}`
                    : ""}
                </p>
                <p>
                  Estimated monthly spend: about R
                  {(
                    displayTotal *
                    (values.recurringFrequency === "weekly"
                      ? 4
                      : values.recurringFrequency === "fortnightly"
                        ? 2
                        : 1)
                  ).toLocaleString("en-ZA")}{" "}
                  (based on this visit price).
                </p>
                <p className="text-slate-500">
                  Future visits are charged at the same per-visit price unless you change your plan.
                </p>
              </div>
            ) : (
              <p className="mt-0.5 text-xs text-slate-500">
                Final amount confirmed before payment. No hidden fees.
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 gap-2 rounded-xl bg-slate-50 p-3 sm:grid-cols-3">
            {TRUST_BADGES.map(({ Icon, title, desc, color }) => (
              <div
                key={title}
                className="flex flex-row items-center gap-2 text-left sm:flex-col sm:items-center sm:gap-1 sm:text-center"
              >
                <Icon className={cn("h-5 w-5 shrink-0", color)} aria-hidden />
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold leading-tight text-slate-700">{title}</p>
                  <p className="text-[10px] leading-tight text-slate-400">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
