"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  ArrowLeft,
  Bell,
  CheckCircle2,
  Circle,
  Clock,
  CreditCard,
  Loader2,
  Mail,
  MapPin,
  Pencil,
  Phone,
  ReceiptText,
  TriangleAlert,
  User,
  Users,
} from "lucide-react";
import BookingActionsDropdown from "@/components/admin/BookingActionsDropdown";
import { OfficeBookingDetailsShell, type OfficeTimelineStep } from "@/components/admin/office/OfficeBookingDetailsShell";
import { BookingNotificationTimeline } from "@/components/admin/office/BookingNotificationTimeline";
import type { BookingOperationalPhase } from "@/lib/booking/deriveBookingOperationalPhase";
import { Button } from "@/components/ui/button";
import { confirm, showToast } from "@/components/ui/notifications";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AdminDashboardActionError,
  assignTeamToBookingAdmin,
  deleteBookingAdmin,
  fetchCleaners,
  updateBooking,
  updateBookingStatus,
  type AdminCleanerRow,
} from "@/lib/admin/dashboard";
import { AdminAssignForm, type CleanerOption } from "@/components/admin/AdminAssignForm";
import { AdminWarningList } from "@/components/admin/AdminWarningList";
import type { AdminWarning } from "@/lib/admin/adminWarningPayload";
import { CLEANER_UX_VARIANTS, type CleanerUxVariant } from "@/lib/cleaner/cleanerOfferUxVariant";
import { issueReportReasonDisplay } from "@/lib/cleaner/cleanerJobIssueReasons";
import { BOOKING_EXTRA_ID_SET } from "@/lib/pricing/extrasConfig";
import { BOOKING_ROSTER_LOCKED_HINT } from "@/lib/admin/bookingRosterLockedMessage";
import { assignmentSourceLabel } from "@/lib/admin/assignmentDisplay";
import { getSupabaseBrowser } from "@/lib/supabase/browser";
import { getAdminToken } from "@/hooks/useAdminData";
import { AdminBookingLiveLocation } from "@/components/admin/AdminBookingLiveLocation";
import {
  EmergencyRosterReassignModal,
  type EmergencyRosterCleanerRow,
} from "@/components/admin/EmergencyRosterReassignModal";
import type { ServiceQaAdminWire } from "@/lib/booking/bookingServiceQa";
import {
  adminBookingVisitPricingSplit,
  parseAdminBookingPriceSnapshot,
  type AdminPriceSnapshotCardView,
} from "@/lib/booking/priceSnapshotAdminDisplay";
import { parseStoredPriceBreakdown } from "@/lib/dashboard/storedPriceBreakdown";
import { adminLinesFromPricingSummary } from "@/lib/booking-v2/adminPricingDisplay";
import { adminBookingDispatchAttemptId } from "@/lib/admin/adminBookingAssignmentLabels";
import { computeAdminBookingCleanerPayoutDisplay } from "@/lib/admin/adminBookingCleanerPayoutDisplay";
import type { AdminEarningsDisplay } from "@/lib/payout/bookingEarningsSummary";
import {
  describeBookingOperationalState,
  operationalDisplayBadgeClassName,
} from "@/lib/booking/describeBookingOperationalState";
import type { DashboardLifecycleAlignmentWire } from "@/lib/booking/bookingLifecycleContract";
import {
  type AdminBookingsListRow,
  normalizeAdminBookingDispatchStatus,
} from "@/lib/admin/adminBookingsListRow";
import { preferredDispatchStatusAdminLabel } from "@/lib/dispatch/preferredCleanerDispatchPolicy";
import {
  adminDispatchNeedsAttentionFromLifecycle,
  adminLifecycleDispatchCaption,
  adminLifecycleRawDiagnosticLine,
} from "@/lib/admin/adminDashboardLifecycleDisplay";
import {
  resolveAdminBookingCustomerName,
  resolveAdminBookingCustomerPhone,
} from "@/lib/admin/adminBookingCustomerContact";

type BookingSeed = { id: string };

type BookingDetails = {
  id: string;
  customer_email: string | null;
  customer_name?: string | null;
  service: string | null;
  /** Catalog slug when persisted (`standard`, `airbnb`, `move`, etc.). */
  service_slug?: string | null;
  date: string | null;
  time: string | null;
  location: string | null;
  total_paid_zar: number | null;
  amount_paid_cents: number | null;
  base_amount_cents?: number | null;
  service_fee_cents?: number | null;
  cleaner_payout_cents?: number | null;
  cleaner_bonus_cents?: number | null;
  /** Team: per-cleaner display (R250 each); `cleaner_payout_cents` is 0 when team payout is member rows + `team_per_cleaner_fixed`. */
  display_earnings_cents?: number | null;
  team_member_count_snapshot?: number | null;
  /** Ledger total when synced (fallback when display basis is missing). */
  cleaner_earnings_total_cents?: number | null;
  company_revenue_cents?: number | null;
  earnings_summary?: unknown;
  payout_percentage?: number | null;
  payout_type?: string | null;
  is_test?: boolean | null;
  status: string | null;
  /** Auto-dispatch funnel; terminal `unassignable` / `no_cleaner` need manual assign or reset. */
  dispatch_status?: string | null;
  /** Preferred-cleaner dispatch workflow phase (see `preferredCleanerDispatch`). */
  preferred_dispatch_status?: string | null;
  /** Cleaner lifecycle: `on_my_way` enables live GPS tracking. */
  cleaner_response_status?: string | null;
  user_id: string | null;
  cleaner_id: string | null;
  /** Customer checkout pick; assignment finalizes in `cleaner_id` after accept. */
  selected_cleaner_id?: string | null;
  /** Dispatch / offer attempt trace (not the checkout column). */
  attempted_cleaner_id?: string | null;
  assignment_type?: string | null;
  fallback_reason?: string | null;
  team_id?: string | null;
  is_team_job?: boolean | null;
  booking_snapshot?: unknown;
  duration_hours?: number | null;
  duration_minutes?: number | null;
  /** Legacy string slugs or persisted `{ slug, name, price }` rows from checkout. */
  extras?: unknown[] | null;
  created_at: string;
  customer_phone?: string | null;
  phone?: string | null;
  /** Admin bypassed duplicate-slot guard (intentional second row on same slot). */
  admin_force_slot_override?: boolean | null;
  /** Immutable checkout / admin pricing snapshot (JSON). */
  price_snapshot?: unknown;
  /** Checkout breakdown blob (`extrasZar`, optional nested `job.extrasZar`, etc.). */
  price_breakdown?: unknown;
  /** Invoice-style booking payout lifecycle (`pending` | `eligible` | `paid`). */
  payout_status?: string | null;
  payment_completed_at?: string | null;
  payment_status?: string | null;
  /** Off-platform settlement: cash | zoho | eft (set by admin mark-paid). */
  payment_method?: string | null;
  payment_reference_external?: string | null;
  paystack_reference?: string | null;
  /** Quoted total in ZAR (major units) at checkout / admin init. */
  total_price?: number | null;
  rooms?: number | null;
  bathrooms?: number | null;
  cleaner_line_earnings_finalized_at?: string | null;
  /** Row version for optimistic locking (admin edit-details). */
  updated_at?: string | null;
  payment_mismatch?: boolean | null;
  total_paid_cents?: number | null;
  /** Off-platform deposit recorded by admin (cents); does not imply full settlement. */
  deposit_paid_cents?: number | null;
  assigned_at?: string | null;
  /** Set when cleaner accepts in app (with `cleaner_response_status` accepted). */
  accepted_at?: string | null;
  en_route_at?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  is_recurring_generated?: boolean | null;
  billing_type?: string | null;
  admin_recurring_unpaid_completion_override_at?: string | null;
  admin_recurring_unpaid_completion_override_by?: string | null;
  recurring_id?: string | null;
  /** Derived recurring Paystack collection label (see `deriveRecurringPaymentState`). */
  payment_state?: string | null;
  /** Booking-v2 structured pricing breakdown JSONB. */
  pricing_summary?: unknown;
  equipment_required?: boolean | null;
  equipment_distance_km?: number | null;
  equipment_base_fee?: number | null;
  equipment_price_per_km?: number | null;
  equipment_distance_charge?: number | null;
  equipment_logistics_fee?: number | null;
  equipment_base_location?: string | null;
  manual_quote_required?: boolean | null;
  equipment_fee_override_reason?: string | null;
};

/** Solo-cleaner assign card: only these catalog services (deep/move use dispatch / team flows). */
const ADMIN_SOLO_CLEANER_DETAIL_CARD_SERVICES = new Set(["standard", "airbnb", "carpet"]);

function adminBookingShowsSoloCleanerDetailCard(booking: BookingDetails): boolean {
  const slugRaw =
    typeof booking.service_slug === "string" ? booking.service_slug.trim().toLowerCase() : "";
  if (slugRaw) return ADMIN_SOLO_CLEANER_DETAIL_CARD_SERVICES.has(slugRaw);

  const lab = (booking.service ?? "").trim().toLowerCase();
  if (!lab) return false;
  if (lab.includes("standard")) return true;
  if (lab.includes("airbnb")) return true;
  if (lab.includes("carpet")) return true;
  return false;
}

type TeamSummary = { id: string; name: string; member_count: number | null };

type TeamAssignCandidate = {
  id: string;
  name: string;
  capacity_per_day: number;
  /** Assignment-eligible cleaners (capability-qualified); legacy field from API. */
  member_count: number;
  /** Present on newer APIs; falls back to `member_count` in UI when missing. */
  active_member_count?: number;
  qualified_member_count?: number;
  used_slots_today: number;
  remaining_slots_today: number;
  assignable: boolean;
  /** False when team is deactivated in Admin → Teams (still listed). */
  team_active?: boolean;
};

type BookingCleanerRow = {
  id: string;
  cleaner_id: string;
  role: string;
  assigned_at: string;
  payout_weight: number;
  lead_bonus_cents: number;
  source: string | null;
  cleaner_name?: string | null;
};

type Cleaner = {
  id: string;
  full_name: string | null;
  status: string | null;
  email?: string | null;
  phone?: string | null;
  rating?: number | null;
  jobs_completed?: number | null;
};

type UserProfile = {
  id: string;
  email?: string | null;
  full_name?: string | null;
  phone?: string | null;
  tier?: string | null;
};

type DispatchOfferAdminRow = {
  id: string;
  cleaner_id: string;
  status: string | null;
  rank_index: number | null;
  expires_at: string | null;
  created_at: string | null;
  responded_at: string | null;
  ux_variant?: string | null;
  offer_type?: string | null;
  sent_at?: string | null;
};

type ToastState = { kind: "success" | "error" | "info"; text: string } | null;

type EarningsPreviewResponse = {
  current: {
    display_earnings_cents: number | null;
    cleaner_earnings_total_cents: number | null;
    line_items_count: number;
  };
  computed_preview: { cleaner_earnings_total_cents: number; diff_cents: number } | null;
  preview_unavailable_reason?: string;
};

type BookingNotificationLogRow = {
  id: string;
  channel: string;
  template_key: string;
  status: string;
  role: string | null;
  event_type: string | null;
  provider: string;
  created_at: string;
  error: string | null;
  payload: Record<string, unknown> | null;
};

type CleanerIssueReportRow = {
  id: string;
  cleaner_id: string;
  reason_key: string;
  reason_version?: string | null;
  detail: string | null;
  whatsapp_snapshot?: unknown;
  idempotency_key?: string | null;
  created_at: string;
  resolved_at?: string | null;
  resolved_by?: string | null;
};

function digitsForWhatsApp(phone: string | null | undefined): string | null {
  if (!phone?.trim()) return null;
  const d = phone.replace(/\D/g, "");
  if (d.length < 9) return null;
  if (d.startsWith("27")) return d;
  if (d.startsWith("0")) return `27${d.slice(1)}`;
  return d;
}

function formatTimeSinceReport(iso: string | null | undefined, nowMs: number): string | null {
  if (!iso?.trim()) return null;
  const t = new Date(iso.trim()).getTime();
  if (!Number.isFinite(t)) return null;
  const sec = Math.max(0, Math.floor((nowMs - t) / 1000));
  if (sec < 45) return "Reported just now";
  const m = Math.floor(sec / 60);
  if (sec < 3600) return m <= 1 ? "Reported 1 min ago" : `Reported ${m} min ago`;
  const h = Math.floor(sec / 3600);
  if (sec < 86400) return h === 1 ? "Reported 1 hour ago" : `Reported ${h} hours ago`;
  const d = Math.floor(sec / 86400);
  return d === 1 ? "Reported 1 day ago" : `Reported ${d} days ago`;
}

type DispatchOfferUxFilter = "all" | CleanerUxVariant | "unknown";

function isKnownDispatchUxVariant(raw: string): raw is CleanerUxVariant {
  return (CLEANER_UX_VARIANTS as readonly string[]).includes(raw);
}

function dispatchOfferUxVariantKey(o: DispatchOfferAdminRow): CleanerUxVariant | "unknown" {
  const u = String(o.ux_variant ?? "").trim().toLowerCase();
  return isKnownDispatchUxVariant(u) ? u : "unknown";
}

function variantCountShareLabel(count: number, total: number): string {
  if (total <= 0) return `${count}`;
  const pct = Math.round((count / total) * 100);
  return `${count}, ${pct}%`;
}

function money(booking: BookingDetails): number {
  if (typeof booking.total_price === "number" && Number.isFinite(booking.total_price) && booking.total_price > 0) {
    return Math.round(booking.total_price);
  }
  const breakdown = parseStoredPriceBreakdown(booking.price_breakdown);
  if (breakdown) return breakdown.totalZar;
  if (typeof booking.total_paid_zar === "number" && Number.isFinite(booking.total_paid_zar)) {
    return Math.round(booking.total_paid_zar);
  }
  return Math.round((booking.amount_paid_cents ?? 0) / 100);
}

function centsToZar(cents: number | null | undefined): number | null {
  if (cents == null || !Number.isFinite(Number(cents))) return null;
  return Math.round(Number(cents) / 100);
}

function formatZar(n: number): string {
  return `R ${n.toLocaleString("en-ZA")}`;
}

/** Human label when payment was recorded off-platform (cash / external / EFT). */
function adminOffPlatformPaidBadgeLabel(booking: BookingDetails): string | null {
  const pm = String(booking.payment_method ?? "").trim().toLowerCase();
  if (pm === "cash") return "Paid (Cash)";
  if (pm === "eft") {
    const ext = String(booking.payment_reference_external ?? "").trim();
    if (!ext) return "Paid (EFT)";
    const short = ext.length > 42 ? `${ext.slice(0, 42)}…` : ext;
    return `Paid (EFT: ${short})`;
  }
  if (pm === "zoho") {
    const ext = String(booking.payment_reference_external ?? "").trim();
    if (!ext) return "Paid (external)";
    const short = ext.length > 42 ? `${ext.slice(0, 42)}…` : ext;
    return `Paid (external: ${short})`;
  }
  const ref = String(booking.paystack_reference ?? "").trim().toLowerCase();
  if (ref.startsWith("cash_")) return "Paid (Cash)";
  if (ref.startsWith("eft_")) {
    const tail = ref.replace(/^eft_/, "");
    const ext = tail.length > 42 ? `${tail.slice(0, 42)}…` : tail;
    return ext ? `Paid (EFT: ${ext})` : "Paid (EFT)";
  }
  if (ref.startsWith("zoho_")) {
    const tail = ref.replace(/^zoho_/, "");
    const ext = tail.length > 42 ? `${tail.slice(0, 42)}…` : tail;
    return ext ? `Paid (external: ${ext})` : "Paid (external)";
  }
  return null;
}

function formatShortTs(iso: string | null | undefined): string {
  if (!iso || !String(iso).trim()) return "—";
  const d = new Date(String(iso).trim());
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-ZA", { dateStyle: "medium", timeStyle: "short" });
}

function BookingPaymentTimeline({ booking }: { booking: BookingDetails }) {
  const op = describeBookingOperationalState({
    row: booking as unknown as Record<string, unknown>,
    viewer: "admin",
  });
  const t = op.adminTimeline;
  const paidAt = booking.payment_completed_at;
  const offPlatform = adminOffPlatformPaidBadgeLabel(booking);
  const paidTitle = offPlatform ?? (paidAt ? "Paid (checkout)" : "Pending payment");
  const payoutPs = String(booking.payout_status ?? "").trim().toLowerCase();
  const payoutLabel =
    payoutPs === "paid" ? "Paid out to cleaner" : payoutPs === "eligible" ? "Eligible for payout" : payoutPs ? payoutPs : "—";

  const assignedDone = t.assignedDone;
  const assignedDetail = (() => {
    if (Boolean(String(booking.cleaner_id ?? "").trim())) {
      return formatShortTs(booking.assigned_at ?? null);
    }
    if (booking.is_team_job === true && Boolean(String(booking.team_id ?? "").trim())) {
      return booking.assigned_at ? `Team · ${formatShortTs(booking.assigned_at)}` : "Team roster assigned";
    }
    return assignedDone ? formatShortTs(booking.assigned_at ?? null) : "No cleaner yet";
  })();

  const acceptedDone = t.acceptedDone;
  const acceptedDetail = acceptedDone
    ? String(booking.accepted_at ?? "").trim()
      ? formatShortTs(booking.accepted_at)
      : "Acknowledged"
    : "Awaiting cleaner in app";

  const steps: { key: string; label: string; detail: string; done: boolean }[] = [
    { key: "created", label: "Created", detail: formatShortTs(booking.created_at), done: t.createdDone },
    {
      key: "paid",
      label: paidTitle,
      detail: paidAt ? formatShortTs(paidAt) : "Not recorded",
      done: t.paidDone,
    },
    {
      key: "assigned",
      label: "Assigned",
      detail: assignedDetail,
      done: assignedDone,
    },
    {
      key: "accepted",
      label: "Cleaner accepted",
      detail: acceptedDetail,
      done: acceptedDone,
    },
    {
      key: "progress",
      label: "In progress",
      detail: formatShortTs(booking.started_at ?? null),
      done: t.inProgressDone,
    },
    {
      key: "completed",
      label: "Completed",
      detail: formatShortTs(booking.completed_at ?? null),
      done: t.completedDone,
    },
    ...(op.overrideApplied
      ? [
          {
            key: "admin_override",
            label: "Recurring unpaid completion override",
            detail: [
              "Completed by admin override",
              op.overrideRecordedBy ? `· ${op.overrideRecordedBy}` : null,
              op.overrideRecordedAt ? `· ${formatShortTs(op.overrideRecordedAt)}` : null,
            ]
              .filter(Boolean)
              .join(" "),
            done: true,
          },
        ]
      : []),
    { key: "payout", label: "Payout", detail: payoutLabel, done: t.payoutPaid },
  ];

  return (
    <ol className="space-y-3 border-l-2 border-zinc-200 pl-4">
      {steps.map((s) => (
        <li key={s.key} className="relative">
          <span
            className={[
              "absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full ring-2 ring-white",
              s.done ? "bg-emerald-500" : "bg-zinc-300",
            ].join(" ")}
            aria-hidden
          />
          <p className="text-sm font-semibold text-zinc-900">{s.label}</p>
          <p className="text-xs text-zinc-600">{s.detail}</p>
        </li>
      ))}
    </ol>
  );
}

function detailFlags(booking: BookingDetails, userProfile: UserProfile | null) {
  const flags: string[] = [];
  if ((userProfile?.tier ?? "").toLowerCase() === "gold" || (userProfile?.tier ?? "").toLowerCase() === "platinum") {
    flags.push("VIP");
  }
  if (!booking.cleaner_id && !(booking.is_team_job === true && String(booking.team_id ?? "").trim())) {
    flags.push("NO CLEANER");
  }
  if (!booking.customer_email) flags.push("MISSING CUSTOMER EMAIL");
  const total = money(booking);
  if (total <= 0) flags.push("PAYMENT ISSUE");
  return flags;
}

function normalizePhoneForWhatsApp(raw: string): string {
  const digits = raw.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) return digits.slice(1);
  if (digits.startsWith("0")) return `27${digits.slice(1)}`;
  return digits;
}

/** Admin / checkout notes stored on `booking_snapshot` (ops + customer context). */
function formatBookingSnapshotNotes(snap: unknown): string | null {
  const o = snap as {
    locked?: { notes?: string };
    admin_notes?: string;
    customer_notes?: string;
  } | null;
  const admin = typeof o?.admin_notes === "string" ? o.admin_notes.trim() : "";
  const customer = typeof o?.customer_notes === "string" ? o.customer_notes.trim() : "";
  const locked = typeof o?.locked?.notes === "string" ? o.locked.notes.trim() : "";
  const seen = new Set<string>();
  const parts: string[] = [];
  for (const s of [admin, customer, locked]) {
    if (!s || seen.has(s)) continue;
    seen.add(s);
    parts.push(s);
  }
  const merged = parts.join("\n\n").trim();
  return merged || null;
}

function readAdminNotesRawFromSnapshot(snap: unknown): string {
  if (!snap || typeof snap !== "object" || Array.isArray(snap)) return "";
  const o = snap as { admin_notes?: unknown };
  return typeof o.admin_notes === "string" ? o.admin_notes : "";
}

function extrasSlugsFromBookingRows(extras: unknown): string[] {
  if (!Array.isArray(extras)) return [];
  const out: string[] = [];
  for (const item of extras) {
    if (typeof item === "string") {
      const s = item.trim();
      if (s) out.push(s);
      continue;
    }
    if (item && typeof item === "object" && "slug" in item && typeof (item as { slug?: unknown }).slug === "string") {
      const s = (item as { slug: string }).slug.trim();
      if (s) out.push(s);
    }
  }
  return [...new Set(out)];
}

function extrasSlugsFromBookingPayload(
  extras: unknown,
  lockedExtras: unknown,
): string[] {
  const fromRows = extrasSlugsFromBookingRows(extras);
  if (fromRows.length > 0) return fromRows;
  if (Array.isArray(lockedExtras)) {
    return lockedExtras
      .filter((e): e is string => typeof e === "string" && e.trim().length > 0)
      .map((e) => e.trim());
  }
  return [];
}

const BOOKING_EXTRA_CHECKBOX_SLUGS = [...BOOKING_EXTRA_ID_SET].sort((a, b) => a.localeCompare(b));

function positiveRoomCount(v: unknown): number | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  const n = Math.round(v);
  if (n < 1 || n > 50) return null;
  return n;
}

function positiveDurationHours(v: unknown): number | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  const n = v;
  if (n <= 0 || n > 72) return null;
  const rounded = Math.round(n * 100) / 100;
  return rounded;
}

function readLockedFromBookingSnapshot(booking: BookingDetails): Record<string, unknown> | null {
  const snap = booking.booking_snapshot;
  if (!snap || typeof snap !== "object" || Array.isArray(snap)) return null;
  const locked = (snap as { locked?: unknown }).locked;
  if (!locked || typeof locked !== "object" || Array.isArray(locked)) return null;
  return locked as Record<string, unknown>;
}

/** Bedrooms / bathrooms / duration: DB columns first, then checkout lock snapshot (same precedence as edit-details seed). */
function adminServiceHomeSummary(booking: BookingDetails): {
  bedrooms: number | null;
  bathrooms: number | null;
  durationHours: number | null;
  propertyType: string | null;
  extraRooms: number | null;
  cleaningFrequency: string | null;
} {
  const locked = readLockedFromBookingSnapshot(booking);
  const bedrooms =
    positiveRoomCount(booking.rooms) ??
    positiveRoomCount(locked?.bedrooms) ??
    positiveRoomCount(locked?.rooms) ??
    null;
  const bathrooms =
    positiveRoomCount(booking.bathrooms) ?? positiveRoomCount(locked?.bathrooms) ?? null;

  let durationHours: number | null = positiveDurationHours(booking.duration_hours);
  if (durationHours == null) {
    const durationMinutes = (booking as { duration_minutes?: number | null }).duration_minutes;
    if (typeof durationMinutes === "number" && Number.isFinite(durationMinutes) && durationMinutes > 0) {
      durationHours = positiveDurationHours(durationMinutes / 60);
    }
  }
  if (durationHours == null && locked) {
    durationHours =
      positiveDurationHours(locked.finalHours) ?? positiveDurationHours(locked.duration) ?? null;
  }

  const ptRaw = locked?.propertyType;
  const propertyType =
    ptRaw === "apartment" ||
    ptRaw === "house" ||
    ptRaw === "studio" ||
    ptRaw === "office"
      ? String(ptRaw)
      : null;

  let extraRooms: number | null = null;
  const er = locked?.extraRooms;
  if (typeof er === "number" && Number.isFinite(er)) {
    const n = Math.round(er);
    if (n >= 0 && n <= 50) extraRooms = n;
  }

  const freqRaw = locked?.cleaningFrequency;
  const cleaningFrequency =
    freqRaw === "weekly" ||
    freqRaw === "biweekly" ||
    freqRaw === "monthly" ||
    freqRaw === "one_time"
      ? String(freqRaw)
      : null;

  return { bedrooms, bathrooms, durationHours, propertyType, extraRooms, cleaningFrequency };
}

function formatPropertyTypeLabel(pt: string): string {
  return pt.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatCleaningFrequencyLabel(freq: string): string {
  switch (freq) {
    case "weekly":
      return "Weekly";
    case "biweekly":
      return "Every 2 weeks";
    case "monthly":
      return "Monthly";
    case "one_time":
      return "One-time";
    default:
      return formatPropertyTypeLabel(freq);
  }
}

/** Prefer persisted `bookings.extras`; fall back to checkout snapshot locked payload when columns were empty. */
function extrasPayloadForAdminServiceCard(booking: BookingDetails): unknown[] {
  if (Array.isArray(booking.extras) && booking.extras.length > 0) return booking.extras;
  const snap = booking.booking_snapshot;
  if (!snap || typeof snap !== "object" || Array.isArray(snap)) return [];
  const locked = (snap as { locked?: unknown }).locked;
  if (!locked || typeof locked !== "object" || Array.isArray(locked)) return [];
  const l = locked as { extras_line_items?: unknown; extras?: unknown };
  const lineItems = l.extras_line_items;
  if (Array.isArray(lineItems) && lineItems.length > 0) return lineItems;
  const ex = l.extras;
  if (!Array.isArray(ex)) return [];
  const slugs = ex
    .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
    .map((s) => s.trim());
  if (!slugs.length) return [];
  return slugs.map((slug) => ({
    slug,
    name: slug
      .split("-")
      .filter(Boolean)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" "),
    price: 0,
  }));
}

function formatBookingExtraChip(item: unknown): { key: string; label: string } {
  if (typeof item === "string") {
    const s = item.trim();
    return { key: s || "extra", label: s || "Extra" };
  }
  if (item && typeof item === "object") {
    const o = item as Record<string, unknown>;
    const name = typeof o.name === "string" ? o.name.trim() : "";
    const slug = typeof o.slug === "string" ? o.slug.trim() : "";
    const price = typeof o.price === "number" && Number.isFinite(o.price) ? Math.round(o.price) : null;
    const label =
      name && price != null && price > 0
        ? `${name} · R${price.toLocaleString("en-ZA")}`
        : name && price === 0
          ? `${name} · included in visit total`
          : name || slug || "Extra";
    const key = slug || name || JSON.stringify(o);
    return { key, label };
  }
  return { key: "extra", label: "Extra" };
}

type AdminPricingExtraRow = { id: string; name: string; price: number };

/** Persisted `price_breakdown.extrasZar` or legacy nested `job.extrasZar` from Paystack init. */
function readPriceBreakdownExtrasZar(pb: unknown): number | null {
  if (!pb || typeof pb !== "object" || Array.isArray(pb)) return null;
  const o = pb as Record<string, unknown>;
  const job = o.job;
  if (job && typeof job === "object" && !Array.isArray(job)) {
    const ez = (job as { extrasZar?: unknown }).extrasZar;
    if (typeof ez === "number" && Number.isFinite(ez)) return Math.round(ez);
  }
  const top = o.extrasZar;
  if (typeof top === "number" && Number.isFinite(top)) return Math.round(top);
  return null;
}

function pricingExtraRowsFromServicePayload(payload: unknown[]): AdminPricingExtraRow[] {
  const out: AdminPricingExtraRow[] = [];
  for (const item of payload) {
    if (typeof item === "object" && item !== null) {
      const o = item as Record<string, unknown>;
      const slug = typeof o.slug === "string" ? o.slug.trim() : "";
      const name = typeof o.name === "string" ? o.name.trim() : slug || "Extra";
      const price =
        typeof o.price === "number" && Number.isFinite(o.price) ? Math.round(o.price) : 0;
      out.push({ id: slug || name, name, price });
      continue;
    }
    if (typeof item === "string" && item.trim()) {
      const slug = item.trim();
      out.push({ id: slug, name: slug, price: 0 });
    }
  }
  return out;
}

/**
 * Checkout snapshots usually expose one “Add-ons (subtotal)” line; when that total is R0 but the customer still
 * picked tasks, show those rows and explain that no separate add-on fee applied on this quote.
 */
function mergeAdminPricingSnapshotExtras(params: {
  snapExtras: AdminPricingExtraRow[];
  bookingExtrasPayload: unknown[];
  extrasZarFromBreakdown: number | null;
}): { rows: AdminPricingExtraRow[]; showBundledExplanation: boolean } {
  const snap = params.snapExtras;
  const bookingRows = pricingExtraRowsFromServicePayload(params.bookingExtrasPayload);
  const ez = params.extrasZarFromBreakdown;

  if (snap.some((r) => r.price > 0)) {
    return { rows: snap, showBundledExplanation: false };
  }

  const onlyZeroAddonsAggregate =
    snap.length === 1 && snap[0].price === 0 && /add-?on/i.test(String(snap[0].name ?? ""));

  if (bookingRows.length > 0 && (snap.length === 0 || onlyZeroAddonsAggregate)) {
    const showBundledExplanation = ez === 0 || ez == null;
    return { rows: bookingRows, showBundledExplanation };
  }

  if (snap.length > 0) {
    const showBundledExplanation = ez === 0 && snap.every((r) => r.price === 0);
    return { rows: snap, showBundledExplanation };
  }

  return { rows: [], showBundledExplanation: false };
}

function toCleanerAssignOptions(rows: AdminCleanerRow[]): CleanerOption[] {
  return rows.map((c) => ({
    id: c.id,
    full_name: c.full_name,
    status: c.status ?? null,
    is_available: c.is_available,
    rating: c.rating,
    jobs_completed: c.jobs_completed,
  }));
}

export default function BookingDetailsView({
  booking,
  onClose,
  onBookingDeleted,
  basePath = "/admin/bookings",
  initialAction,
}: {
  booking: BookingSeed;
  onClose?: () => void;
  onBookingDeleted?: (id: string) => void;
  basePath?: "/admin/bookings" | "/office/bookings";
  /** When set to `assign` or `assign-team`, opens the team picker once after load (deep/move only). */
  initialAction?: string | null;
}) {
  const router = useRouter();
  const bookingId = booking.id;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fullBooking, setFullBooking] = useState<BookingDetails | null>(null);
  const [earningsDisplay, setEarningsDisplay] = useState<AdminEarningsDisplay | null>(null);
  const [cleaner, setCleaner] = useState<Cleaner | null>(null);
  /** From GET `selected_cleaner` — customer pick when not same row as assigned `cleaner`. */
  const [selectedCleaner, setSelectedCleaner] = useState<Cleaner | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [customerContactPhone, setCustomerContactPhone] = useState<string | null>(null);
  const [customerContactName, setCustomerContactName] = useState<string | null>(null);
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [cleanerOptions, setCleanerOptions] = useState<AdminCleanerRow[]>([]);
  const [statusBusy, setStatusBusy] = useState<"completed" | "cancelled" | null>(null);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const setToast = useCallback((next: ToastState) => {
    if (next) showToast(next.text, next.kind);
  }, []);
  const [editingSchedule, setEditingSchedule] = useState(false);
  const [draftDate, setDraftDate] = useState("");
  const [draftTime, setDraftTime] = useState("");
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [editingCleanerInline, setEditingCleanerInline] = useState(false);
  const [dispatchOffers, setDispatchOffers] = useState<DispatchOfferAdminRow[]>([]);
  const [dispatchOfferUxFilter, setDispatchOfferUxFilter] = useState<DispatchOfferUxFilter>("all");
  /** Fleet-wide experiment leader from `/api/admin/analytics` (highlights the UX filter row). */
  const [fleetBestUxVariant, setFleetBestUxVariant] = useState<CleanerUxVariant | "unknown" | null>(null);
  const [notificationLogs, setNotificationLogs] = useState<BookingNotificationLogRow[]>([]);
  const [notificationLogsLoading, setNotificationLogsLoading] = useState(false);
  const [notificationLogRefresh, setNotificationLogRefresh] = useState(0);
  const [resendConfirmationBusy, setResendConfirmationBusy] = useState(false);
  const [sendReviewRequestBusy, setSendReviewRequestBusy] = useState(false);
  const [retryingNotificationLogId, setRetryingNotificationLogId] = useState<string | null>(null);
  const [cleanerIssueReports, setCleanerIssueReports] = useState<CleanerIssueReportRow[]>([]);
  const [serviceQa, setServiceQa] = useState<ServiceQaAdminWire | null>(null);
  const [supportsTeamAssignment, setSupportsTeamAssignment] = useState(false);
  const [teamSummary, setTeamSummary] = useState<TeamSummary | null>(null);
  const [teamModalOpen, setTeamModalOpen] = useState(false);
  const [teamCandidates, setTeamCandidates] = useState<TeamAssignCandidate[]>([]);
  const [teamAssignQualifiedLabel, setTeamAssignQualifiedLabel] = useState("");
  const [teamPickId, setTeamPickId] = useState<string | null>(null);
  const [assigningTeam, setAssigningTeam] = useState(false);
  const [teamModalLoading, setTeamModalLoading] = useState(false);
  const [teamModalError, setTeamModalError] = useState<string | null>(null);
  const [bookingCleaners, setBookingCleaners] = useState<BookingCleanerRow[]>([]);
  const [emergencyRosterOpen, setEmergencyRosterOpen] = useState(false);
  const [repairRosterBusy, setRepairRosterBusy] = useState(false);
  const [detailRefresh, setDetailRefresh] = useState(0);
  const initialAssignActionHandled = useRef(false);
  const [resetDispatchBusy, setResetDispatchBusy] = useState(false);
  const [fixEarningsBusy, setFixEarningsBusy] = useState(false);
  const [resetEarningsBusy, setResetEarningsBusy] = useState(false);
  const [resetEarningsModalOpen, setResetEarningsModalOpen] = useState(false);
  const [markPaidModalOpen, setMarkPaidModalOpen] = useState(false);
  const [markPaidMethod, setMarkPaidMethod] = useState<"cash" | "zoho" | "eft">("cash");
  const [markPaidReference, setMarkPaidReference] = useState("");
  const [markPaidAmountZar, setMarkPaidAmountZar] = useState("");
  const [markPaidSettlementMode, setMarkPaidSettlementMode] = useState<"full" | "deposit">("full");
  const [markPaidDepositReason, setMarkPaidDepositReason] = useState("");
  const [markPaidBusy, setMarkPaidBusy] = useState(false);
  const [adminActionWarnings, setAdminActionWarnings] = useState<AdminWarning[]>([]);
  const [retryChargeBusy, setRetryChargeBusy] = useState(false);
  const [editDetailsModalOpen, setEditDetailsModalOpen] = useState(false);
  const [editDetailsBusy, setEditDetailsBusy] = useState(false);
  const [editBedrooms, setEditBedrooms] = useState(2);
  const [editBathrooms, setEditBathrooms] = useState(1);
  const [editExtrasSlugs, setEditExtrasSlugs] = useState<string[]>([]);
  const [editAdminNotes, setEditAdminNotes] = useState("");
  type EditDetailsSeed = { bedrooms: number; bathrooms: number; extras: string[]; notes: string };
  const editDetailsSeedRef = useRef<EditDetailsSeed>({ bedrooms: 2, bathrooms: 1, extras: [], notes: "" });
  type EditPricePreview = {
    old_total_cents: number;
    new_total_cents: number;
    delta_cents: number;
    requires_collect_confirm: boolean;
    paid: boolean;
  };
  const [editPricePreview, setEditPricePreview] = useState<EditPricePreview | null>(null);
  const [editPricePreviewLoading, setEditPricePreviewLoading] = useState(false);
  const [editPricePreviewRetry, setEditPricePreviewRetry] = useState(0);
  const [editPricePreviewHttpError, setEditPricePreviewHttpError] = useState<string | null>(null);
  const [editConflictResyncNonce, setEditConflictResyncNonce] = useState(0);
  const [confirmCollectAdditional, setConfirmCollectAdditional] = useState(false);
  const [editIdempotencyKey, setEditIdempotencyKey] = useState("");
  /** From GET /api/admin/bookings/[id] — used to disable reset before hitting the API. */
  const [ledgerCleanerEarnings, setLedgerCleanerEarnings] = useState<Array<{ id: string; status: string | null }>>([]);
  const [earningsPreview, setEarningsPreview] = useState<EarningsPreviewResponse | null>(null);
  const [earningsPreviewLoading, setEarningsPreviewLoading] = useState(false);
  const [issueResolveBusyId, setIssueResolveBusyId] = useState<string | null>(null);
  const [issueReportNowMs, setIssueReportNowMs] = useState(() => Date.now());
  const [detailDashboardLifecycle, setDetailDashboardLifecycle] = useState<DashboardLifecycleAlignmentWire | null>(null);

  const detailRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const detailLoadAbortRef = useRef<AbortController | null>(null);
  const bumpDetailRefreshDebounced = useCallback(() => {
    if (detailRefreshTimerRef.current != null) clearTimeout(detailRefreshTimerRef.current);
    detailRefreshTimerRef.current = setTimeout(() => {
      detailRefreshTimerRef.current = null;
      setDetailRefresh((n) => n + 1);
    }, 1200);
  }, []);

  const adminOperational = useMemo(() => {
    if (!fullBooking) return null;
    return describeBookingOperationalState({
      row: fullBooking as unknown as Record<string, unknown>,
      viewer: "admin",
    });
  }, [fullBooking]);

  const showAdminMarkComplete = adminOperational?.lifecycleCapabilities.complete === true;
  const opPhase = adminOperational?.operationalPhase;
  const showSendReviewRequest = opPhase === "completed" && Boolean(fullBooking?.customer_email?.trim());
  const showAdminMarkCancel =
    adminOperational != null &&
    opPhase !== "completed" &&
    opPhase !== "cancelled" &&
    opPhase !== "failed";

  const needsDispatchManualAttention = useMemo(() => {
    if (!fullBooking) return false;
    return adminDispatchNeedsAttentionFromLifecycle(detailDashboardLifecycle, {
      status: fullBooking.status ?? null,
      dispatch_status: normalizeAdminBookingDispatchStatus(fullBooking.dispatch_status),
      cleaner_id: fullBooking.cleaner_id ?? null,
      is_team_job: fullBooking.is_team_job ?? null,
      team_id: fullBooking.team_id ?? null,
    });
  }, [fullBooking, detailDashboardLifecycle]);

  const dispatchLifecycleCaptionDetail = useMemo(() => {
    if (!fullBooking) return "";
    return adminLifecycleDispatchCaption({
      ...(fullBooking as unknown as AdminBookingsListRow),
      dashboardLifecycle: detailDashboardLifecycle ?? undefined,
    });
  }, [fullBooking, detailDashboardLifecycle]);

  const dispatchLifecycleRawDetail = useMemo(() => {
    if (!fullBooking) return "";
    return adminLifecycleRawDiagnosticLine({
      ...(fullBooking as unknown as AdminBookingsListRow),
      dashboardLifecycle: detailDashboardLifecycle ?? undefined,
    });
  }, [fullBooking, detailDashboardLifecycle]);

  const preferredDispatchStatusLabel = useMemo(() => {
    if (!fullBooking?.preferred_dispatch_status) return null;
    const pendingPreferred = dispatchOffers.find(
      (o) => o.status === "pending" && String(o.offer_type ?? "").toLowerCase() === "preferred",
    );
    return preferredDispatchStatusAdminLabel(fullBooking.preferred_dispatch_status, {
      pendingDeadlineIso: pendingPreferred?.expires_at ?? null,
    });
  }, [fullBooking?.preferred_dispatch_status, dispatchOffers]);

  useEffect(() => {
    if (cleanerIssueReports.length === 0) return;
    const id = window.setInterval(() => setIssueReportNowMs(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, [cleanerIssueReports.length]);

  useEffect(() => {
    const ac = new AbortController();
    detailLoadAbortRef.current?.abort();
    detailLoadAbortRef.current = ac;

    async function loadDetails() {
      if (!bookingId) {
        setError("Missing booking ID.");
        setLoading(false);
        return;
      }
      setLoading(true);
      setDetailDashboardLifecycle(null);
      setServiceQa(null);
      setFleetBestUxVariant(null);
      setLedgerCleanerEarnings([]);
      setSelectedCleaner(null);
      setCustomerContactPhone(null);
      setCustomerContactName(null);
      try {
        let token: string | undefined;
        try {
          token = (await getAdminToken()) ?? undefined;
        } catch {
          if (ac.signal.aborted) return;
          setError("Could not read admin session. Check your connection and try again.");
          return;
        }
        if (!token) {
          if (ac.signal.aborted) return;
          setError("Please sign in as an admin.");
          return;
        }

        const res = await fetch(`/api/admin/bookings/${encodeURIComponent(bookingId)}`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: ac.signal,
        });

        void fetch("/api/admin/analytics", { headers: { Authorization: `Bearer ${token}` }, signal: ac.signal })
          .then(async (anRes) => {
            if (ac.signal.aborted) return;
            const anJson = (await anRes.json().catch(() => ({}))) as { experimentBestUxVariant?: string | null };
            if (!anRes.ok) {
              setFleetBestUxVariant(null);
              return;
            }
            const raw = anJson.experimentBestUxVariant;
            if (raw === "unknown") setFleetBestUxVariant("unknown");
            else if (typeof raw === "string" && (CLEANER_UX_VARIANTS as readonly string[]).includes(raw)) {
              setFleetBestUxVariant(raw as CleanerUxVariant);
            } else {
              setFleetBestUxVariant(null);
            }
          })
          .catch(() => {
            if (!ac.signal.aborted) setFleetBestUxVariant(null);
          });

        const json = (await res.json()) as {
            booking?: BookingDetails;
            dashboardLifecycle?: DashboardLifecycleAlignmentWire | null;
            cleaner?: Cleaner | null;
            selected_cleaner?: Cleaner | null;
            userProfile?: UserProfile | null;
            dispatch_offers?: DispatchOfferAdminRow[];
            cleaner_issue_reports?: CleanerIssueReportRow[];
            cleaner_earnings?: Array<{ id: string; status?: string | null }>;
            supports_team_assignment?: boolean;
            team_summary?: TeamSummary | null;
            service_qa?: ServiceQaAdminWire;
            customer_contact_phone?: string | null;
            customer_contact_name?: string | null;
            earnings_display?: AdminEarningsDisplay | null;
            error?: string;
          };

        if (ac.signal.aborted) return;

        if (!res.ok) {
          setError(json.error ?? "Could not load booking.");
          return;
        }
        setFullBooking(json.booking ?? null);
        setEarningsDisplay(
          json.earnings_display && typeof json.earnings_display === "object"
            ? (json.earnings_display as AdminEarningsDisplay)
            : null,
        );
        setDetailDashboardLifecycle(
          json.dashboardLifecycle && typeof json.dashboardLifecycle === "object"
            ? json.dashboardLifecycle
            : null,
        );
        const ce = Array.isArray(json.cleaner_earnings)
          ? json.cleaner_earnings.map((r) => ({
              id: String((r as { id?: string }).id ?? ""),
              status: (r as { status?: string | null }).status ?? null,
            }))
          : [];
        setLedgerCleanerEarnings(ce.filter((r) => r.id));
        setCleaner(json.cleaner ?? null);
        setSelectedCleaner(json.selected_cleaner ?? null);
        setUserProfile(json.userProfile ?? null);
        setCustomerContactPhone(
          typeof json.customer_contact_phone === "string" && json.customer_contact_phone.trim()
            ? json.customer_contact_phone.trim()
            : null,
        );
        setCustomerContactName(
          typeof json.customer_contact_name === "string" && json.customer_contact_name.trim()
            ? json.customer_contact_name.trim()
            : null,
        );
        setDispatchOffers(Array.isArray(json.dispatch_offers) ? json.dispatch_offers : []);
        setCleanerIssueReports(Array.isArray(json.cleaner_issue_reports) ? json.cleaner_issue_reports : []);
        setIssueReportNowMs(Date.now());
        const rawQa = json.service_qa;
        if (
          rawQa &&
          typeof rawQa === "object" &&
          !Array.isArray(rawQa) &&
          Array.isArray((rawQa as ServiceQaAdminWire).sections)
        ) {
          setServiceQa(rawQa as ServiceQaAdminWire);
        } else {
          setServiceQa(null);
        }
        setSupportsTeamAssignment(json.supports_team_assignment === true);
        setTeamSummary(json.team_summary ?? null);
        let roster: BookingCleanerRow[] = [];
        try {
          const cr = await fetch(`/api/admin/bookings/${encodeURIComponent(bookingId)}/cleaners`, {
            headers: { Authorization: `Bearer ${token}` },
            signal: ac.signal,
          });
          const cj = (await cr.json()) as { booking_cleaners?: BookingCleanerRow[] };
          if (cr.ok && Array.isArray(cj.booking_cleaners)) roster = cj.booking_cleaners;
        } catch {
          roster = [];
        }
        if (ac.signal.aborted) return;
        setBookingCleaners(roster);
        setDraftDate(json.booking?.date ?? "");
        setDraftTime((json.booking?.time ?? "").slice(0, 5));
        setError(null);
      } catch (e) {
        if (ac.signal.aborted) return;
        setError(
          e instanceof TypeError && e.message === "Failed to fetch"
            ? "Network error — check the dev server is running."
            : e instanceof Error
              ? e.message
              : "Could not load booking.",
        );
      } finally {
        if (!ac.signal.aborted) setLoading(false);
      }
    }
    void loadDetails();
    return () => {
      ac.abort();
      if (detailLoadAbortRef.current === ac) detailLoadAbortRef.current = null;
    };
  }, [bookingId, detailRefresh]);

  useEffect(() => {
    if (!bookingId) return;
    const sb = getSupabaseBrowser();
    if (!sb) return;
    const channel = sb
      .channel(`admin-booking-detail-${bookingId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "bookings", filter: `id=eq.${bookingId}` },
        () => bumpDetailRefreshDebounced(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "booking_cleaners", filter: `booking_id=eq.${bookingId}` },
        () => bumpDetailRefreshDebounced(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "dispatch_offers", filter: `booking_id=eq.${bookingId}` },
        () => bumpDetailRefreshDebounced(),
      )
      .subscribe();
    return () => {
      if (detailRefreshTimerRef.current != null) {
        clearTimeout(detailRefreshTimerRef.current);
        detailRefreshTimerRef.current = null;
      }
      void sb.removeChannel(channel);
    };
  }, [bookingId, bumpDetailRefreshDebounced]);

  useEffect(() => {
    if (!resetEarningsModalOpen || !bookingId) {
      if (!resetEarningsModalOpen) {
        queueMicrotask(() => {
          setEarningsPreview(null);
          setEarningsPreviewLoading(false);
        });
      }
      return;
    }
    let cancelled = false;
    void (async () => {
      setEarningsPreviewLoading(true);
      setEarningsPreview(null);
      try {
        const token = (await getAdminToken()) ?? undefined;
        if (!token) {
          if (!cancelled) setEarningsPreviewLoading(false);
          return;
        }
        const res = await fetch(`/api/admin/bookings/${encodeURIComponent(bookingId)}/earnings-preview`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const raw = await res.text();
        let parsed: EarningsPreviewResponse | null = null;
        if (raw) {
          try {
            parsed = JSON.parse(raw) as EarningsPreviewResponse;
          } catch {
            parsed = null;
          }
        }
        if (!cancelled) setEarningsPreview(parsed);
      } finally {
        if (!cancelled) setEarningsPreviewLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [resetEarningsModalOpen, bookingId]);

  useEffect(() => {
    if (!bookingId || !fullBooking) return;
    let cancelled = false;
    void (async () => {
      setNotificationLogsLoading(true);
      try {
        let token: string | undefined;
        try {
          token = (await getAdminToken()) ?? undefined;
        } catch {
          if (!cancelled) setNotificationLogs([]);
          return;
        }
        if (!token) {
          return;
        }
        const qs = new URLSearchParams({
          booking_id: bookingId,
          limit: "40",
          offset: "0",
        });
        const res = await fetch(`/api/admin/notification-logs?${qs.toString()}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const j = (await res.json()) as { logs?: BookingNotificationLogRow[]; error?: string };
        if (cancelled) return;
        if (!res.ok) {
          setNotificationLogs([]);
        } else {
          const rows = j.logs ?? [];
          setNotificationLogs([...rows].reverse());
        }
      } catch {
        if (!cancelled) setNotificationLogs([]);
      } finally {
        if (!cancelled) setNotificationLogsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [bookingId, fullBooking, notificationLogRefresh]);

  async function retryFailedNotificationLog(logId: string) {
    if (!bookingId) return;
    setRetryingNotificationLogId(logId);
    try {
      const token = (await getAdminToken()) ?? undefined;
      if (!token) return;
      const res = await fetch("/api/admin/notifications/retry", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ logId }),
      });
      const j = (await res.json()) as { success?: boolean; error?: string };
      if (!res.ok || !j.success) {
        setToast({ kind: "error", text: j.error ?? "Could not retry email." });
        return;
      }
      setToast({ kind: "success", text: "Email sent." });
      setNotificationLogRefresh((n) => n + 1);
    } catch {
      setToast({ kind: "error", text: "Could not retry email." });
    } finally {
      setRetryingNotificationLogId(null);
    }
  }

  async function resendConfirmationEmails() {
    if (!bookingId) return;
    setResendConfirmationBusy(true);
    try {
      const token = (await getAdminToken()) ?? undefined;
      if (!token) return;
      const res = await fetch(
        `/api/admin/bookings/${encodeURIComponent(bookingId)}/resend-confirmation-emails`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ includeCustomer: true, includeAdmin: true }),
        },
      );
      const j = (await res.json()) as {
        ok?: boolean;
        error?: string;
        result?: {
          customer?: { sent?: boolean; error?: string };
          admin?: { sent?: boolean; error?: string };
        };
      };
      if (!res.ok || !j.ok) {
        setToast({ kind: "error", text: j.error ?? "Could not resend confirmation emails." });
        return;
      }
      const parts: string[] = [];
      if (j.result?.customer?.sent) parts.push("customer");
      if (j.result?.admin?.sent) parts.push("admin");
      setToast({
        kind: "success",
        text: parts.length ? `Sent: ${parts.join(" + ")}` : "Resend completed.",
      });
      setNotificationLogRefresh((n) => n + 1);
    } catch {
      setToast({ kind: "error", text: "Could not resend confirmation emails." });
    } finally {
      setResendConfirmationBusy(false);
    }
  }

  async function sendReviewRequestEmail() {
    if (!bookingId) return;
    setSendReviewRequestBusy(true);
    try {
      const token = (await getAdminToken()) ?? undefined;
      if (!token) return;
      const res = await fetch(
        `/api/admin/bookings/${encodeURIComponent(bookingId)}/send-review-request`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        },
      );
      const j = (await res.json()) as { ok?: boolean; error?: string; sent_to?: string };
      if (!res.ok || !j.ok) {
        setToast({ kind: "error", text: j.error ?? "Could not send review request." });
        return;
      }
      setToast({
        kind: "success",
        text: j.sent_to ? `Review request sent to ${j.sent_to}.` : "Review request sent.",
      });
      setNotificationLogRefresh((n) => n + 1);
    } catch {
      setToast({ kind: "error", text: "Could not send review request." });
    } finally {
      setSendReviewRequestBusy(false);
    }
  }

  const flags = useMemo(() => (fullBooking ? detailFlags(fullBooking, userProfile) : []), [fullBooking, userProfile]);

  const snapshotNotesText = useMemo(
    () => (fullBooking ? formatBookingSnapshotNotes(fullBooking.booking_snapshot) : null),
    [fullBooking],
  );

  const filteredDispatchOffers = useMemo(() => {
    if (dispatchOfferUxFilter === "all") return dispatchOffers;
    if (dispatchOfferUxFilter === "unknown") {
      return dispatchOffers.filter((o) => dispatchOfferUxVariantKey(o) === "unknown");
    }
    return dispatchOffers.filter(
      (o) => String(o.ux_variant ?? "").trim().toLowerCase() === dispatchOfferUxFilter,
    );
  }, [dispatchOffers, dispatchOfferUxFilter]);

  const dispatchOfferUxCounts = useMemo(() => {
    const byVariant = Object.fromEntries(CLEANER_UX_VARIANTS.map((v) => [v, 0])) as Record<CleanerUxVariant, number>;
    let unknown = 0;
    for (const o of dispatchOffers) {
      const u = String(o.ux_variant ?? "").trim().toLowerCase();
      if (isKnownDispatchUxVariant(u)) byVariant[u]++;
      else unknown++;
    }
    return { byVariant, unknown, total: dispatchOffers.length };
  }, [dispatchOffers]);
  const startsInText = useMemo(() => {
    if (!fullBooking?.date || !fullBooking.time) return "—";
    const dt = new Date(`${fullBooking.date}T${fullBooking.time.slice(0, 5)}:00+02:00`);
    if (Number.isNaN(dt.getTime())) return "—";
    // eslint-disable-next-line react-hooks/purity -- relative "starts in" copy uses wall clock
    const mins = Math.round((dt.getTime() - Date.now()) / 60000);
    const abs = Math.abs(mins);
    if (mins >= 0) {
      if (mins < 60) return `Starts in ${mins}m`;
      return `Starts in ${Math.floor(mins / 60)}h ${abs % 60}m`;
    }
    if (abs < 60) return `Started ${abs}m ago`;
    return `Started ${Math.floor(abs / 60)}h ${abs % 60}m ago`;
  }, [fullBooking]);

  const resetEarningsClientBlockReason = useMemo(() => {
    if (!fullBooking) return null;
    const ps = String(fullBooking.payout_status ?? "").trim().toLowerCase();
    if (ps === "eligible" || ps === "paid") {
      return "This booking is already eligible or paid on the invoice payout path; reset is not allowed.";
    }
    for (const row of ledgerCleanerEarnings) {
      const st = String(row.status ?? "").trim().toLowerCase();
      if (!st || st === "pending") continue;
      return `Cleaner earnings includes status "${st}"; only pending (or empty) rows allow reset.`;
    }
    return null;
  }, [fullBooking, ledgerCleanerEarnings]);

  const canMarkPaid = useMemo(() => {
    if (!fullBooking || !adminOperational) return false;
    const phase = adminOperational.operationalPhase;
    if (phase === "cancelled" || phase === "failed") return false;
    const p = fullBooking.payment_completed_at;
    if (p != null && String(p).trim() !== "") return false;
    return true;
  }, [fullBooking, adminOperational]);

  const markPaidPreviewZar = useMemo(() => {
    if (!fullBooking) return null;
    const raw = markPaidAmountZar.trim();
    if (raw) {
      const z = Number(raw.replace(",", "."));
      if (Number.isFinite(z) && z > 0) return z;
    }
    if (markPaidSettlementMode === "deposit") return null;
    return money(fullBooking);
  }, [fullBooking, markPaidAmountZar, markPaidSettlementMode]);

  const existingDepositZar = useMemo(() => {
    const c = fullBooking?.deposit_paid_cents;
    if (typeof c !== "number" || !Number.isFinite(c) || c <= 0) return null;
    return c / 100;
  }, [fullBooking?.deposit_paid_cents]);

  const editBookingClientBlockReason = useMemo(() => {
    if (!fullBooking) return null;
    const fin = (fullBooking as { cleaner_line_earnings_finalized_at?: string | null }).cleaner_line_earnings_finalized_at;
    if (fin != null && String(fin).trim() !== "") {
      return "Cannot edit booking after payout is locked.";
    }
    return resetEarningsClientBlockReason;
  }, [fullBooking, resetEarningsClientBlockReason]);

  const openEditDetailsModal = useCallback(() => {
    if (!fullBooking) return;
    const snap = fullBooking.booking_snapshot as {
      locked?: { extras?: unknown; rooms?: unknown; bedrooms?: unknown; bathrooms?: unknown };
    } | null;
    const locked = snap?.locked;
    const br = Math.max(
      1,
      Math.min(
        10,
        Math.round(Number(locked?.bedrooms ?? locked?.rooms ?? fullBooking.rooms ?? 2) || 2),
      ),
    );
    const bt = Math.max(
      1,
      Math.min(10, Math.round(Number(locked?.bathrooms ?? fullBooking.bathrooms ?? 1) || 1)),
    );
    const ex = extrasSlugsFromBookingPayload(fullBooking.extras, locked?.extras).sort((a, b) => a.localeCompare(b));
    const notes = readAdminNotesRawFromSnapshot(fullBooking.booking_snapshot);
    editDetailsSeedRef.current = { bedrooms: br, bathrooms: bt, extras: [...ex], notes };
    setEditBedrooms(br);
    setEditBathrooms(bt);
    setEditExtrasSlugs(ex);
    setEditAdminNotes(notes);
    setEditPricePreview(null);
    setEditPricePreviewLoading(false);
    setEditPricePreviewHttpError(null);
    setConfirmCollectAdditional(false);
    setEditIdempotencyKey(
      typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
    );
    setEditDetailsModalOpen(true);
  }, [fullBooking]);

  useEffect(() => {
    if (editConflictResyncNonce === 0) return;
    if (loading || !fullBooking) return;
    setEditConflictResyncNonce(0);
    openEditDetailsModal();
  }, [editConflictResyncNonce, loading, fullBooking, openEditDetailsModal]);

  const toggleEditExtra = (slug: string) => {
    setEditExtrasSlugs((prev) => {
      if (prev.includes(slug)) return prev.filter((s) => s !== slug);
      return [...prev, slug].sort((a, b) => a.localeCompare(b));
    });
  };

  const editPricingDirty = useMemo(() => {
    if (!editDetailsModalOpen || !fullBooking) return false;
    if (adminOperational?.operationalPhase === "active") return false;
    const seed = editDetailsSeedRef.current;
    const exEq = [...editExtrasSlugs].sort().join("|") === [...seed.extras].sort().join("|");
    return editBedrooms !== seed.bedrooms || editBathrooms !== seed.bathrooms || !exEq;
  }, [editDetailsModalOpen, fullBooking, adminOperational?.operationalPhase, editBedrooms, editBathrooms, editExtrasSlugs]);

  const editSaveBlockedByPreview =
    editDetailsModalOpen &&
    editPricingDirty &&
    (editPricePreviewLoading || editPricePreview == null || editPricePreviewHttpError != null);

  useEffect(() => {
    if (!editDetailsModalOpen || !fullBooking?.id) return;
    if (adminOperational?.operationalPhase === "active") {
      setEditPricePreview(null);
      return;
    }
    let cancelled = false;
    const t = window.setTimeout(async () => {
      setEditPricePreviewLoading(true);
      setEditPricePreviewHttpError(null);
      try {
        const token = (await getAdminToken()) ?? undefined;
        if (!token || cancelled) return;
        const res = await fetch(`/api/admin/bookings/${encodeURIComponent(fullBooking.id)}/edit-details/preview`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            bedrooms: editBedrooms,
            bathrooms: editBathrooms,
            extras: editExtrasSlugs,
          }),
        });
        const json = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          error?: string;
          old_total_cents?: number;
          new_total_cents?: number;
          delta_cents?: number;
          requires_collect_confirm?: boolean;
          paid?: boolean;
        };
        if (cancelled || !res.ok || !json.ok) {
          if (!cancelled) {
            setEditPricePreview(null);
            setEditPricePreviewHttpError(
              !res.ok ? `Preview failed (HTTP ${res.status}).` : (json.error ?? "Preview could not run."),
            );
          }
          return;
        }
        if (!cancelled) setEditPricePreviewHttpError(null);
        setEditPricePreview({
          old_total_cents: Number(json.old_total_cents) || 0,
          new_total_cents: Number(json.new_total_cents) || 0,
          delta_cents: Number(json.delta_cents) || 0,
          requires_collect_confirm: Boolean(json.requires_collect_confirm),
          paid: Boolean(json.paid),
        });
      } finally {
        if (!cancelled) setEditPricePreviewLoading(false);
      }
    }, 400);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [
    editDetailsModalOpen,
    fullBooking?.id,
    adminOperational?.operationalPhase,
    editBedrooms,
    editBathrooms,
    editExtrasSlugs,
    editPricePreviewRetry,
  ]);

  const loadTeamsForTeamModal = async () => {
    if (!bookingId) return;
    setTeamModalLoading(true);
    setTeamModalError(null);
    const token = (await getAdminToken()) ?? undefined;
    if (!token) {
      setTeamModalLoading(false);
      const msg = "Please sign in as an admin.";
      setTeamModalError(msg);
      setToast({ kind: "error", text: msg });
      return;
    }
    try {
      const res = await fetch(`/api/admin/bookings/${encodeURIComponent(bookingId)}/assign-team`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const raw = await res.text();
      let j: {
        teams?: TeamAssignCandidate[];
        qualified_for_label?: string;
        error?: string;
        supports_team_assignment?: boolean;
      } = {};
      if (raw.trim()) {
        try {
          j = JSON.parse(raw) as typeof j;
        } catch {
          throw new Error(`Invalid response from server (${res.status}).`);
        }
      }
      if (!res.ok) throw new Error(j.error ?? `Could not load teams (${res.status}).`);
      if (j.supports_team_assignment === false) {
        setTeamAssignQualifiedLabel("");
        setTeamCandidates([]);
        setTeamModalError(
          "Team assignment is not available for this booking from the server. Refresh the page if this surprises you.",
        );
        return;
      }
      setTeamAssignQualifiedLabel(typeof j.qualified_for_label === "string" ? j.qualified_for_label : "");
      setTeamCandidates(Array.isArray(j.teams) ? j.teams : []);
    } catch (e) {
      setTeamModalError(e instanceof Error ? e.message : "Could not load teams.");
    } finally {
      setTeamModalLoading(false);
    }
  };

  const openTeamModal = () => {
    if (!bookingId) {
      setToast({ kind: "error", text: "Missing booking ID." });
      return;
    }
    setTeamModalOpen(true);
    setTeamPickId(null);
    setTeamCandidates([]);
    setTeamAssignQualifiedLabel("");
    setTeamModalError(null);
    void loadTeamsForTeamModal();
  };

  useEffect(() => {
    if (initialAssignActionHandled.current || loading || !fullBooking) return;
    const action = (initialAction ?? "").trim().toLowerCase();
    if (action !== "assign" && action !== "assign-team") return;
    if (!supportsTeamAssignment) return;
    initialAssignActionHandled.current = true;
    openTeamModal();
  }, [loading, fullBooking, supportsTeamAssignment, initialAction]);

  const handleEditDetailsConfirm = async () => {
    if (!fullBooking?.id) return;
    const inFieldwork = adminOperational?.operationalPhase === "active";
    if (!inFieldwork && editSaveBlockedByPreview) {
      setToast({
        kind: "error",
        text: editPricePreviewHttpError
          ? "Fix preview or use Retry preview before saving."
          : "Wait for the price preview to finish before saving.",
      });
      return;
    }
    const seed = editDetailsSeedRef.current;
    const extrasEqual =
      [...editExtrasSlugs].sort().join("\0") === [...seed.extras].sort().join("\0");
    const body: Record<string, unknown> = {
      client_updated_at: String((fullBooking as { updated_at?: string | null }).updated_at ?? "").trim(),
    };
    if (!body.client_updated_at) {
      setToast({ kind: "error", text: "Missing updated_at on booking — refresh the page and try again." });
      return;
    }
    if (inFieldwork) {
      if (editAdminNotes === seed.notes) {
        setToast({ kind: "info", text: "No changes to save." });
        setEditDetailsModalOpen(false);
        return;
      }
      body.notes = editAdminNotes;
    } else {
      if (editBedrooms !== seed.bedrooms) body.bedrooms = editBedrooms;
      if (editBathrooms !== seed.bathrooms) body.bathrooms = editBathrooms;
      if (!extrasEqual) body.extras = editExtrasSlugs;
      if (editAdminNotes !== seed.notes) body.notes = editAdminNotes;
      if (
        editPricePreview?.requires_collect_confirm &&
        !confirmCollectAdditional &&
        (body.bedrooms != null || body.bathrooms != null || body.extras != null)
      ) {
        setToast({
          kind: "error",
          text: `Confirm additional collection (R ${(Math.max(0, editPricePreview.new_total_cents - editPricePreview.old_total_cents) / 100).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}) before saving.`,
        });
        return;
      }
      if (editPricePreview?.requires_collect_confirm && confirmCollectAdditional) {
        body.confirm_collect_additional = true;
      }
    }
    if (Object.keys(body).length <= 1) {
      setToast({ kind: "info", text: "No changes to save." });
      setEditDetailsModalOpen(false);
      return;
    }
    setEditDetailsBusy(true);
    try {
      const token = (await getAdminToken()) ?? undefined;
      if (!token) {
        setToast({ kind: "error", text: "Please sign in as an admin." });
        return;
      }
      const idem = `edit-details:${fullBooking.id}:${editIdempotencyKey}`;
      const res = await fetch(`/api/admin/bookings/${encodeURIComponent(fullBooking.id)}/edit-details`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "Idempotency-Key": idem,
        },
        body: JSON.stringify(body),
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        conflict?: boolean;
        message?: string;
        new_total?: number;
        error?: string;
        collect_additional_cents?: number;
        payment_mismatch?: boolean;
        idempotent?: boolean;
      };
      if (res.status === 409 && json.conflict) {
        setToast({
          kind: "info",
          text: json.message ?? "Booking was updated elsewhere — refreshing this form with the latest values.",
        });
        setEditConflictResyncNonce((n) => n + 1);
        setDetailRefresh((r) => r + 1);
        return;
      }
      if (res.status === 409) {
        setToast({ kind: "info", text: json.error ?? "Already processing. Wait a moment and try again." });
        return;
      }
      if (!res.ok) {
        const extra =
          json.collect_additional_cents != null && Number.isFinite(json.collect_additional_cents)
            ? ` Collect R ${(json.collect_additional_cents / 100).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} more after checking “confirm”.`
            : "";
        setToast({ kind: "error", text: `${json.error ?? "Could not update booking."}${extra}` });
        return;
      }
      const nt = json.new_total;
      const mm = json.payment_mismatch ? " payment_mismatch flagged for ops." : "";
      const idemTxt = json.idempotent ? " (already applied)" : "";
      setToast({
        kind: "success",
        text:
          typeof nt === "number" && Number.isFinite(nt)
            ? `Saved${idemTxt}. Visit total is now R ${(nt / 100).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}.${mm}`
            : `Saved${idemTxt}.${mm}`,
      });
      setEditDetailsModalOpen(false);
      setDetailRefresh((n) => n + 1);
    } finally {
      setEditDetailsBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-dvh bg-zinc-50">
        <main className="mx-auto grid max-w-7xl grid-cols-12 gap-6 px-6 py-6">
          <div className="col-span-12 space-y-6 lg:col-span-8">
            {[1, 2, 3].map((k) => (
              <div key={k} className="animate-pulse rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
                <div className="mb-4 h-5 w-32 rounded bg-zinc-200" />
                <div className="space-y-3">
                  <div className="h-4 w-full rounded bg-zinc-100" />
                  <div className="h-4 w-2/3 rounded bg-zinc-100" />
                  <div className="h-4 w-1/2 rounded bg-zinc-100" />
                </div>
              </div>
            ))}
          </div>
        </main>
      </div>
    );
  }

  if (error || !fullBooking) {
    return (
      <div className="min-h-dvh bg-zinc-50 px-6 py-12">
        <div className="mx-auto max-w-xl rounded-2xl border border-zinc-200 bg-white p-8 text-center shadow-sm">
          <p className="text-lg font-semibold text-zinc-900">Booking not found</p>
          <p className="mt-2 text-sm text-zinc-500">{error ?? "The booking may have been removed or you do not have access."}</p>
          {onClose ? (
            <button type="button" onClick={onClose} className="mt-4 text-sm font-medium text-emerald-700">
              Close
            </button>
          ) : (
            <Link href={basePath} className="mt-4 inline-block text-sm font-medium text-emerald-700">
              Back to bookings
            </Link>
          )}
        </div>
      </div>
    );
  }

  const total = money(fullBooking);
  const adminServiceHome = adminServiceHomeSummary(fullBooking);
  const showAdminSoloCleanerDetailCard = adminBookingShowsSoloCleanerDetailCard(fullBooking);
  const serviceExtrasForAdmin = extrasPayloadForAdminServiceCard(fullBooking);
  const { basePrice, extrasPrice } = adminBookingVisitPricingSplit(fullBooking);
  const cleanerPayoutCard = computeAdminBookingCleanerPayoutDisplay(fullBooking);
  const cleanerPayoutZar = earningsDisplay
    ? earningsDisplay.per_cleaner.length === 1
      ? earningsDisplay.per_cleaner[0]!.base_earning_zar
      : earningsDisplay.total_cleaner_earnings_zar - earningsDisplay.bonus_total_zar
    : cleanerPayoutCard.payoutZar;
  const cleanerBonusZar = earningsDisplay?.bonus_total_zar ?? cleanerPayoutCard.bonusZar;
  const cleanerTotalZar = earningsDisplay?.total_cleaner_earnings_zar ?? (cleanerPayoutZar == null ? null : cleanerPayoutZar + cleanerBonusZar);
  const companyRevenueZar =
    earningsDisplay?.company_revenue_zar ??
    (cleanerPayoutCard.projected === true && cleanerPayoutCard.projectedCompanyZar != null
      ? cleanerPayoutCard.projectedCompanyZar
      : centsToZar(fullBooking.company_revenue_cents));
  const v2PricingLines = adminLinesFromPricingSummary(fullBooking.pricing_summary);
  const isAssigned = !!fullBooking.cleaner_id;
  const jobRosterLocked =
    (fullBooking.cleaner_line_earnings_finalized_at ?? "").toString().trim().length > 0;
  const assignmentSummaryLine = assignmentSourceLabel({
    cleaner_id: fullBooking.cleaner_id ?? null,
    status: fullBooking.status ?? null,
    assignment_type: fullBooking.assignment_type ?? null,
    fallback_reason: fullBooking.fallback_reason ?? null,
  });
  const selectedCleanerIdRaw = String(fullBooking.selected_cleaner_id ?? "").trim();
  const hasSelectedCleanerUuid = /^[0-9a-f-]{36}$/i.test(selectedCleanerIdRaw);
  const dispatchAttemptCleanerId = adminBookingDispatchAttemptId(fullBooking);

  const markIssueReportResolved = async (reportId: string) => {
    if (!bookingId) return;
    setIssueResolveBusyId(reportId);
    try {
      const token = (await getAdminToken()) ?? undefined;
      if (!token) {
        setToast({ kind: "error", text: "Please sign in as an admin." });
        return;
      }
      const res = await fetch(
        `/api/admin/bookings/${encodeURIComponent(bookingId)}/issue-reports/${encodeURIComponent(reportId)}`,
        {
          method: "PATCH",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ resolved: true }),
        },
      );
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok) {
        setToast({ kind: "error", text: j.error ?? "Could not mark resolved." });
        return;
      }
      setToast({ kind: "success", text: "Marked resolved." });
      setDetailRefresh((n) => n + 1);
    } finally {
      setIssueResolveBusyId(null);
    }
  };

  const handleResetDispatchRetry = async () => {
    if (!fullBooking?.id) return;
    setResetDispatchBusy(true);
    try {
      const token = (await getAdminToken()) ?? undefined;
      if (!token) {
        setToast({ kind: "error", text: "Please sign in as an admin." });
        return;
      }
      const res = await fetch(`/api/admin/bookings/${encodeURIComponent(fullBooking.id)}/retry-dispatch`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        message?: string | null;
      };
      if (!res.ok) {
        setToast({ kind: "error", text: json.error ?? "Could not reset dispatch." });
        return;
      }
      if (json.ok) {
        setToast({ kind: "success", text: "Dispatch reset; auto-assign ran." });
      } else {
        setToast({ kind: "info", text: json.message ?? json.error ?? "Dispatch reset; check offers." });
      }
      setDetailRefresh((n) => n + 1);
    } finally {
      setResetDispatchBusy(false);
    }
  };

  const handleRetryRecurringCharge = async () => {
    if (!fullBooking?.id) return;
    setRetryChargeBusy(true);
    try {
      const token = (await getAdminToken()) ?? undefined;
      if (!token) {
        setToast({ kind: "error", text: "Please sign in as an admin." });
        return;
      }
      const res = await fetch(`/api/admin/bookings/${encodeURIComponent(fullBooking.id)}/retry-charge`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok) {
        setToast({ kind: "error", text: json.error ?? "Could not queue retry charge." });
        return;
      }
      setToast({ kind: "success", text: "Charge retry queued for the next cron run." });
      setDetailRefresh((n) => n + 1);
    } finally {
      setRetryChargeBusy(false);
    }
  };

  const handleFixEarnings = async () => {
    if (!fullBooking?.id) return;
    setFixEarningsBusy(true);
    try {
      const token = (await getAdminToken()) ?? undefined;
      if (!token) {
        setToast({ kind: "error", text: "Please sign in as an admin." });
        return;
      }
      const res = await fetch(`/api/admin/bookings/${encodeURIComponent(fullBooking.id)}/fix-earnings`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const raw = await res.text();
      let json: Record<string, unknown> = {};
      if (raw) {
        try {
          json = JSON.parse(raw) as Record<string, unknown>;
        } catch {
          setToast({
            kind: "error",
            text: raw.length > 280 ? `${raw.slice(0, 280)}…` : raw || `Request failed (${res.status}).`,
          });
          return;
        }
      }
      const err = typeof json.error === "string" ? json.error : null;
      const code = typeof json.code === "string" ? json.code : null;
      if (!res.ok) {
        const parts = [err, code ? `(${code})` : null].filter(Boolean);
        setToast({ kind: "error", text: parts.join(" ").trim() || `Request failed (${res.status}).` });
        return;
      }
      if (json.skipped === true) {
        setToast({
          kind: "info",
          text: `No changes applied (${typeof json.reason === "string" ? json.reason : "skipped"}).`,
        });
      } else {
        setToast({ kind: "success", text: "Earnings updated." });
      }
      setDetailRefresh((n) => n + 1);
    } finally {
      setFixEarningsBusy(false);
    }
  };

  const handleMarkPaidConfirm = async () => {
    if (!fullBooking?.id) return;
    setMarkPaidBusy(true);
    try {
      const token = (await getAdminToken()) ?? undefined;
      if (!token) {
        setToast({ kind: "error", text: "Please sign in as an admin." });
        return;
      }
      const body: {
        method: "cash" | "zoho" | "eft";
        reference?: string;
        amount_cents?: number;
        settlement_mode?: "full" | "deposit";
        deposit_cents?: number;
        reason?: string;
      } = { method: markPaidMethod };

      if (markPaidSettlementMode === "deposit") {
        const reason = markPaidDepositReason.trim();
        if (reason.length < 2) {
          setToast({ kind: "error", text: "Enter a reason for the deposit (at least 2 characters)." });
          return;
        }
        const zarRaw = markPaidAmountZar.trim();
        if (!zarRaw) {
          setToast({ kind: "error", text: "Enter the deposit amount in ZAR." });
          return;
        }
        const z = Number(zarRaw.replace(",", "."));
        if (!Number.isFinite(z) || z <= 0) {
          setToast({ kind: "error", text: "Enter a valid deposit amount in ZAR." });
          return;
        }
        body.settlement_mode = "deposit";
        body.deposit_cents = Math.round(z * 100);
        body.reason = reason;
        if ((markPaidMethod === "zoho" || markPaidMethod === "eft") && markPaidReference.trim()) {
          body.reference = markPaidReference.trim();
        }
      } else {
        if ((markPaidMethod === "zoho" || markPaidMethod === "eft") && markPaidReference.trim()) {
          body.reference = markPaidReference.trim();
        }
        const zarRaw = markPaidAmountZar.trim();
        if (zarRaw) {
          const z = Number(zarRaw.replace(",", "."));
          if (!Number.isFinite(z) || z <= 0) {
            setToast({ kind: "error", text: "Enter a valid amount in ZAR." });
            return;
          }
          body.amount_cents = Math.round(z * 100);
        }
      }

      const res = await fetch(`/api/admin/bookings/${encodeURIComponent(fullBooking.id)}/mark-paid`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        skipped?: boolean;
        reason?: string;
        error?: string;
        warnings?: AdminWarning[];
        deposit_recorded?: boolean;
        deposit_paid_cents?: number;
        settlement?: {
          amount_cents: number;
          total_paid_zar: number;
          method: string;
          payment_reference_external: string | null;
          paystack_reference: string;
        };
      };
      if (!res.ok) {
        setAdminActionWarnings(Array.isArray(json.warnings) ? json.warnings : []);
        setToast({
          kind: "error",
          text: json.error ?? (markPaidSettlementMode === "deposit" ? "Could not record deposit." : "Could not mark as paid."),
        });
        return;
      }
      if (json.deposit_recorded === true && typeof json.deposit_paid_cents === "number") {
        setAdminActionWarnings([]);
        setFullBooking({
          ...fullBooking,
          deposit_paid_cents: json.deposit_paid_cents,
        });
        setToast({ kind: "success", text: "Deposit recorded." });
        setMarkPaidModalOpen(false);
        setMarkPaidReference("");
        setMarkPaidAmountZar("");
        setMarkPaidDepositReason("");
        setMarkPaidSettlementMode("full");
        setDetailRefresh((n) => n + 1);
        return;
      }
      if (json.skipped && json.reason === "already_paid") {
        setAdminActionWarnings([]);
        setToast({ kind: "info", text: "Already recorded as paid." });
        setMarkPaidModalOpen(false);
        setDetailRefresh((n) => n + 1);
        return;
      }
      const settlement = json.settlement;
      if (settlement && fullBooking) {
        const nowIso = new Date().toISOString();
        setFullBooking({
          ...fullBooking,
          payment_completed_at: nowIso,
          payment_status: "success",
          payment_method: settlement.method,
          payment_reference_external: settlement.payment_reference_external,
          paystack_reference: settlement.paystack_reference,
          amount_paid_cents: settlement.amount_cents,
          total_paid_cents: settlement.amount_cents,
          total_paid_zar: settlement.total_paid_zar,
        });
      }
      setToast({ kind: "success", text: "Marked as paid." });
      setAdminActionWarnings([]);
      setMarkPaidModalOpen(false);
      setMarkPaidReference("");
      setMarkPaidAmountZar("");
      setMarkPaidDepositReason("");
      setMarkPaidSettlementMode("full");
      setDetailRefresh((n) => n + 1);
    } finally {
      setMarkPaidBusy(false);
    }
  };

  const handleConfirmResetEarnings = async () => {
    if (!fullBooking?.id) return;
    setResetEarningsBusy(true);
    try {
      const token = (await getAdminToken()) ?? undefined;
      if (!token) {
        setToast({ kind: "error", text: "Please sign in as an admin." });
        return;
      }
      const res = await fetch(`/api/admin/bookings/${encodeURIComponent(fullBooking.id)}/reset-earnings`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const raw = await res.text();
      let json: Record<string, unknown> = {};
      if (raw) {
        try {
          json = JSON.parse(raw) as Record<string, unknown>;
        } catch {
          setToast({
            kind: "error",
            text: raw.length > 280 ? `${raw.slice(0, 280)}…` : raw || `Request failed (${res.status}).`,
          });
          return;
        }
      }
      const err = typeof json.error === "string" ? json.error : null;
      const code = typeof json.code === "string" ? json.code : null;
      const warn = typeof json.warning === "string" ? json.warning : null;
      if (!res.ok) {
        const parts = [err, code ? `(${code})` : null, warn].filter(Boolean);
        setToast({ kind: "error", text: parts.join(" ").trim() || `Request failed (${res.status}).` });
        return;
      }
      setResetEarningsModalOpen(false);
      if (warn) {
        setToast({ kind: "error", text: [warn, err].filter(Boolean).join(" — ") });
      } else if (json.recomputed === true) {
        setToast({ kind: "success", text: "Earnings reset and recalculated." });
      } else if (json.recomputed === false) {
        setToast({
          kind: "info",
          text: `Reset ran; persist skipped (${typeof json.reason === "string" ? json.reason : "unknown"}).`,
        });
      } else if (json.skipped === true) {
        setToast({
          kind: "info",
          text: `Reset ran; persist skipped (${typeof json.reason === "string" ? json.reason : "unknown"}).`,
        });
      } else {
        setToast({ kind: "success", text: "Earnings reset and recalculated." });
      }
      setDetailRefresh((n) => n + 1);
    } finally {
      setResetEarningsBusy(false);
    }
  };
  const startsInIsPast = startsInText.startsWith("Started");
  const startsInClass = startsInIsPast ? "text-rose-700" : "text-emerald-700";

  const setStatusOptimistic = async (status: "assigned" | "completed" | "cancelled") => {
    const prev = fullBooking.status;
    if (status === "completed" || status === "cancelled") setStatusBusy(status);
    setFullBooking((p) => (p ? { ...p, status } : p));
    try {
      await updateBookingStatus(fullBooking.id, status);
      setAdminActionWarnings([]);
      setToast({
        kind: "success",
        text: status === "completed" ? "Booking completed" : status === "cancelled" ? "Booking cancelled" : "Booking updated",
      });
    } catch (e) {
      setFullBooking((p) => (p ? { ...p, status: prev } : p));
      if (e instanceof AdminDashboardActionError) setAdminActionWarnings(e.warnings);
      setToast({ kind: "error", text: e instanceof Error ? e.message : "Something went wrong" });
    } finally {
      setStatusBusy(null);
    }
  };

  const handleDeleteBooking = async () => {
    if (!fullBooking?.id) return;
    const ok = await confirm({
      title: "Permanently delete this booking?",
      description:
        "This cannot be undone. Financially sensitive bookings are blocked, including paid, completed, monthly invoice-backed, payout-linked, payout-eligible, payout-frozen, or earnings-bearing rows.",
      variant: "destructive",
      confirmLabel: "Delete permanently",
    });
    if (!ok) return;
    try {
      await deleteBookingAdmin(fullBooking.id);
      setAdminActionWarnings([]);
      setToast({ kind: "success", text: "Booking deleted." });
      onBookingDeleted?.(fullBooking.id);
      onClose?.();
    } catch (e) {
      if (e instanceof AdminDashboardActionError) setAdminActionWarnings(e.warnings);
      setToast({ kind: "error", text: e instanceof Error ? e.message : "Could not delete booking." });
    }
  };

  const openAssignModal = async () => {
    setAssignModalOpen(true);
    try {
      const list = await fetchCleaners();
      setCleanerOptions(list);
    } catch (e) {
      setToast({ kind: "error", text: e instanceof Error ? e.message : "Something went wrong" });
    }
  };

  const openCleanerPickerInline = async () => {
    setEditingCleanerInline(true);
    if (cleanerOptions.length > 0) return;
    try {
      const list = await fetchCleaners();
      setCleanerOptions(list);
    } catch (e) {
      setToast({ kind: "error", text: e instanceof Error ? e.message : "Something went wrong" });
    }
  };

  const handleAssignTeam = async () => {
    if (!fullBooking?.id || !teamPickId) {
      setToast({ kind: "error", text: "Select a team." });
      return;
    }
    const picked = teamCandidates.find((t) => t.id === teamPickId);
    if (!picked?.assignable) {
      setToast({
        kind: "error",
        text: "That team cannot take this booking (no capacity, or no cleaner qualified for this service on the roster date).",
      });
      return;
    }
    setAssigningTeam(true);
    try {
      await assignTeamToBookingAdmin(fullBooking.id, teamPickId);
      setTeamModalOpen(false);
      setTeamPickId(null);
      setToast({ kind: "success", text: "Team assigned" });
      setDetailRefresh((n) => n + 1);
    } catch (e) {
      setToast({ kind: "error", text: e instanceof Error ? e.message : "Team assignment failed" });
    } finally {
      setAssigningTeam(false);
    }
  };

  const repairRosterFromTeam = async () => {
    if (!fullBooking?.id || !fullBooking.team_id) return;
    setRepairRosterBusy(true);
    try {
      const token = (await getAdminToken()) ?? undefined;
      if (!token) throw new Error("Please sign in as an admin.");
      const res = await fetch(`/api/admin/bookings/${encodeURIComponent(fullBooking.id)}/repair-roster`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const j = (await res.json()) as { ok?: boolean; error?: string; hint?: string; booking_cleaners?: BookingCleanerRow[] };
      if (!res.ok) {
        const msg = res.status === 409 ? (j.hint ?? j.error ?? BOOKING_ROSTER_LOCKED_HINT) : (j.error ?? "Repair failed");
        throw new Error(msg);
      }
      setBookingCleaners(Array.isArray(j.booking_cleaners) ? j.booking_cleaners : []);
      setToast({ kind: "success", text: "Roster rebuilt from team template." });
      setDetailRefresh((n) => n + 1);
    } catch (e) {
      setToast({ kind: "error", text: e instanceof Error ? e.message : "Repair failed" });
    } finally {
      setRepairRosterBusy(false);
    }
  };

  const onAssignOfferDone = ({ direct }: { cleanerId: string; assignAttempts?: number; direct?: boolean }) => {
    setAssignModalOpen(false);
    setEditingCleanerInline(false);
    setAdminActionWarnings([]);
    setToast({
      kind: "success",
      text: direct ? "Cleaner assigned and notified" : "Job offer sent",
    });
    setDetailRefresh((n) => n + 1);
  };

  const onAssignOfferError = (message: string) => {
    setToast({ kind: "error", text: message || "Failed to assign cleaner" });
  };

  function openRescheduleModal() {
    if (!fullBooking) return;
    setDraftDate(fullBooking.date ?? "");
    setDraftTime((fullBooking.time ?? "").slice(0, 5));
    setRescheduleOpen(true);
  }

  const saveScheduleInline = async () => {
    if (!draftDate || !draftTime) {
      setToast({ kind: "error", text: "Date and time are required" });
      return false;
    }
    const prevDate = fullBooking.date;
    const prevTime = fullBooking.time;
    setSavingSchedule(true);
    setFullBooking((p) => (p ? { ...p, date: draftDate, time: `${draftTime}:00` } : p));
    try {
      await updateBooking(fullBooking.id, { date: draftDate, time: draftTime });
      setEditingSchedule(false);
      setRescheduleOpen(false);
      setToast({ kind: "success", text: "Schedule updated" });
      return true;
    } catch (e) {
      setFullBooking((p) => (p ? { ...p, date: prevDate, time: prevTime } : p));
      setToast({ kind: "error", text: e instanceof Error ? e.message : "Something went wrong" });
      return false;
    } finally {
      setSavingSchedule(false);
    }
  };

  const handleContactCustomer = () => {
    const phone =
      resolveAdminBookingCustomerPhone({
        customer_phone: fullBooking.customer_phone,
        phone: fullBooking.phone,
        userProfilePhone: userProfile?.phone,
        bookingSnapshot: fullBooking.booking_snapshot,
        fallbackPhone: customerContactPhone,
      }) ?? null;
    const email = fullBooking.customer_email ?? userProfile?.email ?? null;
    if (phone) {
      const normalized = normalizePhoneForWhatsApp(phone);
      window.open(`https://wa.me/${normalized}`, "_blank", "noopener,noreferrer");
      return;
    }
    if (email) {
      window.location.href = `mailto:${email}`;
      return;
    }
    setToast({ kind: "error", text: "No contact details available" });
  };

  const offPlatformPaidLabel = adminOffPlatformPaidBadgeLabel(fullBooking);

  const isOfficeBooking = basePath === "/office/bookings";
  const createdLabel = fullBooking.created_at ? formatAdminDateTime(fullBooking.created_at) : "Created date unavailable";
  const scheduleDateLabel = fullBooking.date ? formatAdminDate(fullBooking.date) : "Date not set";
  const scheduleTimeLabel = fullBooking.time ? formatAdminTime(fullBooking.time) : "Time not set";
  const locationParts = splitBookingLocation(fullBooking.location);
  const customerName = resolveAdminBookingCustomerName({
    customer_name: fullBooking.customer_name,
    userProfileFullName: userProfile?.full_name,
    bookingSnapshot: fullBooking.booking_snapshot,
    fallbackName: customerContactName,
    customerEmail: fullBooking.customer_email ?? userProfile?.email,
  });
  const customerEmail = fullBooking.customer_email ?? userProfile?.email ?? "Email not available";
  const resolvedCustomerPhone = resolveAdminBookingCustomerPhone({
    customer_phone: fullBooking.customer_phone,
    phone: fullBooking.phone,
    userProfilePhone: userProfile?.phone,
    bookingSnapshot: fullBooking.booking_snapshot,
    fallbackPhone: customerContactPhone,
  });
  const customerPhone = resolvedCustomerPhone ?? "Not on file";
  const customerMissingPhone = !resolvedCustomerPhone;
  const paymentStatusLabel =
    adminOperational?.displayBadge?.trim() ||
    (offPlatformPaidLabel ? offPlatformPaidLabel : canMarkPaid ? "Pending payment" : "Paid");
  const paymentStatusShort = shortPaymentStatusLabel(paymentStatusLabel);
  const scheduleRelativeShort = compactScheduleRelative(fullBooking.date, fullBooking.time);
  const serviceSummaryLine =
    adminServiceHome.bedrooms != null || adminServiceHome.bathrooms != null
      ? `${adminServiceHome.bedrooms ?? "—"} bedrooms · ${adminServiceHome.bathrooms ?? "—"} bathrooms`
      : null;
  const bookingRef = formatBookingReference(fullBooking.id);
  const durationLabel =
    adminServiceHome.durationHours != null
      ? adminServiceHome.durationHours % 1 === 0
        ? `${adminServiceHome.durationHours} hours`
        : `${adminServiceHome.durationHours.toFixed(1)} hours`
      : "Not set";
  const cleanerEntityLabel = supportsTeamAssignment ? "Cleaner / Team" : "Cleaner";
  const cleanerDisplayName =
    cleaner?.full_name?.trim() || teamSummary?.name?.trim() || (fullBooking.cleaner_id ? "Assigned cleaner" : null);
  const cleanerStatusLabel = (() => {
    const bookingSt = String(fullBooking.status ?? "").toLowerCase();
    if (bookingSt === "completed" || bookingSt === "cancelled" || bookingSt === "failed") {
      const cs = String(cleaner?.status ?? "").toLowerCase();
      if (cs === "available") return "Available";
      if (cs === "busy") return "Busy";
      if (cs === "offline") return "Offline";
      return "Released";
    }
    return fullBooking.cleaner_id || fullBooking.team_id ? "Assigned" : "Unassigned";
  })();
  const cleanerRatingLine =
    typeof cleaner?.rating === "number"
      ? `${cleaner.rating.toFixed(1)} rating · ${cleaner.jobs_completed ?? 0} jobs completed`
      : null;
  const statusSteps: OfficeTimelineStep[] = [
    { label: "Created", done: true, time: createdLabel },
    {
      label: "Pending payment",
      done: Boolean(fullBooking.payment_completed_at || fullBooking.payment_status === "success" || offPlatformPaidLabel),
      active: canMarkPaid,
      time: fullBooking.payment_completed_at ? formatAdminDateTime(fullBooking.payment_completed_at) : paymentStatusLabel,
      hint: canMarkPaid ? "Awaiting customer payment" : undefined,
    },
    {
      label: "Assigned",
      done: Boolean(fullBooking.cleaner_id || fullBooking.team_id),
      time: fullBooking.assigned_at ? formatAdminDateTime(fullBooking.assigned_at) : cleanerStatusLabel,
    },
    {
      label: "Cleaner accepted",
      done: Boolean(fullBooking.accepted_at || fullBooking.cleaner_response_status === "accepted"),
      time: fullBooking.accepted_at ? formatAdminDateTime(fullBooking.accepted_at) : "Awaiting acceptance",
    },
    {
      label: "In progress",
      done: Boolean(fullBooking.started_at || fullBooking.status === "in_progress"),
      time: fullBooking.started_at ? formatAdminDateTime(fullBooking.started_at) : "Not started",
    },
    {
      label: "Completed",
      done: Boolean(fullBooking.completed_at || fullBooking.status === "completed"),
      time: fullBooking.completed_at ? formatAdminDateTime(fullBooking.completed_at) : "Not completed",
    },
    {
      label: "Payout",
      done: fullBooking.payout_status === "paid",
      time: fullBooking.payout_status?.trim() ? titleCase(fullBooking.payout_status.replace(/_/g, " ")) : "Pending",
    },
  ];

  const officeOverviewExtras =
    serviceExtrasForAdmin.length > 0 ? (
      <div className="mt-3 border-t border-slate-100 pt-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Extras</p>
        <div className="mt-2 space-y-1">
          {serviceExtrasForAdmin.map((item) => {
            const { key, label } = formatBookingExtraChip(item);
            return (
              <span key={key} className="block rounded-lg bg-slate-50 px-3 py-1.5 text-sm text-slate-700">
                {label}
              </span>
            );
          })}
        </div>
      </div>
    ) : (
      <div className="mt-3 border-t border-slate-100 pt-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Extras</p>
        <p className="mt-2 text-sm text-slate-500">No extras selected</p>
      </div>
    );

  const officeOverviewIssues =
    cleanerIssueReports.length > 0 ? (
      <div className="space-y-3">
        {cleanerIssueReports.slice(0, 3).map((rep) => {
          const reasonLabel = issueReportReasonDisplay(String(rep.reason_key ?? "").trim(), rep.reason_version);
          return (
            <div key={rep.id} className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
              <div className="flex items-start justify-between gap-2">
                <p className="font-semibold">{reasonLabel}</p>
                <span className="text-xs">{rep.created_at ? formatAdminDateTime(rep.created_at) : "—"}</span>
              </div>
              {rep.detail?.trim() ? <p className="mt-2 text-amber-900">{rep.detail.trim()}</p> : null}
              {!rep.resolved_at ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-3 bg-white"
                  disabled={issueResolveBusyId === rep.id}
                  onClick={() => void markIssueReportResolved(rep.id)}
                >
                  Mark resolved
                </Button>
              ) : null}
            </div>
          );
        })}
      </div>
    ) : null;

  const officeOverviewDispatch =
    dispatchOffers.length > 0 ? (
      <div className="space-y-3">
        <select
          value={dispatchOfferUxFilter}
          onChange={(e) => setDispatchOfferUxFilter(e.target.value as DispatchOfferUxFilter)}
          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
        >
          <option value="all">All offers ({dispatchOfferUxCounts.total})</option>
          {CLEANER_UX_VARIANTS.map((v) => (
            <option key={v} value={v}>
              {v} ({variantCountShareLabel(dispatchOfferUxCounts.byVariant[v], dispatchOfferUxCounts.total)})
            </option>
          ))}
          <option value="unknown">unknown ({variantCountShareLabel(dispatchOfferUxCounts.unknown, dispatchOfferUxCounts.total)})</option>
        </select>
        <div className="space-y-2">
          {filteredDispatchOffers.slice(0, 4).map((offer) => (
            <div key={offer.id} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-sm">
              <span className="font-medium text-slate-800">{offer.status ?? "Pending"}</span>
              <span className="text-xs text-slate-500">Rank {offer.rank_index ?? "—"}</span>
            </div>
          ))}
        </div>
      </div>
    ) : null;

  const officeOverviewNotifications = (
    <BookingNotificationTimeline
      rows={notificationLogs}
      compact
      limit={4}
      onRetryEmail={(logId) => void retryFailedNotificationLog(logId)}
      retryingLogId={retryingNotificationLogId}
    />
  );

  return (
    <>
      {isOfficeBooking ? (
        <OfficeBookingDetailsShell
          basePath={basePath}
          onBack={() => (onClose ? onClose() : router.push(basePath))}
          bookingRef={bookingRef}
          createdLabel={createdLabel}
          bookingId={fullBooking.id}
          paymentStatusLabel={paymentStatusLabel}
          paymentStatusShort={paymentStatusShort}
          canMarkPaid={canMarkPaid}
          serviceName={fullBooking.service ?? "Not set"}
          serviceSummaryLine={serviceSummaryLine}
          scheduleDateLabel={scheduleDateLabel}
          scheduleTimeLabel={scheduleTimeLabel}
          scheduleRelativeShort={scheduleRelativeShort}
          startsInIsPast={startsInIsPast}
          locationPrimary={locationParts.primary}
          locationSecondary={locationParts.secondary}
          locationRaw={fullBooking.location}
          cleanerEntityLabel={cleanerEntityLabel}
          cleanerDisplayName={cleanerDisplayName}
          cleanerStatusLabel={cleanerStatusLabel}
          cleanerRatingLine={cleanerRatingLine}
          customerName={customerName}
          customerEmail={customerEmail}
          customerPhone={customerPhone}
          customerMissingPhone={customerMissingPhone}
          userId={fullBooking.user_id}
          total={total}
          basePrice={basePrice}
          extrasPrice={extrasPrice}
          durationLabel={durationLabel}
          bedrooms={adminServiceHome.bedrooms != null ? String(adminServiceHome.bedrooms) : "—"}
          bathrooms={adminServiceHome.bathrooms != null ? String(adminServiceHome.bathrooms) : "—"}
          statusSteps={statusSteps}
          flags={flags}
          snapshotNotesText={snapshotNotesText}
          notesCreatedLabel={
            snapshotNotesText
              ? fullBooking.updated_at
                ? formatAdminDateTime(fullBooking.updated_at)
                : createdLabel
              : null
          }
          cleanerIssueCount={cleanerIssueReports.length}
          dispatchOfferCount={dispatchOffers.length}
          notificationLogCount={notificationLogs.length}
          notificationLogsLoading={notificationLogsLoading}
          adminActionWarnings={adminActionWarnings}
          needsDispatchAttention={needsDispatchManualAttention}
          dispatchCaption={dispatchLifecycleCaptionDetail.trim()}
          showAdminMarkComplete={showAdminMarkComplete}
          showAdminMarkCancel={showAdminMarkCancel}
          markPaidBusy={markPaidBusy}
          fixEarningsBusy={fixEarningsBusy}
          resetEarningsBusy={resetEarningsBusy}
          statusBusy={statusBusy}
          resetDispatchBusy={resetDispatchBusy}
          editBookingBlockedReason={editBookingClientBlockReason}
          resetEarningsBlockedReason={resetEarningsClientBlockReason}
          editDetailsBusy={editDetailsBusy}
          savingSchedule={savingSchedule}
          editingSchedule={editingSchedule}
          draftDate={draftDate}
          draftTime={draftTime}
          zohoInvoiceId={(fullBooking as { zoho_invoice_id?: string | null }).zoho_invoice_id ?? null}
          cleanerTotalZar={cleanerTotalZar}
          companyRevenueZar={companyRevenueZar}
          existingDepositLabel={existingDepositZar != null ? formatZar(existingDepositZar) : null}
          operationalPhase={(adminOperational?.operationalPhase ?? "unknown") as BookingOperationalPhase}
          assignedCleanerId={fullBooking.cleaner_id}
          supportsTeamAssignment={supportsTeamAssignment}
          isTeamAssigned={Boolean(fullBooking.team_id)}
          onAssignPrimary={() => (supportsTeamAssignment ? void openTeamModal() : void openAssignModal())}
          onEditBooking={() => openEditDetailsModal()}
          onReschedule={openRescheduleModal}
          onContactCustomer={handleContactCustomer}
          onMarkPaid={() => {
            setMarkPaidMethod("cash");
            setMarkPaidReference("");
            setMarkPaidAmountZar("");
            setMarkPaidSettlementMode("full");
            setMarkPaidDepositReason("");
            setMarkPaidModalOpen(true);
          }}
          onResendConfirmationEmails={() => void resendConfirmationEmails()}
          resendConfirmationEmailsBusy={resendConfirmationBusy}
          showSendReviewRequest={showSendReviewRequest}
          onSendReviewRequest={() => void sendReviewRequestEmail()}
          sendReviewRequestBusy={sendReviewRequestBusy}
          onFixEarnings={() => void handleFixEarnings()}
          onResetEarnings={() => setResetEarningsModalOpen(true)}
          onMarkComplete={() => void setStatusOptimistic("completed")}
          onCancel={() => void setStatusOptimistic("cancelled")}
          onAssignManually={() => void openAssignModal()}
          onResetDispatch={() => void handleResetDispatchRetry()}
          onEditSchedule={() => setEditingSchedule(true)}
          onCancelEditSchedule={() => {
            setEditingSchedule(false);
            setDraftDate(fullBooking.date ?? "");
            setDraftTime((fullBooking.time ?? "").slice(0, 5));
          }}
          onSaveSchedule={() => void saveScheduleInline()}
          onDraftDateChange={setDraftDate}
          onDraftTimeChange={setDraftTime}
          onViewCleanerProfile={() => void openCleanerPickerInline()}
          overviewExtras={officeOverviewExtras}
          overviewIssues={officeOverviewIssues}
          overviewDispatch={officeOverviewDispatch}
          overviewNotifications={officeOverviewNotifications}
          tabCustomer={
            <AdminInfoCard title="Customer" icon={User}>
              <DetailRow label="Name" value={customerName} />
              <DetailRow label="Email" value={customerEmail} />
              <DetailRow label="Phone" value={customerPhone} />
              <DetailRow label="User ID" value={fullBooking.user_id ?? "—"} mono />
            </AdminInfoCard>
          }
          tabService={
            <AdminInfoCard title="Service details" icon={ReceiptText}>
              <DetailRow label="Service type" value={fullBooking.service ?? "—"} />
              <DetailRow label="Bedrooms" value={adminServiceHome.bedrooms != null ? String(adminServiceHome.bedrooms) : "—"} />
              <DetailRow label="Bathrooms" value={adminServiceHome.bathrooms != null ? String(adminServiceHome.bathrooms) : "—"} />
              <DetailRow label="Base price" value={`R ${basePrice.toLocaleString("en-ZA")}`} />
              <DetailRow label="Extras total" value={`R ${extrasPrice.toLocaleString("en-ZA")}`} />
              <DetailRow label="Total visit" value={`R ${total.toLocaleString("en-ZA")}`} strong />
            </AdminInfoCard>
          }
          tabSchedule={
            <AdminInfoCard title="Schedule" icon={Clock}>
              <DetailRow label="Date" value={scheduleDateLabel} />
              <DetailRow label="Time" value={scheduleTimeLabel} />
              <DetailRow label="Starts" value={startsInText} />
            </AdminInfoCard>
          }
          tabCleaner={
            <AdminInfoCard title={cleanerEntityLabel} icon={Users}>
              <DetailRow label="Name" value={cleanerDisplayName ?? "Not assigned"} />
              <DetailRow label="Status" value={cleanerStatusLabel} />
              <DetailRow label="Assignment" value={assignmentSummaryLine || "—"} />
              {preferredDispatchStatusLabel ? (
                <DetailRow label="Cleaner dispatch" value={preferredDispatchStatusLabel} />
              ) : null}
            </AdminInfoCard>
          }
          tabPayments={
            <AdminInfoCard title="Payments" icon={CreditCard}>
              <DetailRow label="Payment status" value={paymentStatusLabel} />
              <DetailRow label="Total visit" value={`R ${total.toLocaleString("en-ZA")}`} strong />
              <DetailRow
                label={cleanerPayoutCard.payoutLabel}
                value={cleanerPayoutZar == null ? "Pending" : `R ${cleanerPayoutZar.toLocaleString("en-ZA")}`}
              />
              <DetailRow label="Cleaner bonus" value={`R ${cleanerBonusZar.toLocaleString("en-ZA")}`} />
            </AdminInfoCard>
          }
          tabNotifications={
            <AdminInfoCard title="Notification timeline" icon={Mail}>
              <BookingNotificationTimeline
                rows={notificationLogs}
                compact
                onRetryEmail={(logId) => void retryFailedNotificationLog(logId)}
                retryingLogId={retryingNotificationLogId}
              />
            </AdminInfoCard>
          }
          tabActivity={
            <AdminInfoCard title="Activity" icon={Bell}>
              <div className="space-y-0">
                {statusSteps.map((step, index) => (
                  <OfficeTimelineStepRow key={step.label} step={step} isLast={index === statusSteps.length - 1} />
                ))}
              </div>
            </AdminInfoCard>
          }
        />
      ) : (
    <div className="min-h-dvh bg-zinc-50">
      <header className="sticky top-0 z-40 border-b border-zinc-200 bg-white">
        <div className="mx-auto max-w-7xl px-6 py-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <button
                type="button"
                onClick={() => (onClose ? onClose() : router.push("/admin/bookings"))}
                className="inline-flex items-center gap-1 text-sm text-zinc-600 transition hover:text-zinc-900"
              >
                <ArrowLeft size={14} />
                Bookings
              </button>
              <p className="mt-2 text-sm text-zinc-500">Booking ID: {fullBooking.id}</p>
              <h1 className="text-2xl font-semibold text-zinc-900">Booking details</h1>
            </div>
            <div className="flex items-center gap-2">
              {adminOperational ? (
                <span
                  className={[
                    "rounded-full px-2.5 py-1 text-xs font-semibold tracking-wide",
                    operationalDisplayBadgeClassName(adminOperational.displayTone),
                  ].join(" ")}
                  title={[
                    adminOperational.displayBadge,
                    `phase=${adminOperational.operationalPhase}`,
                    `payment=${adminOperational.paymentState}`,
                    `recurring=${adminOperational.recurringState}`,
                    `payout=${adminOperational.payoutState}`,
                  ].join(" · ")}
                >
                  {adminOperational.displayBadge}
                </span>
              ) : null}
              {offPlatformPaidLabel ? (
                <span
                  className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-900 ring-1 ring-emerald-200"
                  title="Recorded via admin Mark as Paid (off-platform)"
                >
                  ✔ {offPlatformPaidLabel}
                </span>
              ) : null}
              {fullBooking.is_test ? (
                <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-amber-900 ring-1 ring-amber-200">
                  TEST BOOKING
                </span>
              ) : null}
              {fullBooking.admin_force_slot_override ? (
                <span
                  className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-rose-900 ring-1 ring-rose-200"
                  title="An admin created this booking using “Create anyway” / duplicate-slot override. Review for policy compliance."
                >
                  <TriangleAlert size={12} aria-hidden />
                  Force override
                </span>
              ) : null}
              <button type="button" onClick={() => void openAssignModal()} className="rounded-lg bg-zinc-900 px-3 py-2 text-sm font-semibold text-white transition hover:bg-zinc-700">
                {isAssigned ? "Reassign" : "Assign cleaner"}
              </button>
              <div className="rounded-lg border border-zinc-200 bg-white px-1 py-1">
                <BookingActionsDropdown
                  booking={fullBooking}
                  showMarkComplete={showAdminMarkComplete}
                  showMarkCancel={showAdminMarkCancel}
                  onAssign={() => void openAssignModal()}
                  onReassign={() => void openAssignModal()}
                  onReschedule={openRescheduleModal}
                  onComplete={() => void setStatusOptimistic("completed")}
                  onCancel={() => void setStatusOptimistic("cancelled")}
                  onDelete={() => void handleDeleteBooking()}
                />
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-7xl grid-cols-12 gap-6 px-6 py-6">
        {adminActionWarnings.length > 0 ? (
          <div className="col-span-12">
            <AdminWarningList warnings={adminActionWarnings} />
          </div>
        ) : null}
        {needsDispatchManualAttention ? (
          <div
            className="col-span-12 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 shadow-sm"
            role="status"
          >
            <p className="font-semibold text-amber-950">Dispatch needs attention</p>
            <p className="mt-1 text-sm font-medium leading-snug text-amber-950/95">
              {dispatchLifecycleCaptionDetail.trim() ||
                adminOperational?.displayBadge ||
                "Review dispatch and assignment."}
            </p>
            {dispatchLifecycleRawDetail.trim() ? (
              <p className="mt-2 font-mono text-[10px] leading-snug text-amber-950/70">{dispatchLifecycleRawDetail}</p>
            ) : null}
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void openAssignModal()}
                className="rounded-lg bg-zinc-900 px-3 py-2 text-sm font-semibold text-white transition hover:bg-zinc-800"
              >
                Assign manually
              </button>
              <button
                type="button"
                disabled={resetDispatchBusy}
                onClick={() => void handleResetDispatchRetry()}
                className="rounded-lg border border-amber-700/40 bg-white px-3 py-2 text-sm font-semibold text-amber-950 transition hover:bg-amber-100 disabled:opacity-50"
              >
                {resetDispatchBusy ? "Resetting…" : "Reset & retry auto-dispatch"}
              </button>
            </div>
          </div>
        ) : null}
        <section className="col-span-12 space-y-6 lg:col-span-8">
          <DetailCard title="Payment & lifecycle">
            <BookingPaymentTimeline booking={fullBooking} />
          </DetailCard>
          <DetailCard title="Customer">
            <p className="text-base font-medium text-zinc-900">{fullBooking.customer_email ?? userProfile?.email ?? "—"}</p>
            <DetailRow label="Phone" value={customerPhone} />
            <DetailRow label="User ID" value={fullBooking.user_id ?? "—"} mono />
          </DetailCard>
          <DetailCard title="Service">
            <p className="text-base font-medium text-zinc-900">{fullBooking.service ?? "—"}</p>
            <DetailRow
              label="Bedrooms"
              value={adminServiceHome.bedrooms != null ? String(adminServiceHome.bedrooms) : "—"}
            />
            <DetailRow
              label="Bathrooms"
              value={adminServiceHome.bathrooms != null ? String(adminServiceHome.bathrooms) : "—"}
            />
            {adminServiceHome.extraRooms != null && adminServiceHome.extraRooms > 0 ? (
              <DetailRow label="Extra rooms" value={String(adminServiceHome.extraRooms)} />
            ) : null}
            {adminServiceHome.propertyType ? (
              <DetailRow label="Property type" value={formatPropertyTypeLabel(adminServiceHome.propertyType)} />
            ) : null}
            {adminServiceHome.cleaningFrequency ? (
              <DetailRow
                label="Cleaning frequency"
                value={formatCleaningFrequencyLabel(adminServiceHome.cleaningFrequency)}
              />
            ) : null}
            <DetailRow
              label="Duration"
              value={
                adminServiceHome.durationHours != null
                  ? `${adminServiceHome.durationHours % 1 === 0 ? String(adminServiceHome.durationHours) : adminServiceHome.durationHours.toFixed(1).replace(/\.0$/, "")} hrs`
                  : "Not specified"
              }
            />
            <div>
              <p className="text-xs text-zinc-500">Extras</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {serviceExtrasForAdmin.length ? (
                  serviceExtrasForAdmin.map((item) => {
                    const { key, label } = formatBookingExtraChip(item);
                    return (
                      <span
                        key={key}
                        className="rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-xs font-medium text-zinc-700"
                      >
                        {label}
                      </span>
                    );
                  })
                ) : (
                  <span className="text-sm text-zinc-500">No extras selected</span>
                )}
              </div>
              {serviceExtrasForAdmin.length > 0 ? (
                <p className="mt-2 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
                  If a tag says <span className="font-medium text-zinc-600 dark:text-zinc-300">included in visit total</span>
                  , checkout did not add a separate rand line for that task — it may follow catalog rules for this service
                  type or sit inside base / room pricing. Compare with the Pricing snapshot card for the frozen totals.
                </p>
              ) : null}
            </div>
          </DetailCard>
          <DetailCard title="Schedule">
            {editingSchedule ? (
              <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 transition">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <label className="text-xs text-zinc-500">
                    Date
                    <input
                      type="date"
                      value={draftDate}
                      onChange={(e) => setDraftDate(e.target.value)}
                      className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm"
                    />
                  </label>
                  <label className="text-xs text-zinc-500">
                    Time
                    <input
                      type="time"
                      value={draftTime}
                      onChange={(e) => setDraftTime(e.target.value)}
                      className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm"
                    />
                  </label>
                </div>
                <div className="mt-3 flex justify-end gap-2">
                  <button
                    type="button"
                    disabled={savingSchedule}
                    onClick={() => {
                      setEditingSchedule(false);
                      setDraftDate(fullBooking.date ?? "");
                      setDraftTime((fullBooking.time ?? "").slice(0, 5));
                    }}
                    className="rounded-md bg-zinc-100 px-3 py-1.5 text-sm font-medium text-zinc-700"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={savingSchedule}
                    onClick={() => {
                      void saveScheduleInline();
                    }}
                    className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-60"
                  >
                    {savingSchedule ? <span className="inline-flex items-center gap-2"><Loader2 size={14} className="animate-spin" />Saving…</span> : "Save"}
                  </button>
                </div>
              </div>
            ) : (
              <>
                <DetailRow label="Date" value={fullBooking.date ?? "—"} />
                <DetailRow label="Time" value={fullBooking.time ?? "—"} />
                <button
                  type="button"
                  onClick={() => setEditingSchedule(true)}
                  className="inline-flex items-center gap-1 text-xs font-medium text-zinc-600 hover:text-zinc-900"
                >
                  <Pencil size={13} />
                  Edit date & time
                </button>
              </>
            )}
            <div className="rounded-lg bg-zinc-50 px-3 py-2">
              <p className="text-xs text-zinc-500">{startsInIsPast ? "Started" : "Starts in"}</p>
              <p className={["text-base font-semibold", startsInClass].join(" ")}>{startsInText}</p>
            </div>
          </DetailCard>
          <DetailCard title="Location">
            <p className="text-base font-medium text-zinc-900">{fullBooking.location ?? "—"}</p>
            {fullBooking.location ? (
              <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fullBooking.location)}`} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-sm text-emerald-700 hover:text-emerald-800">
                <MapPin size={14} />Open in maps
              </a>
            ) : null}
          </DetailCard>
          <AdminBookingLiveLocation
            bookingId={fullBooking.id}
            operationalPhase={adminOperational?.operationalPhase ?? "unknown"}
            cleanerId={fullBooking.cleaner_id}
          />
          <DetailCard title="Pricing snapshot">
            {(() => {
              const snap: AdminPriceSnapshotCardView | null = fullBooking
                ? parseAdminBookingPriceSnapshot(fullBooking.price_snapshot, {
                    serviceSlug:
                      typeof (fullBooking as { service_slug?: unknown }).service_slug === "string"
                        ? String((fullBooking as { service_slug: string }).service_slug).trim()
                        : null,
                    serviceLabel: fullBooking.service ?? null,
                  })
                : null;
              if (!snap) {
                const homeHint =
                  adminServiceHome.bedrooms != null ||
                  adminServiceHome.bathrooms != null ||
                  adminServiceHome.durationHours != null;
                return (
                  <div className="rounded-lg border border-amber-200/80 bg-amber-50/90 px-3 py-2 text-sm text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-50">
                    <span className="inline-flex items-center gap-1.5 font-medium">
                      <TriangleAlert size={14} aria-hidden />
                      No pricing snapshot
                    </span>
                    <p className="mt-1 text-xs font-normal text-amber-900/90 dark:text-amber-100/85">
                      This booking has no recognizable immutable snapshot JSON (legacy rows or corrupted payload).
                      Totals on the booking row still apply; this section cannot show the frozen checkout breakdown.
                    </p>
                    {homeHint ? (
                      <dl className="mt-3 space-y-1 border-t border-amber-200/80 pt-3 text-xs dark:border-amber-800/50">
                        {adminServiceHome.bedrooms != null ? (
                          <div className="flex justify-between gap-4">
                            <dt className="text-amber-900/80 dark:text-amber-100/80">Bedrooms</dt>
                            <dd className="font-medium tabular-nums">{adminServiceHome.bedrooms}</dd>
                          </div>
                        ) : null}
                        {adminServiceHome.bathrooms != null ? (
                          <div className="flex justify-between gap-4">
                            <dt className="text-amber-900/80 dark:text-amber-100/80">Bathrooms</dt>
                            <dd className="font-medium tabular-nums">{adminServiceHome.bathrooms}</dd>
                          </div>
                        ) : null}
                        {adminServiceHome.durationHours != null ? (
                          <div className="flex justify-between gap-4">
                            <dt className="text-amber-900/80 dark:text-amber-100/80">Quoted duration</dt>
                            <dd className="font-medium tabular-nums">
                              {adminServiceHome.durationHours % 1 === 0
                                ? `${adminServiceHome.durationHours} hrs`
                                : `${adminServiceHome.durationHours.toFixed(1).replace(/\.0$/, "")} hrs`}
                            </dd>
                          </div>
                        ) : null}
                      </dl>
                    ) : null}
                  </div>
                );
              }
              const extrasZarFromBreakdown = readPriceBreakdownExtrasZar(fullBooking.price_breakdown);
              const { rows: pricingExtrasRows, showBundledExplanation } = mergeAdminPricingSnapshotExtras({
                snapExtras: snap.extras,
                bookingExtrasPayload: serviceExtrasForAdmin,
                extrasZarFromBreakdown: extrasZarFromBreakdown,
              });

              return (
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between gap-4">
                    <dt className="text-zinc-500">Service type</dt>
                    <dd className="font-mono text-zinc-900 dark:text-zinc-100">{snap.service_type}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-zinc-500">Bedrooms</dt>
                    <dd className="tabular-nums text-zinc-900 dark:text-zinc-100">
                      {adminServiceHome.bedrooms != null ? adminServiceHome.bedrooms : "—"}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-zinc-500">Bathrooms</dt>
                    <dd className="tabular-nums text-zinc-900 dark:text-zinc-100">
                      {adminServiceHome.bathrooms != null ? adminServiceHome.bathrooms : "—"}
                    </dd>
                  </div>
                  {adminServiceHome.extraRooms != null && adminServiceHome.extraRooms > 0 ? (
                    <div className="flex justify-between gap-4">
                      <dt className="text-zinc-500">Extra rooms</dt>
                      <dd className="tabular-nums text-zinc-900 dark:text-zinc-100">{adminServiceHome.extraRooms}</dd>
                    </div>
                  ) : null}
                  {adminServiceHome.durationHours != null ? (
                    <div className="flex justify-between gap-4">
                      <dt className="text-zinc-500">Quoted duration</dt>
                      <dd className="tabular-nums text-zinc-900 dark:text-zinc-100">
                        {adminServiceHome.durationHours % 1 === 0
                          ? `${adminServiceHome.durationHours} hrs`
                          : `${adminServiceHome.durationHours.toFixed(1).replace(/\.0$/, "")} hrs`}
                      </dd>
                    </div>
                  ) : null}
                  <div className="flex justify-between gap-4">
                    <dt className="text-zinc-500">Base (rooms &amp; core)</dt>
                    <dd className="font-medium text-zinc-900 dark:text-zinc-100">{formatZar(snap.base_price)}</dd>
                  </div>
                  <div>
                    <dt className="text-zinc-500">Extras</dt>
                    <dd className="mt-1">
                      {pricingExtrasRows.length === 0 ? (
                        <p className="text-zinc-500">None</p>
                      ) : (
                        <>
                          {showBundledExplanation ? (
                            <p className="mb-2 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
                              Checkout recorded no extra rand amount for these add-ons on this quote (they can still be
                              selected for the job). Typical reasons: not billed separately for this service in your
                              catalog, or the visit total already bundles them into base / room pricing —{" "}
                              <span className="font-medium text-zinc-600 dark:text-zinc-300">
                                not a missing payment line if Base matches Total (visit).
                              </span>
                            </p>
                          ) : null}
                          <ul className="divide-y divide-zinc-100 rounded-md border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-700">
                            {pricingExtrasRows.map((ex) => (
                              <li
                                key={`${ex.id}-${ex.name}`}
                                className="flex justify-between gap-4 px-2 py-1.5 text-zinc-800 dark:text-zinc-200"
                              >
                                <span>{ex.name}</span>
                                <span className="text-right font-medium tabular-nums">
                                  {ex.price > 0 ? (
                                    formatZar(ex.price)
                                  ) : (
                                    <span className="font-normal text-zinc-500 dark:text-zinc-400">
                                      Included in visit total
                                    </span>
                                  )}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </>
                      )}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-4 border-t border-zinc-200 pt-2 dark:border-zinc-700">
                    <dt className="font-medium text-zinc-800 dark:text-zinc-200">Total (visit)</dt>
                    <dd className="font-semibold text-zinc-900 dark:text-zinc-50">{formatZar(snap.total_price)}</dd>
                  </div>
                </dl>
              );
            })()}
          </DetailCard>
          {snapshotNotesText ? (
            <DetailCard title="Ops & booking notes">
              <p className="whitespace-pre-wrap rounded-lg border border-amber-200/80 bg-amber-50/90 px-3 py-2.5 text-sm text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-50">
                {snapshotNotesText}
              </p>
            </DetailCard>
          ) : null}
          <DetailCard title="Cleaner-reported issues">
            <div className="space-y-2 text-sm text-zinc-600">
              <p>
                When a cleaner uses <span className="font-medium text-zinc-800 dark:text-zinc-200">Report a problem</span>{" "}
                in their app, the issue appears here with the reason and any notes they added. Use this list to follow up
                on the job and mark items resolved when you are done.
              </p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                A copy is also kept in system logs. Optional email or webhook alerts for new reports are configured in
                your deployment settings—not in this screen.
              </p>
            </div>
            {cleanerIssueReports.length === 0 ? (
              <p className="mt-2 text-sm text-zinc-500">No reports on this booking yet.</p>
            ) : (
              <ul className="mt-3 space-y-3 border-t border-zinc-100 pt-3">
                {cleanerIssueReports.map((rep) => {
                  const rk = String(rep.reason_key ?? "").trim();
                  const reasonLabel = issueReportReasonDisplay(rk, rep.reason_version);
                  const since = formatTimeSinceReport(rep.created_at, issueReportNowMs);
                  const snap =
                    rep.whatsapp_snapshot && typeof rep.whatsapp_snapshot === "object"
                      ? (rep.whatsapp_snapshot as Record<string, unknown>)
                      : null;
                  const prefill =
                    typeof snap?.prefill_text === "string" ? (snap.prefill_text as string).slice(0, 2000) : null;
                  const waUrl = typeof snap?.wa_url === "string" ? snap.wa_url : null;
                  const assignedTel =
                    cleaner?.id === rep.cleaner_id ? digitsForWhatsApp(cleaner?.phone ?? null) : null;
                  const customerWa = digitsForWhatsApp(resolvedCustomerPhone);
                  const resolved = Boolean(rep.resolved_at);
                  return (
                    <li
                      key={rep.id}
                      className="rounded-lg border border-amber-100 bg-amber-50/60 px-3 py-2 text-sm dark:border-amber-900/40 dark:bg-amber-950/25"
                    >
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <span className="font-medium text-amber-950 dark:text-amber-50">{reasonLabel}</span>
                        <span className="text-right text-xs text-zinc-500">
                          {since ? (
                            <>
                              {since}
                              <span className="mt-0.5 block font-normal text-zinc-400">
                                {rep.created_at ? new Date(rep.created_at).toLocaleString() : "—"}
                              </span>
                            </>
                          ) : rep.created_at ? (
                            new Date(rep.created_at).toLocaleString()
                          ) : (
                            "—"
                          )}
                        </span>
                      </div>
                      <p className="mt-1 font-mono text-[11px] text-zinc-500">Cleaner {rep.cleaner_id}</p>
                      {resolved ? (
                        <p className="mt-2 text-xs font-medium text-emerald-800 dark:text-emerald-200">
                          Resolved{rep.resolved_by ? ` by ${rep.resolved_by}` : ""}
                          {rep.resolved_at ? ` · ${new Date(rep.resolved_at).toLocaleString()}` : ""}
                        </p>
                      ) : null}
                      {rep.detail?.trim() ? (
                        <p className="mt-2 whitespace-pre-wrap text-zinc-800 dark:text-zinc-100">{rep.detail.trim()}</p>
                      ) : null}
                      {prefill ? (
                        <details className="mt-2">
                          <summary className="cursor-pointer text-xs font-medium text-zinc-600">WhatsApp snapshot</summary>
                          <p className="mt-1 whitespace-pre-wrap font-mono text-[11px] text-zinc-600">{prefill}</p>
                          {waUrl ? (
                            <a
                              href={waUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="mt-1 inline-block text-xs font-medium text-blue-600 hover:underline dark:text-blue-400"
                            >
                              Open same wa.me link
                            </a>
                          ) : null}
                        </details>
                      ) : null}
                      {!resolved ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {assignedTel ? (
                            <a
                              href={`tel:+${assignedTel}`}
                              className="inline-flex items-center gap-1 rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-800 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
                            >
                              <Phone size={13} aria-hidden />
                              Call cleaner
                            </a>
                          ) : null}
                          {customerWa ? (
                            <a
                              href={`https://wa.me/${customerWa}`}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-medium text-emerald-900 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100"
                            >
                              Message customer (WhatsApp)
                            </a>
                          ) : null}
                          <button
                            type="button"
                            disabled={issueResolveBusyId === rep.id}
                            onClick={() => void markIssueReportResolved(rep.id)}
                            className="rounded-md bg-zinc-900 px-2.5 py-1.5 text-xs font-semibold text-white disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900"
                          >
                            {issueResolveBusyId === rep.id ? "Saving…" : "Mark resolved"}
                          </button>
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </DetailCard>
          {serviceQa ? (
            <DetailCard title="Execution QA (checklist & photos)">
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                Deep / move job checklist and optional before-after photos from cleaners. Image links are signed and expire —
                refresh if thumbnails fail.
              </p>
              <div className="mt-4 border-t border-zinc-100 pt-3 dark:border-zinc-800">
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Checklist</p>
                {serviceQa.checklist.length === 0 ? (
                  <p className="mt-2 text-sm text-zinc-500">No sections marked yet.</p>
                ) : (
                  <ul className="mt-2 space-y-2">
                    {serviceQa.checklist.map((row, idx) => (
                      <li
                        key={`${row.cleaner_id}-${row.section_key}-${idx}`}
                        className="flex flex-wrap items-baseline justify-between gap-2 rounded-lg border border-zinc-100 bg-zinc-50/80 px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-900/40"
                      >
                        <span className="font-medium text-zinc-900 dark:text-zinc-100">{row.section_label}</span>
                        <span className={row.completed ? "text-emerald-700 dark:text-emerald-400" : "text-zinc-500"}>
                          {row.completed ? "Done" : "Pending"}
                        </span>
                        <span className="w-full text-xs text-zinc-500 sm:w-auto">
                          {row.cleaner_name?.trim() || `Cleaner ${row.cleaner_id.slice(0, 8)}…`}
                          {row.completed_at
                            ? ` · ${new Date(row.completed_at).toLocaleString("en-ZA", { dateStyle: "short", timeStyle: "short" })}`
                            : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="mt-4 border-t border-zinc-100 pt-3 dark:border-zinc-800">
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Photos</p>
                {serviceQa.photos.length === 0 ? (
                  <p className="mt-2 text-sm text-zinc-500">No photos uploaded.</p>
                ) : (
                  <div className="mt-3 space-y-4">
                    {(["before", "after"] as const).map((kind) => {
                      const list = serviceQa.photos.filter((p) => p.photo_type === kind);
                      if (list.length === 0) return null;
                      return (
                        <div key={kind}>
                          <p className="mb-2 text-xs font-medium capitalize text-zinc-600 dark:text-zinc-400">{kind}</p>
                          <ul className="flex flex-wrap gap-3">
                            {list.map((ph) => (
                              <li key={ph.id} className="text-xs">
                                {ph.signed_url ? (
                                  <a
                                    href={ph.signed_url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="group block"
                                  >
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                      src={ph.signed_url}
                                      alt={`${kind} ${ph.section_label}`}
                                      className="h-20 w-20 rounded-md border border-zinc-200 object-cover group-hover:opacity-95 dark:border-zinc-700"
                                    />
                                    <span className="mt-1 block max-w-[5.5rem] truncate text-zinc-600 dark:text-zinc-400">
                                      {ph.section_label}
                                    </span>
                                    <span className="block truncate text-[10px] text-zinc-500">
                                      {ph.cleaner_name?.trim() || ph.cleaner_id.slice(0, 8)}
                                    </span>
                                  </a>
                                ) : (
                                  <span className="text-zinc-500">Unavailable (refresh)</span>
                                )}
                              </li>
                            ))}
                          </ul>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </DetailCard>
          ) : null}
          <DetailCard title="Notification timeline">
            <p className="text-sm text-zinc-600">
              Outbound delivery attempts for this booking.{" "}
              <Link
                href="/admin/notification-logs"
                className="font-medium text-blue-600 underline-offset-2 hover:underline dark:text-blue-400"
              >
                Full logs
              </Link>
            </p>
            <div className="border-t border-zinc-100 pt-3">
              <BookingNotificationTimeline
                rows={notificationLogs}
                loading={notificationLogsLoading}
                emptyMessage="No notification log rows for this booking yet."
                onRetryEmail={(logId) => void retryFailedNotificationLog(logId)}
                retryingLogId={retryingNotificationLogId}
              />
            </div>
          </DetailCard>
          <DetailCard title="Dispatch offers">
            {preferredDispatchStatusLabel ? (
              <p className="mb-3 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-950 dark:border-blue-900/50 dark:bg-blue-950/30 dark:text-blue-100">
                {preferredDispatchStatusLabel}
              </p>
            ) : null}
            {dispatchOffers.length === 0 ? (
              <p className="text-sm text-zinc-500">No dispatch offers for this booking.</p>
            ) : (
              <div className="space-y-3">
                <label className="flex flex-wrap items-center gap-2 text-sm text-zinc-600">
                  <span className="font-medium text-zinc-700">Filter by UX variant</span>
                  <select
                    value={dispatchOfferUxFilter}
                    onChange={(e) => setDispatchOfferUxFilter(e.target.value as DispatchOfferUxFilter)}
                    className="rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-900"
                  >
                    <option value="all">All ({dispatchOfferUxCounts.total})</option>
                    {CLEANER_UX_VARIANTS.map((v) => {
                      const star = fleetBestUxVariant === v ? "⭐ " : "";
                      return (
                        <option key={v} value={v}>
                          {star}
                          {v} ({variantCountShareLabel(dispatchOfferUxCounts.byVariant[v], dispatchOfferUxCounts.total)})
                        </option>
                      );
                    })}
                    <option value="unknown">
                      {fleetBestUxVariant === "unknown" ? "⭐ " : ""}unknown (
                      {variantCountShareLabel(dispatchOfferUxCounts.unknown, dispatchOfferUxCounts.total)})
                    </option>
                  </select>
                  {dispatchOfferUxFilter !== "all" && filteredDispatchOffers.length === 0 ? (
                    <span className="text-xs text-amber-700">No rows for this variant.</span>
                  ) : null}
                </label>
                <div className="overflow-x-auto rounded-lg border border-zinc-200">
                <table className="w-full min-w-[32rem] text-left text-sm">
                  <thead className="border-b border-zinc-200 bg-zinc-50 text-xs font-semibold uppercase tracking-wide text-zinc-600">
                    <tr>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2">UX variant</th>
                      <th className="px-3 py-2">Cleaner</th>
                      <th className="px-3 py-2">Rank</th>
                      <th className="px-3 py-2">Created</th>
                      <th className="px-3 py-2">Expires</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredDispatchOffers.map((o) => (
                      <tr key={o.id} className="border-b border-zinc-100 last:border-0">
                        <td className="px-3 py-2 font-mono text-xs text-zinc-800">{(o.status ?? "—").toLowerCase()}</td>
                        <td className="px-3 py-2 font-mono text-xs text-zinc-800">{o.ux_variant?.trim() || "—"}</td>
                        <td className="px-3 py-2 font-mono text-[11px] text-zinc-600">{o.cleaner_id}</td>
                        <td className="px-3 py-2 text-zinc-700">{o.rank_index ?? "—"}</td>
                        <td className="px-3 py-2 text-xs text-zinc-600">{o.created_at ? new Date(o.created_at).toLocaleString("en-ZA") : "—"}</td>
                        <td className="px-3 py-2 text-xs text-zinc-600">{o.expires_at ? new Date(o.expires_at).toLocaleString("en-ZA") : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              </div>
            )}
          </DetailCard>
          {showAdminSoloCleanerDetailCard ? (
          <DetailCard title="Cleaner">
            {fullBooking.cleaner_id ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-base font-medium text-zinc-900">{cleaner?.full_name ?? fullBooking.cleaner_id}</p>
                  <button
                    type="button"
                    onClick={() => {
                      void openCleanerPickerInline();
                    }}
                    className="inline-flex items-center gap-1 rounded-md bg-zinc-100 px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-200"
                  >
                    <Pencil size={12} />
                    Edit
                  </button>
                </div>
                <DetailRow label="Rating" value={typeof cleaner?.rating === "number" ? `${cleaner.rating.toFixed(1)} ★` : "—"} />
                <DetailRow label="Jobs completed" value={`${cleaner?.jobs_completed ?? 0}`} />
                <DetailRow label="Status" value="Assigned" />
                {assignmentSummaryLine ? (
                  <p className="text-xs text-zinc-600 dark:text-zinc-400">{assignmentSummaryLine}</p>
                ) : null}
                {dispatchAttemptCleanerId ? (
                  <div className="mt-2 rounded-md border border-zinc-200 bg-white/80 px-2 py-1.5 dark:border-zinc-600 dark:bg-zinc-900/40">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                      Dispatch attempt
                    </p>
                    <p className="mt-0.5 font-mono text-[11px] text-zinc-700 dark:text-zinc-300">{dispatchAttemptCleanerId}</p>
                  </div>
                ) : null}
              </div>
            ) : selectedCleaner || hasSelectedCleanerUuid ? (
              <div className="space-y-3">
                <div className="rounded-lg border border-sky-200 bg-sky-50/90 p-3 dark:border-sky-900/60 dark:bg-sky-950/40">
                  <p className="text-xs font-semibold uppercase tracking-wide text-sky-900 dark:text-sky-200">
                    Selected at checkout (pending acceptance)
                  </p>
                  {selectedCleaner ? (
                    <>
                      <p className="mt-1 text-base font-medium text-zinc-900 dark:text-zinc-100">
                        {selectedCleaner.full_name ?? selectedCleaner.id}
                      </p>
                      <DetailRow label="Rating" value={typeof selectedCleaner.rating === "number" ? `${selectedCleaner.rating.toFixed(1)} ★` : "—"} />
                      <DetailRow label="Cleaner status" value={selectedCleaner.status?.trim() ? selectedCleaner.status : "—"} />
                      {selectedCleaner.phone?.trim() ? (
                        <DetailRow
                          label="Phone"
                          value={
                            <a className="text-emerald-700 hover:underline" href={`tel:${selectedCleaner.phone}`}>
                              {selectedCleaner.phone}
                            </a>
                          }
                        />
                      ) : null}
                      {selectedCleaner.email?.trim() ? (
                        <DetailRow
                          label="Email"
                          value={
                            <a className="text-emerald-700 hover:underline" href={`mailto:${selectedCleaner.email}`}>
                              {selectedCleaner.email}
                            </a>
                          }
                        />
                      ) : null}
                    </>
                  ) : (
                    <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-300">
                      Recorded cleaner id{" "}
                      <span className="font-mono text-xs">{selectedCleanerIdRaw}</span> (profile not found — may be removed
                      or invalid).
                    </p>
                  )}
                </div>
                {dispatchAttemptCleanerId ? (
                  <div className="rounded-lg border border-zinc-200 bg-zinc-50/90 p-3 dark:border-zinc-700 dark:bg-zinc-900/50">
                    <p className="text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-400">
                      Dispatch attempt
                    </p>
                    <p className="mt-1 font-mono text-[11px] text-zinc-700 dark:text-zinc-300">{dispatchAttemptCleanerId}</p>
                  </div>
                ) : null}
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-900/50 dark:bg-amber-950/30">
                  <p className="flex items-center gap-2 text-sm font-medium text-amber-800 dark:text-amber-200">
                    <TriangleAlert size={14} />
                    No cleaner assigned yet — job is offered until they accept.
                  </p>
                  <button
                    type="button"
                    onClick={() => void openCleanerPickerInline()}
                    className="mt-3 rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
                  >
                    Assign cleaner
                  </button>
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                <p className="flex items-center gap-2 text-sm font-medium text-amber-800"><TriangleAlert size={14} />No cleaner assigned</p>
                <button type="button" onClick={() => void openCleanerPickerInline()} className="mt-3 rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-zinc-700">Assign cleaner</button>
              </div>
            )}
            {fullBooking.cleaner_id && selectedCleaner ? (
              <div className="mt-3 rounded-lg border border-zinc-200 bg-zinc-50/90 p-3 dark:border-zinc-700 dark:bg-zinc-900/50">
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-400">
                  Selected at checkout
                </p>
                <p className="mt-1 text-sm font-medium text-zinc-900 dark:text-zinc-100">
                  {selectedCleaner.full_name ?? selectedCleaner.id}
                </p>
                <p className="mt-1 font-mono text-[11px] text-zinc-500">{selectedCleaner.id}</p>
              </div>
            ) : null}
            {editingCleanerInline ? (
              <div className="mt-3 rounded-lg border border-zinc-200 bg-zinc-50 p-2 transition">
                {cleanerOptions.length === 0 ? (
                  <p className="px-2 py-3 text-sm text-zinc-500">Loading cleaners…</p>
                ) : (
                  <AdminAssignForm
                    booking={{
                      id: fullBooking.id,
                      date: fullBooking.date,
                      time: fullBooking.time,
                      duration_minutes: fullBooking.duration_minutes,
                    }}
                    bookingId={fullBooking.id}
                    cleaners={toCleanerAssignOptions(cleanerOptions)}
                    onDone={onAssignOfferDone}
                    onError={onAssignOfferError}
                  />
                )}
                <div className="mt-2 flex justify-end">
                  <button
                    type="button"
                    onClick={() => setEditingCleanerInline(false)}
                    className="rounded-md bg-zinc-100 px-2 py-1 text-xs font-medium text-zinc-700"
                  >
                    Close
                  </button>
                </div>
              </div>
            ) : null}
          </DetailCard>
          ) : null}
          {supportsTeamAssignment ? (
            <DetailCard title="Team assignment">
              {fullBooking.team_id && teamSummary ? (
                <div className="space-y-2">
                  <DetailRow label="Team" value={teamSummary.name} />
                  <DetailRow
                    label="Members (on job date)"
                    value={teamSummary.member_count == null ? "—" : String(teamSummary.member_count)}
                  />
                  <DetailRow label="Team job" value={fullBooking.is_team_job ? "Yes" : "No"} />
                </div>
              ) : (
                <p className="text-sm text-zinc-600">No team assigned yet.</p>
              )}
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  onClick={() => void openTeamModal()}
                  className="w-full rounded-md bg-zinc-900 px-3 py-2 text-sm font-semibold text-white hover:bg-zinc-700 sm:flex-1"
                >
                  {fullBooking.team_id ? "Change team" : "Assign team"}
                </button>
                <button
                  type="button"
                  disabled={jobRosterLocked}
                  title={
                    jobRosterLocked
                      ? "Roster is locked after cleaner earnings were finalized for this booking."
                      : "Add or swap cleaners on this visit only (does not change team templates)."
                  }
                  onClick={() => setEmergencyRosterOpen(true)}
                  className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-semibold text-zinc-900 shadow-sm hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800 sm:flex-1"
                >
                  Edit job roster
                </button>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-zinc-500">
                <span className="font-medium text-zinc-600">Tip:</span> deep and move bookings share the same teams from
                Admin → Teams; assigning usually fills the roster from the template. Use{" "}
                <span className="font-medium text-zinc-700 dark:text-zinc-300">Edit job roster</span> to adjust this visit
                without editing templates.
              </p>
              <div className="mt-4 border-t border-zinc-100 pt-4 dark:border-zinc-800">
                <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Job roster</p>
                {bookingCleaners.length > 0 ? (
                  <ul className="mt-2 space-y-1.5">
                    {bookingCleaners.map((r) => (
                      <li
                        key={r.id}
                        className="flex items-center justify-between gap-2 rounded-md border border-zinc-100 bg-zinc-50 px-2 py-1.5 dark:border-zinc-700 dark:bg-zinc-900/40"
                      >
                        <span className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
                          {r.cleaner_name ?? r.cleaner_id}
                        </span>
                        <span
                          className={
                            String(r.role).toLowerCase() === "lead"
                              ? "shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900 dark:bg-amber-900/40 dark:text-amber-100"
                              : "shrink-0 rounded-full bg-zinc-200 px-2 py-0.5 text-[11px] font-semibold text-zinc-700 dark:bg-zinc-600 dark:text-zinc-100"
                          }
                        >
                          {String(r.role).toLowerCase() === "lead" ? "Lead" : "Member"}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1 text-xs text-zinc-500">
                    Nobody on this job yet. Use <span className="font-medium text-zinc-600 dark:text-zinc-400">Assign team</span>{" "}
                    or <span className="font-medium text-zinc-600 dark:text-zinc-400">Edit job roster</span> above.
                  </p>
                )}
                {fullBooking.team_id && bookingCleaners.length === 0 ? (
                  <button
                    type="button"
                    disabled={repairRosterBusy}
                    onClick={() => void repairRosterFromTeam()}
                    className="mt-2 w-full rounded-md border border-amber-300 bg-amber-50 px-2 py-1.5 text-xs font-semibold text-amber-950 hover:bg-amber-100 disabled:opacity-50 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100 dark:hover:bg-amber-950/50"
                  >
                    {repairRosterBusy ? "Repairing roster…" : "Repair roster from team"}
                  </button>
                ) : null}
              </div>
            </DetailCard>
          ) : null}
          <DetailCard title="Flags">
            <div className="flex flex-wrap gap-2">
              {flags.length ? flags.map((flag) => <FlagPill key={flag} flag={flag} />) : <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">No issues</span>}
            </div>
          </DetailCard>
          <DetailCard title="Pricing">
            {fullBooking.is_recurring_generated ? (
              <div className="mb-3 space-y-1 rounded-lg border border-blue-100 bg-blue-50/80 px-3 py-2 text-xs text-blue-950 dark:border-blue-900/50 dark:bg-blue-950/25 dark:text-blue-100">
                <DetailRow
                  label="Recurring payment state"
                  value={fullBooking.payment_state?.trim() ? fullBooking.payment_state.replace(/_/g, " ") : "—"}
                />
                {fullBooking.recurring_id ? (
                  <p className="pt-1">
                    <Link
                      href={`/admin/bookings?recurring_id=${encodeURIComponent(fullBooking.recurring_id)}`}
                      className="font-semibold text-blue-800 underline dark:text-blue-200"
                    >
                      All bookings for this plan
                    </Link>
                  </p>
                ) : null}
              </div>
            ) : null}
            {fullBooking.payment_mismatch ? (
              <p className="mb-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-950">
                payment_mismatch: visit total was raised after payment was recorded — collect the difference from the customer,
                then use <strong>Mark as Paid</strong> for the full updated visit total. When the collected amount covers the
                quote, this flag clears automatically.
              </p>
            ) : null}
            <DetailRow label="Base price" value={`R ${basePrice.toLocaleString("en-ZA")}`} />
            <DetailRow label="Extras total" value={`R ${extrasPrice.toLocaleString("en-ZA")}`} />
            {fullBooking.equipment_required ? (
              <>
                <div className="my-2 border-t border-zinc-200" />
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Equipment</p>
                <DetailRow
                  label="Equipment delivery"
                  value={
                    fullBooking.manual_quote_required
                      ? "Manual quote required"
                      : `R ${Number(fullBooking.equipment_logistics_fee ?? 0).toLocaleString("en-ZA")}`
                  }
                />
                {fullBooking.equipment_distance_km != null ? (
                  <DetailRow label="Distance" value={`${fullBooking.equipment_distance_km} km`} />
                ) : null}
                {fullBooking.equipment_fee_override_reason ? (
                  <DetailRow label="Fee override reason" value={fullBooking.equipment_fee_override_reason} />
                ) : null}
              </>
            ) : null}
            {v2PricingLines ? (
              <>
                <div className="my-2 border-t border-zinc-200" />
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Customer breakdown (v2)</p>
                {v2PricingLines.map((line) => (
                  <DetailRow
                    key={line.label}
                    label={line.label}
                    value={line.value}
                    strong={line.emphasis}
                  />
                ))}
              </>
            ) : null}
            <div className="my-2 border-t border-zinc-200" />
            <div className="flex items-center justify-between"><span className="text-xs text-zinc-500">TOTAL</span><span className="text-2xl font-bold text-emerald-700">R {total.toLocaleString("en-ZA")}</span></div>
            {cleanerTotalZar != null ? (
              <DetailRow label="Cleaner earnings (stored/projected)" value={`R ${cleanerTotalZar.toLocaleString("en-ZA")}`} />
            ) : null}
            {companyRevenueZar != null ? (
              <DetailRow label="Company revenue" value={`R ${companyRevenueZar.toLocaleString("en-ZA")}`} />
            ) : null}
          </DetailCard>
          <DetailCard title="Cleaner payout">
            {cleanerPayoutCard.pending || cleanerTotalZar == null ? (
              <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800">
                Pending payout calculation
              </p>
            ) : (
              <>
                <DetailRow
                  label={cleanerPayoutCard.payoutLabel}
                  value={`R ${cleanerPayoutZar!.toLocaleString("en-ZA")}`}
                />
                <DetailRow label="Cleaner bonus" value={`R ${cleanerBonusZar.toLocaleString("en-ZA")}`} />
                <DetailRow label="Total cleaner earnings" value={`R ${cleanerTotalZar.toLocaleString("en-ZA")}`} strong />
                <DetailRow
                  label="Company revenue"
                  value={companyRevenueZar == null ? "—" : `R ${companyRevenueZar.toLocaleString("en-ZA")}`}
                />
                <DetailRow
                  label="Payout model"
                  value={`${fullBooking.payout_type ?? "percentage"}${
                    typeof fullBooking.payout_percentage === "number"
                      ? ` · ${Math.round(fullBooking.payout_percentage * 100)}%`
                      : ""
                  }`}
                />
                {cleanerPayoutCard.projected ? (
                  <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-400">
                    Shown from visit total before payout fields are stored on this booking (new-cleaner rate until tenure is
                    known). Final amounts appear after earnings persist.
                  </p>
                ) : null}
                {cleanerPayoutCard.teamPool ? (
                  <p className="mt-2 text-xs text-zinc-500">
                    Per-member shares follow the team roster / member payout rows; booking-level legacy{" "}
                    <code className="text-[11px]">cleaner_payout_cents</code> stays 0 for this model.
                  </p>
                ) : null}
                {earningsDisplay && earningsDisplay.per_cleaner.length > 0 ? (
                  <div className="mt-4 space-y-2 border-t border-zinc-100 pt-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Per-cleaner payout</p>
                    {earningsDisplay.per_cleaner.map((row) => (
                      <DetailRow
                        key={row.cleaner_id}
                        label={`${row.cleaner_name ?? row.cleaner_id.slice(0, 8)}${row.role === "lead" ? " (lead)" : ""}`}
                        value={`R ${row.total_zar.toLocaleString("en-ZA")}${
                          row.bonus_zar > 0 ? ` incl. R ${row.bonus_zar.toLocaleString("en-ZA")} bonus` : ""
                        }`}
                      />
                    ))}
                    {earningsDisplay.deductions_total_zar > 0 ? (
                      <DetailRow
                        label="Deductions"
                        value={`R ${earningsDisplay.deductions_total_zar.toLocaleString("en-ZA")}`}
                      />
                    ) : null}
                  </div>
                ) : null}
              </>
            )}
          </DetailCard>
        </section>

        <aside className="col-span-12 lg:col-span-4">
          <div className="space-y-6 lg:sticky lg:top-20">
            <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-semibold text-zinc-900">Actions</h2>
              <div className="mt-4 space-y-2">
                <button type="button" onClick={() => void openAssignModal()} className="w-full rounded-lg bg-zinc-900 px-3 py-2 text-sm font-semibold text-white transition hover:bg-zinc-700">{isAssigned ? "Reassign cleaner" : "Assign cleaner"}</button>
                <button
                  type="button"
                  onClick={() => openEditDetailsModal()}
                  disabled={
                    Boolean(editBookingClientBlockReason) || editDetailsBusy || fixEarningsBusy || resetEarningsBusy || statusBusy !== null
                  }
                  title={editBookingClientBlockReason ?? undefined}
                  className="w-full rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-sm font-semibold text-violet-900 transition hover:bg-violet-100 disabled:opacity-60"
                >
                  Edit booking
                </button>
                <button type="button" onClick={() => setRescheduleOpen(true)} className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50">Reschedule</button>
                <button type="button" onClick={handleContactCustomer} className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50">Contact customer</button>
                <button
                  type="button"
                  onClick={() => {
                    setMarkPaidMethod("cash");
                    setMarkPaidReference("");
                    setMarkPaidAmountZar("");
                    setMarkPaidSettlementMode("full");
                    setMarkPaidDepositReason("");
                    setMarkPaidModalOpen(true);
                  }}
                  disabled={!canMarkPaid || markPaidBusy || statusBusy !== null}
                  title={!canMarkPaid ? "Already paid or booking cannot accept payment." : undefined}
                  className="w-full rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-900 transition hover:bg-emerald-100 disabled:opacity-50"
                >
                  Mark as Paid
                </button>
                {fullBooking.is_recurring_generated &&
                adminOperational?.operationalPhase === "pending_payment_recurring" ? (
                  <button
                    type="button"
                    onClick={() => void handleRetryRecurringCharge()}
                    disabled={retryChargeBusy || statusBusy !== null}
                    className="w-full rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-900 transition hover:bg-blue-100 disabled:opacity-50"
                  >
                    {retryChargeBusy ? (
                      <span className="inline-flex items-center gap-2">
                        <Loader2 size={14} className="animate-spin" />
                        Queueing…
                      </span>
                    ) : (
                      "Retry Paystack charge (next cron)"
                    )}
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => void handleFixEarnings()}
                  disabled={fixEarningsBusy || statusBusy !== null}
                  className="w-full rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-800 transition hover:bg-blue-100 disabled:opacity-60"
                >
                  {fixEarningsBusy ? (
                    <span className="inline-flex items-center gap-2">
                      <Loader2 size={14} className="animate-spin" />
                      Fixing…
                    </span>
                  ) : (
                    "Fix earnings"
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setResetEarningsModalOpen(true)}
                  disabled={
                    Boolean(resetEarningsClientBlockReason) || resetEarningsBusy || fixEarningsBusy || statusBusy !== null
                  }
                  title={resetEarningsClientBlockReason ?? undefined}
                  className="w-full rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900 transition hover:bg-amber-100 disabled:opacity-60"
                >
                  Reset & recompute
                </button>
                {resetEarningsClientBlockReason ? (
                  <p className="text-xs leading-snug text-amber-900">{resetEarningsClientBlockReason}</p>
                ) : null}
                {adminOperational?.canAdminOverride && adminOperational.overrideReason ? (
                  <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs leading-snug text-amber-950">
                    <span className="font-semibold">Admin override available: </span>
                    {adminOperational.overrideReason} Completing here records an explicit admin lifecycle override (audited).
                  </p>
                ) : null}
                {showAdminMarkComplete ? (
                  <button type="button" onClick={() => void setStatusOptimistic("completed")} disabled={statusBusy !== null} className="w-full rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-60">
                    {statusBusy === "completed" ? <span className="inline-flex items-center gap-2"><Loader2 size={14} className="animate-spin" />Saving…</span> : "Mark as completed"}
                  </button>
                ) : null}
                {showAdminMarkCancel ? (
                  <button type="button" onClick={() => void setStatusOptimistic("cancelled")} disabled={statusBusy !== null} className="w-full rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700 transition hover:bg-rose-100 disabled:opacity-60">
                    {statusBusy === "cancelled" ? <span className="inline-flex items-center gap-2"><Loader2 size={14} className="animate-spin" />Saving…</span> : "Cancel booking"}
                  </button>
                ) : null}
              </div>
            </section>
          </div>
        </aside>
      </main>


    </div>
      )}

      {editDetailsModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-zinc-200 bg-white p-5 shadow-xl">
            <h3 className="text-lg font-semibold text-zinc-900">Edit booking</h3>
            <p className="mt-2 text-sm text-zinc-600">
              New total will be recalculated automatically from the catalog snapshot locked on this booking.
            </p>
            {adminOperational?.operationalPhase === "active" ? (
              <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
                This job is in progress — only admin notes can be edited.
              </p>
            ) : null}
            {editPricePreviewLoading ? (
              <p className="mt-3 flex items-center gap-2 text-sm text-zinc-600">
                <Loader2 size={14} className="animate-spin" />
                Calculating new total…
              </p>
            ) : editPricePreviewHttpError ? (
              <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-950">
                <p>{editPricePreviewHttpError}</p>
                <button
                  type="button"
                  className="mt-2 text-sm font-semibold text-rose-900 underline"
                  onClick={() => setEditPricePreviewRetry((n) => n + 1)}
                >
                  Retry preview
                </button>
              </div>
            ) : editPricePreview ? (
              <div className="mt-3 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-800">
                <p>
                  <span className="text-zinc-500">Old:</span>{" "}
                  <strong>R {(editPricePreview.old_total_cents / 100).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                  {" · "}
                  <span className="text-zinc-500">New:</span>{" "}
                  <strong>R {(editPricePreview.new_total_cents / 100).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                  {editPricePreview.delta_cents !== 0 ? (
                    <span className={editPricePreview.delta_cents > 0 ? " text-amber-800" : " text-emerald-800"}>
                      {" "}
                      ({editPricePreview.delta_cents > 0 ? "+" : ""}
                      R{" "}
                      {(Math.abs(editPricePreview.delta_cents) / 100).toLocaleString("en-ZA", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                      )
                    </span>
                  ) : null}
                </p>
                {editPricePreview.paid && editPricePreview.delta_cents > 0 ? (
                  <p className="mt-2 text-xs text-amber-950">
                    Customer has already paid R{" "}
                    {(editPricePreview.old_total_cents / 100).toLocaleString("en-ZA", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                    . Collect an additional R{" "}
                    {(editPricePreview.delta_cents / 100).toLocaleString("en-ZA", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}{" "}
                    after repricing — tick the confirmation below.
                  </p>
                ) : null}
              </div>
            ) : null}
            <div className="mt-4 grid grid-cols-2 gap-3">
              <label className="block text-sm font-medium text-zinc-800">
                Bedrooms
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={editBedrooms}
                  disabled={adminOperational?.operationalPhase === "active"}
                  onChange={(e) => setEditBedrooms(Math.max(1, Math.min(10, Math.round(Number(e.target.value) || 1))))}
                  className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm disabled:bg-zinc-100 disabled:text-zinc-500"
                />
              </label>
              <label className="block text-sm font-medium text-zinc-800">
                Bathrooms
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={editBathrooms}
                  disabled={adminOperational?.operationalPhase === "active"}
                  onChange={(e) => setEditBathrooms(Math.max(1, Math.min(10, Math.round(Number(e.target.value) || 1))))}
                  className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm disabled:bg-zinc-100 disabled:text-zinc-500"
                />
              </label>
            </div>
            <div className="mt-4">
              <p className="text-sm font-medium text-zinc-800">Extras</p>
              <div className="mt-2 max-h-48 space-y-2 overflow-y-auto rounded-lg border border-zinc-100 bg-zinc-50/80 p-3">
                {BOOKING_EXTRA_CHECKBOX_SLUGS.map((slug) => (
                  <label
                    key={slug}
                    className={`flex items-center gap-2 text-sm text-zinc-800 ${
                      adminOperational?.operationalPhase === "active" ? "cursor-not-allowed opacity-60" : "cursor-pointer"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={editExtrasSlugs.includes(slug)}
                      disabled={adminOperational?.operationalPhase === "active"}
                      onChange={() => toggleEditExtra(slug)}
                      className="rounded border-zinc-300"
                    />
                    <span className="font-mono text-xs">{slug}</span>
                  </label>
                ))}
              </div>
            </div>
            {editPricePreview?.requires_collect_confirm ? (
              <label className="mt-3 flex cursor-pointer items-start gap-2 text-sm text-zinc-800">
                <input
                  type="checkbox"
                  checked={confirmCollectAdditional}
                  onChange={(e) => setConfirmCollectAdditional(e.target.checked)}
                  className="mt-1 rounded border-zinc-300"
                />
                <span>I confirm the customer should be asked to pay the additional amount above (repricing will flag payment_mismatch for ops).</span>
              </label>
            ) : null}
            <label className="mt-4 block text-sm font-medium text-zinc-800">
              Admin notes
              <textarea
                value={editAdminNotes}
                onChange={(e) => setEditAdminNotes(e.target.value)}
                rows={3}
                className="mt-1 w-full resize-y rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                placeholder="Ops notes (stored on booking snapshot)"
              />
            </label>
            <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
              {editPricePreview && !editPricePreviewLoading && editPricePreview.delta_cents !== 0 && !editSaveBlockedByPreview ? (
                <span
                  className={`mr-auto text-sm font-semibold tabular-nums ${
                    editPricePreview.delta_cents > 0 ? "text-amber-800" : "text-emerald-800"
                  }`}
                >
                  Δ {editPricePreview.delta_cents > 0 ? "+" : "−"}R{" "}
                  {(Math.abs(editPricePreview.delta_cents) / 100).toLocaleString("en-ZA", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </span>
              ) : null}
              <button
                type="button"
                disabled={editDetailsBusy}
                onClick={() => setEditDetailsModalOpen(false)}
                className="rounded-md bg-zinc-100 px-3 py-1.5 text-sm font-medium text-zinc-700"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={editDetailsBusy || editSaveBlockedByPreview}
                title={editSaveBlockedByPreview ? "Wait for preview or fix preview errors before saving." : undefined}
                onClick={() => void handleEditDetailsConfirm()}
                className="rounded-md bg-violet-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-violet-800 disabled:opacity-50"
              >
                {editDetailsBusy ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 size={14} className="animate-spin" />
                    Saving…
                  </span>
                ) : (
                  "Save changes"
                )}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {markPaidModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-5 shadow-xl">
            <h3 className="text-lg font-semibold text-zinc-900">Mark as paid</h3>
            <p className="mt-2 text-sm text-zinc-600">
              {markPaidSettlementMode === "deposit" ? (
                <>
                  Record or update the deposit only. The booking stays <strong className="font-medium text-zinc-700">unpaid</strong>{" "}
                  until you use <strong className="font-medium text-zinc-700">Full settlement</strong>.
                </>
              ) : (
                <>
                  Log cash, EFT, or off-platform payment as <strong className="font-medium text-zinc-700">fully paid</strong>. Amount defaults from{" "}
                  <code className="text-xs">total_price</code>, then <code className="text-xs">total_paid_cents</code>—enter a figure
                  below only if there’s no quote or it’s wrong.
                </>
              )}
            </p>
            {existingDepositZar != null ? (
              <p className="mt-2 text-xs text-zinc-500">
                Recorded deposit: <strong className="text-zinc-700">{formatZar(existingDepositZar)}</strong>
                {markPaidSettlementMode === "deposit" ? " · Confirm replaces this amount." : null}
              </p>
            ) : null}
            <div className="mt-4 flex rounded-lg border border-zinc-200 bg-zinc-50 p-0.5">
              <button
                type="button"
                onClick={() => setMarkPaidSettlementMode("full")}
                className={`flex-1 rounded-md px-2 py-2 text-sm font-medium transition ${
                  markPaidSettlementMode === "full"
                    ? "bg-white text-zinc-900 shadow-sm"
                    : "text-zinc-600 hover:text-zinc-900"
                }`}
              >
                Full settlement
              </button>
              <button
                type="button"
                onClick={() => setMarkPaidSettlementMode("deposit")}
                className={`flex-1 rounded-md px-2 py-2 text-sm font-medium transition ${
                  markPaidSettlementMode === "deposit"
                    ? "bg-white text-zinc-900 shadow-sm"
                    : "text-zinc-600 hover:text-zinc-900"
                }`}
              >
                Deposit only
              </button>
            </div>
            <div className="mt-4 space-y-3">
              <label className="block text-sm font-medium text-zinc-800">
                {markPaidSettlementMode === "deposit" ? "Deposit amount (ZAR)" : "Amount (ZAR), optional override"}
                <input
                  type="text"
                  inputMode="decimal"
                  value={markPaidAmountZar}
                  onChange={(e) => setMarkPaidAmountZar(e.target.value)}
                  placeholder={fullBooking ? `e.g. ${money(fullBooking) > 0 ? String(money(fullBooking)) : "450"}` : "450"}
                  className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                />
              </label>
              {markPaidSettlementMode === "deposit" ? (
                <label className="block text-sm font-medium text-zinc-800">
                  Reason (required)
                  <textarea
                    value={markPaidDepositReason}
                    onChange={(e) => setMarkPaidDepositReason(e.target.value)}
                    rows={2}
                    placeholder="e.g. Customer paid 50% upfront via EFT"
                    className="mt-1 w-full resize-y rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                  />
                </label>
              ) : null}
              <label className="block text-sm font-medium text-zinc-800">
                Method
                <select
                  value={markPaidMethod}
                  onChange={(e) => setMarkPaidMethod(e.target.value as "cash" | "zoho" | "eft")}
                  className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm"
                >
                  <option value="cash">Cash</option>
                  <option value="eft">EFT</option>
                  <option value="zoho">External / off-platform</option>
                </select>
              </label>
              {markPaidMethod === "zoho" || markPaidMethod === "eft" ? (
                <label className="block text-sm font-medium text-zinc-800">
                  Reference (optional)
                  <input
                    type="text"
                    value={markPaidReference}
                    onChange={(e) => setMarkPaidReference(e.target.value)}
                    placeholder={
                      markPaidMethod === "eft"
                        ? "Bank reference or proof ID"
                        : "Invoice or payment reference"
                    }
                    className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                  />
                </label>
              ) : null}
            </div>
            <div className="mt-4 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-800">
              <p className="font-semibold text-zinc-900">Confirm</p>
              <ul className="mt-1 list-inside list-disc text-xs text-zinc-700">
                <li>
                  {markPaidSettlementMode === "deposit" ? "Deposit: " : "Amount: "}
                  <strong>
                    {markPaidSettlementMode === "deposit"
                      ? markPaidPreviewZar != null && markPaidPreviewZar > 0
                        ? formatZar(markPaidPreviewZar)
                        : "— (enter amount)"
                      : markPaidPreviewZar != null && markPaidPreviewZar > 0
                        ? formatZar(markPaidPreviewZar)
                        : "— (server will resolve from quote)"}
                  </strong>
                </li>
                <li>
                  Method:{" "}
                  <strong>
                    {markPaidMethod === "zoho" ? "External" : markPaidMethod === "eft" ? "EFT" : "Cash"}
                  </strong>
                </li>
                {(markPaidMethod === "zoho" || markPaidMethod === "eft") && markPaidReference.trim() ? (
                  <li>
                    Reference: <strong>{markPaidReference.trim().slice(0, 80)}</strong>
                  </li>
                ) : null}
              </ul>
              {markPaidSettlementMode === "deposit" ? (
                <p className="mt-2 text-xs text-zinc-600">
                  Does not mark the booking fully paid — use <strong>Full settlement</strong> when the balance is settled.
                </p>
              ) : null}
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                disabled={markPaidBusy}
                onClick={() => {
                  setMarkPaidModalOpen(false);
                  setMarkPaidReference("");
                  setMarkPaidAmountZar("");
                  setMarkPaidDepositReason("");
                  setMarkPaidSettlementMode("full");
                }}
                className="rounded-md bg-zinc-100 px-3 py-1.5 text-sm font-medium text-zinc-700"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={markPaidBusy}
                onClick={() => void handleMarkPaidConfirm()}
                className="rounded-md bg-emerald-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
              >
                {markPaidBusy ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 size={14} className="animate-spin" />
                    Saving…
                  </span>
                ) : markPaidSettlementMode === "deposit" ? (
                  "Save deposit"
                ) : (
                  "Confirm"
                )}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {resetEarningsModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-5 shadow-xl">
            <h3 className="text-lg font-semibold text-zinc-900">Reset & recompute earnings</h3>
            <p className="mt-3 text-sm text-zinc-700">
              <span className="mr-1" aria-hidden>
                ⚠️
              </span>
              This will recalculate earnings and may change payout amounts.
            </p>
            <p className="mt-2 text-xs text-zinc-500">
              Blocked if this booking is in a paid or frozen payout batch, or if any cleaner earnings row is no longer
              pending.
            </p>
            {resetEarningsClientBlockReason ? (
              <p className="mt-2 rounded-md bg-amber-50 px-2 py-1.5 text-xs font-medium text-amber-950">
                {resetEarningsClientBlockReason}
              </p>
            ) : null}
            {earningsPreviewLoading ? (
              <p className="mt-3 flex items-center gap-2 text-sm text-zinc-600">
                <Loader2 size={14} className="animate-spin" />
                Loading earnings preview…
              </p>
            ) : earningsPreview?.preview_unavailable_reason === "team_job" ? (
              <p className="mt-3 text-sm text-zinc-600">Dry-run preview is not available for team jobs.</p>
            ) : earningsPreview?.preview_unavailable_reason === "no_line_items" ? (
              <p className="mt-3 text-sm text-amber-900">
                No line items on this booking — line-total preview cannot be computed.
              </p>
            ) : earningsPreview?.computed_preview ? (
              <p className="mt-3 text-sm font-medium text-zinc-800">
                After reset, line-based cleaner total would be about{" "}
                {formatZar(centsToZar(earningsPreview.computed_preview.cleaner_earnings_total_cents) ?? 0)} (shown now{" "}
                {formatZar(
                  centsToZar(
                    earningsPreview.current.display_earnings_cents ??
                      earningsPreview.current.cleaner_earnings_total_cents ??
                      0,
                  ) ?? 0,
                )}
                , Δ {earningsPreview.computed_preview.diff_cents >= 0 ? "+" : ""}
                {formatZar(centsToZar(Math.abs(earningsPreview.computed_preview.diff_cents)) ?? 0)}).
              </p>
            ) : null}
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                disabled={resetEarningsBusy}
                onClick={() => setResetEarningsModalOpen(false)}
                className="rounded-md bg-zinc-100 px-3 py-1.5 text-sm font-medium text-zinc-700"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={resetEarningsBusy || Boolean(resetEarningsClientBlockReason)}
                onClick={() => void handleConfirmResetEarnings()}
                className="rounded-md bg-amber-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-amber-800 disabled:opacity-50"
              >
                {resetEarningsBusy ? "Working…" : "Confirm reset"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {fullBooking?.id ? (
        <EmergencyRosterReassignModal
          open={emergencyRosterOpen}
          onOpenChange={setEmergencyRosterOpen}
          bookingId={fullBooking.id}
          locked={Boolean(
            (fullBooking.cleaner_line_earnings_finalized_at ?? "").toString().trim().length > 0,
          )}
          initialRoster={bookingCleaners as EmergencyRosterCleanerRow[]}
          onSaved={(roster) => {
            setBookingCleaners(roster as BookingCleanerRow[]);
            setToast({ kind: "success", text: "Job roster updated." });
            setDetailRefresh((n) => n + 1);
          }}
        />
      ) : null}

      {teamModalOpen
        ? createPortal(
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="admin-team-modal-title"
              className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4"
              onClick={() => {
                if (!assigningTeam) {
                  setTeamModalOpen(false);
                  setTeamPickId(null);
                  setTeamModalError(null);
                }
              }}
            >
              <div
                className="w-full max-w-xl rounded-2xl border border-zinc-200 bg-white p-5 shadow-xl dark:border-zinc-700 dark:bg-zinc-900"
                onClick={(e) => e.stopPropagation()}
              >
                <h3 id="admin-team-modal-title" className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                  {fullBooking?.team_id ? "Change team" : "Assign team"}
                </h3>
                <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                  Overrides auto-dispatch for this booking. Per-member payouts are reset to the standard team rate.
                </p>
                {!teamModalLoading && !teamModalError ? (
                  <p className="mt-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs leading-relaxed text-zinc-700 dark:border-zinc-600 dark:bg-zinc-800/60 dark:text-zinc-200">
                    Deep and move bookings use the <span className="font-semibold">same team list</span> (manage teams under{" "}
                {basePath.startsWith("/office") ? "Office → Teams" : "Admin → Teams"}). Row counts still reflect members active on
                    the job date who pass this visit&apos;s capability gate
                    {teamAssignQualifiedLabel.trim() ? (
                      <>
                        {" "}
                        (<span className="font-semibold">{teamAssignQualifiedLabel}</span>)
                      </>
                    ) : null}
                    .
                  </p>
                ) : null}
                {teamModalLoading ? (
                  <div className="mt-6 flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-300">
                    <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
                    Loading teams…
                  </div>
                ) : null}
                {teamModalError ? (
                  <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-100">
                    <p>{teamModalError}</p>
                    <button
                      type="button"
                      disabled={teamModalLoading}
                      onClick={() => void loadTeamsForTeamModal()}
                      className="mt-2 text-sm font-semibold text-rose-950 underline hover:no-underline disabled:opacity-50 dark:text-rose-50"
                    >
                      Try again
                    </button>
                  </div>
                ) : null}
                <div className="mt-4 space-y-2">
                  <label htmlFor="admin-team-pick" className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                    Team
                  </label>
                  <select
                    id="admin-team-pick"
                    className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 disabled:opacity-60 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
                    value={teamPickId ?? ""}
                    onChange={(e) => setTeamPickId(e.target.value || null)}
                    disabled={assigningTeam || teamModalLoading}
                  >
                    <option value="">Select a team…</option>
                    {teamCandidates.map((t) => {
                      const activeN = t.active_member_count ?? t.member_count;
                      const qualN = t.qualified_member_count ?? t.member_count;
                      const qualBit =
                        teamAssignQualifiedLabel !== ""
                          ? `${activeN} active · ${qualN} qualified for ${teamAssignQualifiedLabel}`
                          : `${activeN} active · ${qualN} qualified`;
                      const inactive = t.team_active === false;
                      return (
                        <option key={t.id} value={t.id} disabled={!t.assignable}>
                          {t.name}
                          {inactive ? " · inactive" : ""} · {qualBit} · {t.used_slots_today}/{t.capacity_per_day} today
                          {!t.assignable ? " (cannot assign)" : ""}
                        </option>
                      );
                    })}
                  </select>
                </div>
                {!teamModalLoading && teamModalError === null && teamCandidates.length === 0 ? (
                  <div className="mt-2 space-y-2 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
                    <p>
                      No dispatch teams are showing — create an active Deep cleaning or Move cleaning team under Admin →
                      Teams, add members for this date, and ensure at least one passes the capability check for this visit
                      {teamAssignQualifiedLabel.trim() ? (
                        <>
                          {" "}
                          (<span className="font-medium text-zinc-700 dark:text-zinc-300">
                            {teamAssignQualifiedLabel}
                          </span>
                          ).
                        </>
                      ) : (
                        "."
                      )}
                    </p>
                    <p>
                      Create or activate teams under{" "}
                      <Link
                        href={basePath.startsWith("/office") ? "/office/teams" : "/admin/teams"}
                        className="font-semibold text-emerald-700 underline hover:text-emerald-800 dark:text-emerald-400"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {basePath.startsWith("/office") ? "Office → Teams" : "Admin → Teams"}
                      </Link>
                      , then open this dialog again.
                    </p>
                  </div>
                ) : null}
                <div className="mt-4 flex justify-end gap-2">
                  <button
                    type="button"
                    disabled={assigningTeam}
                    onClick={() => {
                      setTeamModalOpen(false);
                      setTeamPickId(null);
                      setTeamModalError(null);
                    }}
                    className="rounded-md bg-zinc-100 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={assigningTeam || teamModalLoading || !teamPickId || Boolean(teamModalError)}
                    onClick={() => void handleAssignTeam()}
                    className="rounded-md bg-emerald-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
                  >
                    {assigningTeam ? "Saving…" : fullBooking?.team_id ? "Save team" : "Assign team"}
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}

      {assignModalOpen && fullBooking ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-xl rounded-2xl border border-zinc-200 bg-white p-5 shadow-xl">
            <h3 className="text-lg font-semibold text-zinc-900">Assign cleaner</h3>
            <p className="mt-2 text-sm text-zinc-600">
              Send a job offer for the cleaner to accept, or assign directly to skip the offer and notify them immediately.
              Slot checks run before assigning; use override only when you accept the risk.
            </p>
            {cleanerOptions.length === 0 ? (
              <p className="mt-4 rounded-lg bg-zinc-50 p-3 text-sm text-zinc-500">Loading cleaners…</p>
            ) : (
              <AdminAssignForm
                booking={{
                  id: fullBooking.id,
                  date: fullBooking.date,
                  time: fullBooking.time,
                  duration_minutes: fullBooking.duration_minutes,
                }}
                bookingId={fullBooking.id}
                cleaners={toCleanerAssignOptions(cleanerOptions)}
                onDone={onAssignOfferDone}
                onError={onAssignOfferError}
              />
            )}
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setAssignModalOpen(false)} className="rounded-md bg-zinc-100 px-3 py-1.5 text-sm font-medium text-zinc-700">Close</button>
            </div>
          </div>
        </div>
      ) : null}

      {rescheduleOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-5 shadow-xl">
            <h3 className="text-lg font-semibold text-zinc-900">Reschedule booking</h3>
            <p className="mt-2 text-sm text-zinc-600">Update the visit date and time for this booking.</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-medium text-zinc-500">
                Date
                <input
                  type="date"
                  value={draftDate}
                  onChange={(e) => setDraftDate(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm"
                />
              </label>
              <label className="text-xs font-medium text-zinc-500">
                Time
                <input
                  type="time"
                  value={draftTime}
                  onChange={(e) => setDraftTime(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm"
                />
              </label>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                disabled={savingSchedule}
                onClick={() => setRescheduleOpen(false)}
                className="rounded-md bg-zinc-100 px-3 py-1.5 text-sm font-medium text-zinc-700"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={savingSchedule}
                onClick={() => void saveScheduleInline()}
                className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
              >
                {savingSchedule ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 size={14} className="animate-spin" />
                    Saving…
                  </span>
                ) : (
                  "Save schedule"
                )}
              </button>
            </div>
          </div>
        </div>
      ) : null}

    </>
  );
}

function formatBookingReference(bookingId: string): string {
  const segment = bookingId.split("-")[0]?.slice(0, 7) ?? bookingId.slice(0, 7);
  return `#B-${segment.toUpperCase()}`;
}

function formatAdminDate(value: string): string {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-ZA", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function compactScheduleRelative(date: string | null | undefined, time: string | null | undefined): string | null {
  if (!date || !time) return null;
  const dt = new Date(`${date}T${time.slice(0, 5)}:00+02:00`);
  if (Number.isNaN(dt.getTime())) return null;
  const mins = Math.round((dt.getTime() - Date.now()) / 60000);
  const abs = Math.abs(mins);
  if (mins >= 0) {
    if (mins < 60) return `${mins}m`;
    if (mins < 1440) return `${Math.floor(mins / 60)}h`;
    return `${Math.floor(mins / 1440)}d`;
  }
  if (abs < 60) return `${abs}m ago`;
  if (abs < 1440) return `${Math.floor(abs / 60)}h ago`;
  return `${Math.floor(abs / 1440)}d ago`;
}

function shortPaymentStatusLabel(label: string): string {
  const normalized = label.trim().toLowerCase();
  if (normalized.includes("pending")) return "Pending payment";
  if (normalized.includes("paid") || normalized.includes("success")) return "Paid";
  if (normalized.includes("overdue")) return "Overdue";
  if (normalized.includes("deposit")) return "Deposit";
  return label.length > 16 ? label.split(/\s+/).slice(0, 2).join(" ") : label;
}

function formatAdminTime(value: string): string {
  const raw = value.trim();
  if (!raw) return "—";
  return raw.slice(0, 5);
}

function formatAdminDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-ZA", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function splitBookingLocation(location: string | null | undefined): { primary: string; secondary: string } {
  const raw = location?.trim() ?? "";
  if (!raw) return { primary: "Location not set", secondary: "—" };
  const parts = raw.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length <= 1) return { primary: raw, secondary: raw };
  return { primary: parts[0] ?? raw, secondary: parts.slice(1).join(", ") };
}

function titleCase(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1).toLowerCase()}`)
    .join(" ");
}

function AdminInfoCard({
  title,
  icon: Icon,
  children,
  footer,
}: {
  title: string;
  icon: ComponentType<{ className?: string }>;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <Card className="rounded-2xl border-slate-200 shadow-sm">
      <CardHeader className="flex-row items-center gap-2 space-y-0 pb-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
          <Icon className="h-4 w-4" />
        </div>
        <CardTitle className="text-sm font-semibold">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">{children}</CardContent>
      {footer ? <CardFooter className="border-t border-slate-100 pt-3">{footer}</CardFooter> : null}
    </Card>
  );
}

function OfficeTimelineStepRow({ step, isLast }: { step: OfficeTimelineStep; isLast: boolean }) {
  const dotClass = step.done
    ? "bg-emerald-500 text-white"
    : step.active
      ? "bg-amber-100 text-amber-600 ring-2 ring-amber-300"
      : "bg-slate-200 text-slate-400";

  return (
    <div className="grid grid-cols-[1.25rem_1fr] gap-3">
      <div className="flex flex-col items-center">
        <span className={["mt-0.5 flex h-5 w-5 items-center justify-center rounded-full", dotClass].join(" ")}>
          {step.done ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Circle className="h-2.5 w-2.5 fill-current" />}
        </span>
        {!isLast ? <span className={["h-10 w-px", step.done ? "bg-emerald-200" : "bg-slate-200"].join(" ")} /> : null}
      </div>
      <div className="pb-4">
        <p className="text-sm font-semibold text-slate-900">{step.label}</p>
        <p className="text-xs text-slate-500">{step.hint ?? step.time}</p>
      </div>
    </div>
  );
}

function DetailCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <h2 className="mb-4 text-lg font-semibold text-zinc-900">{title}</h2>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function DetailRow({ label, value, mono = false, strong = false }: { label: string; value: ReactNode; mono?: boolean; strong?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-xs text-zinc-500">{label}</span>
      <span className={["text-base font-medium text-zinc-800", mono ? "font-mono text-xs" : "", strong ? "font-semibold" : ""].join(" ")}>{value}</span>
    </div>
  );
}

function FlagPill({ flag }: { flag: string }) {
  const klass =
    flag === "VIP"
      ? "bg-violet-100 text-violet-800"
      : flag === "NO CLEANER"
        ? "bg-amber-100 text-amber-800"
        : flag === "PAYMENT ISSUE"
          ? "bg-rose-100 text-rose-800"
          : "bg-orange-100 text-orange-800";
  return <span className={["rounded-full px-3 py-1 text-xs font-semibold", klass].join(" ")}>{flag}</span>;
}
