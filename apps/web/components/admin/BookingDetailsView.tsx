"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, Loader2, MapPin, Pencil, Phone, TriangleAlert } from "lucide-react";
import BookingActionsDropdown from "@/components/admin/BookingActionsDropdown";
import {
  assignCleaner,
  assignTeamToBookingAdmin,
  fetchCleaners,
  updateBooking,
  updateBookingStatus,
  type AdminCleanerRow,
} from "@/lib/admin/dashboard";
import { CLEANER_UX_VARIANTS, type CleanerUxVariant } from "@/lib/cleaner/cleanerOfferUxVariant";
import { issueReportReasonDisplay } from "@/lib/cleaner/cleanerJobIssueReasons";
import { BOOKING_EXTRA_ID_SET } from "@/lib/pricing/extrasConfig";
import { BOOKING_ROSTER_LOCKED_HINT } from "@/lib/admin/bookingRosterLockedMessage";
import { assignmentSourceLabel } from "@/lib/admin/assignmentDisplay";
import { getSupabaseBrowser } from "@/lib/supabase/browser";
import { AdminBookingLiveLocation } from "@/components/admin/AdminBookingLiveLocation";
import {
  EmergencyRosterReassignModal,
  type EmergencyRosterCleanerRow,
} from "@/components/admin/EmergencyRosterReassignModal";

type BookingSeed = { id: string };

type BookingDetails = {
  id: string;
  customer_email: string | null;
  service: string | null;
  date: string | null;
  time: string | null;
  location: string | null;
  total_paid_zar: number | null;
  amount_paid_cents: number | null;
  cleaner_payout_cents?: number | null;
  cleaner_bonus_cents?: number | null;
  company_revenue_cents?: number | null;
  payout_percentage?: number | null;
  payout_type?: string | null;
  is_test?: boolean | null;
  status: string | null;
  /** Auto-dispatch funnel; terminal `unassignable` / `no_cleaner` need manual assign or reset. */
  dispatch_status?: string | null;
  /** Cleaner lifecycle: `on_my_way` enables live GPS tracking. */
  cleaner_response_status?: string | null;
  user_id: string | null;
  cleaner_id: string | null;
  /** Customer checkout pick; assignment finalizes in `cleaner_id` after accept. */
  selected_cleaner_id?: string | null;
  assignment_type?: string | null;
  fallback_reason?: string | null;
  team_id?: string | null;
  is_team_job?: boolean | null;
  booking_snapshot?: unknown;
  duration_hours?: number | null;
  /** Legacy string slugs or persisted `{ slug, name, price }` rows from checkout. */
  extras?: unknown[] | null;
  created_at: string;
  phone?: string | null;
  /** Admin bypassed duplicate-slot guard (intentional second row on same slot). */
  admin_force_slot_override?: boolean | null;
  /** Immutable checkout / admin pricing snapshot (JSON). */
  price_snapshot?: unknown;
  /** Invoice-style booking payout lifecycle (`pending` | `eligible` | `paid`). */
  payout_status?: string | null;
  payment_completed_at?: string | null;
  payment_status?: string | null;
  /** Off-platform settlement: cash | zoho (set by admin mark-paid). */
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
  assigned_at?: string | null;
  /** Set when cleaner accepts in app (with `cleaner_response_status` accepted). */
  accepted_at?: string | null;
  en_route_at?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
};

type TeamSummary = { id: string; name: string; member_count: number | null };

type TeamAssignCandidate = {
  id: string;
  name: string;
  capacity_per_day: number;
  member_count: number;
  used_slots_today: number;
  remaining_slots_today: number;
  assignable: boolean;
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
  if (typeof booking.total_paid_zar === "number") return booking.total_paid_zar;
  return Math.round((booking.amount_paid_cents ?? 0) / 100);
}

function centsToZar(cents: number | null | undefined): number | null {
  if (cents == null || !Number.isFinite(Number(cents))) return null;
  return Math.round(Number(cents) / 100);
}

type PriceSnapshotV1View = {
  v: 1;
  service_type: string;
  base_price: number;
  extras: { id: string; name: string; price: number }[];
  total_price: number;
};

function parsePriceSnapshotV1(raw: unknown): PriceSnapshotV1View | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (o.v !== 1) return null;
  const service_type = typeof o.service_type === "string" ? o.service_type : "";
  const base_price = typeof o.base_price === "number" && Number.isFinite(o.base_price) ? Math.round(o.base_price) : NaN;
  const total_price = typeof o.total_price === "number" && Number.isFinite(o.total_price) ? Math.round(o.total_price) : NaN;
  if (!service_type || !Number.isFinite(base_price) || !Number.isFinite(total_price)) return null;
  const extrasRaw = Array.isArray(o.extras) ? o.extras : [];
  const extras: { id: string; name: string; price: number }[] = [];
  for (const x of extrasRaw) {
    if (!x || typeof x !== "object" || Array.isArray(x)) continue;
    const e = x as Record<string, unknown>;
    const id = typeof e.id === "string" ? e.id : "";
    const name = typeof e.name === "string" ? e.name : id || "Extra";
    const price = typeof e.price === "number" && Number.isFinite(e.price) ? Math.round(e.price) : 0;
    extras.push({ id: id || "extra", name, price });
  }
  return { v: 1, service_type, base_price, extras, total_price };
}

function formatZar(n: number): string {
  return `R ${n.toLocaleString("en-ZA")}`;
}

function statusBadgeClass(status: string | null): string {
  const st = (status ?? "").toLowerCase();
  if (st === "completed") return "bg-emerald-100 text-emerald-800";
  if (st === "cancelled" || st === "failed") return "bg-rose-100 text-rose-800";
  if (st === "assigned") return "bg-blue-100 text-blue-800";
  return "bg-amber-100 text-amber-800";
}

/** Human label when payment was recorded off-platform (cash / Zoho). */
function adminOffPlatformPaidBadgeLabel(booking: BookingDetails): string | null {
  const pm = String(booking.payment_method ?? "").trim().toLowerCase();
  if (pm === "cash") return "Paid (Cash)";
  if (pm === "zoho") {
    const ext = String(booking.payment_reference_external ?? "").trim();
    if (!ext) return "Paid (Zoho)";
    const short = ext.length > 42 ? `${ext.slice(0, 42)}…` : ext;
    return `Paid (Zoho: ${short})`;
  }
  const ref = String(booking.paystack_reference ?? "").trim().toLowerCase();
  if (ref.startsWith("cash_")) return "Paid (Cash)";
  if (ref.startsWith("zoho_")) {
    const tail = ref.replace(/^zoho_/, "");
    const ext = tail.length > 42 ? `${tail.slice(0, 42)}…` : tail;
    return ext ? `Paid (Zoho: ${ext})` : "Paid (Zoho)";
  }
  return null;
}

function formatShortTs(iso: string | null | undefined): string {
  if (!iso || !String(iso).trim()) return "—";
  const d = new Date(String(iso).trim());
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-ZA", { dateStyle: "medium", timeStyle: "short" });
}

/** Solo cleaner_id, team roster, or status shows job is operationally assigned (not “searching”). */
function adminBookingAssignmentStepDone(b: BookingDetails): boolean {
  if (Boolean(String(b.cleaner_id ?? "").trim())) return true;
  if (b.is_team_job === true && Boolean(String(b.team_id ?? "").trim())) return true;
  const st = String(b.status ?? "")
    .trim()
    .toLowerCase();
  if (["assigned", "confirmed", "in_progress", "completed"].includes(st) && Boolean(String(b.assigned_at ?? "").trim())) {
    return true;
  }
  return false;
}

function adminBookingCleanerAcceptedDone(b: BookingDetails): boolean {
  const crs = String(b.cleaner_response_status ?? "")
    .trim()
    .toLowerCase();
  if (crs === "accepted" || crs === "on_my_way" || crs === "started" || crs === "completed") return true;
  return Boolean(String(b.accepted_at ?? "").trim());
}

function BookingPaymentTimeline({ booking }: { booking: BookingDetails }) {
  const paidAt = booking.payment_completed_at;
  const offPlatform = adminOffPlatformPaidBadgeLabel(booking);
  const paidTitle = offPlatform ?? (paidAt ? "Paid (checkout)" : "Pending payment");
  const payoutPs = String(booking.payout_status ?? "").trim().toLowerCase();
  const payoutLabel =
    payoutPs === "paid" ? "Paid out to cleaner" : payoutPs === "eligible" ? "Eligible for payout" : payoutPs ? payoutPs : "—";

  const assignedDone = adminBookingAssignmentStepDone(booking);
  const assignedDetail = (() => {
    if (Boolean(String(booking.cleaner_id ?? "").trim())) {
      return formatShortTs(booking.assigned_at ?? null);
    }
    if (booking.is_team_job === true && Boolean(String(booking.team_id ?? "").trim())) {
      return booking.assigned_at ? `Team · ${formatShortTs(booking.assigned_at)}` : "Team roster assigned";
    }
    return assignedDone ? formatShortTs(booking.assigned_at ?? null) : "No cleaner yet";
  })();

  const acceptedDone = adminBookingCleanerAcceptedDone(booking);
  const acceptedDetail = acceptedDone
    ? String(booking.accepted_at ?? "").trim()
      ? formatShortTs(booking.accepted_at)
      : "Acknowledged"
    : "Awaiting cleaner in app";

  const steps: { key: string; label: string; detail: string; done: boolean }[] = [
    { key: "created", label: "Created", detail: formatShortTs(booking.created_at), done: true },
    {
      key: "paid",
      label: paidTitle,
      detail: paidAt ? formatShortTs(paidAt) : "Not recorded",
      done: Boolean(paidAt),
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
      done: String(booking.status ?? "").toLowerCase() === "in_progress" || String(booking.status ?? "").toLowerCase() === "completed",
    },
    {
      key: "completed",
      label: "Completed",
      detail: formatShortTs(booking.completed_at ?? null),
      done: String(booking.status ?? "").toLowerCase() === "completed",
    },
    { key: "payout", label: "Payout", detail: payoutLabel, done: payoutPs === "paid" },
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
      name && price != null ? `${name} · R${price.toLocaleString("en-ZA")}` : name || slug || "Extra";
    const key = slug || name || JSON.stringify(o);
    return { key, label };
  }
  return { key: "extra", label: "Extra" };
}

async function rescheduleBooking(bookingId: string, newDate: string, newTime: string) {
  return Promise.resolve({ bookingId, newDate, newTime });
}

export default function BookingDetailsView({ booking, onClose }: { booking: BookingSeed; onClose?: () => void }) {
  const router = useRouter();
  const bookingId = booking.id;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fullBooking, setFullBooking] = useState<BookingDetails | null>(null);
  const [cleaner, setCleaner] = useState<Cleaner | null>(null);
  /** From GET `selected_cleaner` — customer pick when not same row as assigned `cleaner`. */
  const [selectedCleaner, setSelectedCleaner] = useState<Cleaner | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [cleanerOptions, setCleanerOptions] = useState<AdminCleanerRow[]>([]);
  const [assigningCleanerId, setAssigningCleanerId] = useState<string | null>(null);
  const [statusBusy, setStatusBusy] = useState<"completed" | "cancelled" | null>(null);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);
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
  const [cleanerIssueReports, setCleanerIssueReports] = useState<CleanerIssueReportRow[]>([]);
  const [supportsTeamAssignment, setSupportsTeamAssignment] = useState(false);
  const [teamSummary, setTeamSummary] = useState<TeamSummary | null>(null);
  const [teamModalOpen, setTeamModalOpen] = useState(false);
  const [teamCandidates, setTeamCandidates] = useState<TeamAssignCandidate[]>([]);
  const [teamPickId, setTeamPickId] = useState<string | null>(null);
  const [assigningTeam, setAssigningTeam] = useState(false);
  const [bookingCleaners, setBookingCleaners] = useState<BookingCleanerRow[]>([]);
  const [emergencyRosterOpen, setEmergencyRosterOpen] = useState(false);
  const [repairRosterBusy, setRepairRosterBusy] = useState(false);
  const [detailRefresh, setDetailRefresh] = useState(0);
  const [resetDispatchBusy, setResetDispatchBusy] = useState(false);
  const [fixEarningsBusy, setFixEarningsBusy] = useState(false);
  const [resetEarningsBusy, setResetEarningsBusy] = useState(false);
  const [resetEarningsModalOpen, setResetEarningsModalOpen] = useState(false);
  const [markPaidModalOpen, setMarkPaidModalOpen] = useState(false);
  const [markPaidMethod, setMarkPaidMethod] = useState<"cash" | "zoho">("cash");
  const [markPaidReference, setMarkPaidReference] = useState("");
  const [markPaidAmountZar, setMarkPaidAmountZar] = useState("");
  const [markPaidBusy, setMarkPaidBusy] = useState(false);
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

  useEffect(() => {
    if (cleanerIssueReports.length === 0) return;
    const id = window.setInterval(() => setIssueReportNowMs(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, [cleanerIssueReports.length]);

  useEffect(() => {
    async function loadDetails() {
      if (!bookingId) {
        setError("Missing booking ID.");
        setLoading(false);
        return;
      }
      setLoading(true);
      setFleetBestUxVariant(null);
      setLedgerCleanerEarnings([]);
      setSelectedCleaner(null);
      const sb = getSupabaseBrowser();
      const { data: sessionData } = (await sb?.auth.getSession()) ?? { data: { session: null } };
      const token = sessionData.session?.access_token;
      if (!token) {
        setError("Please sign in as an admin.");
        setLoading(false);
        return;
      }

      const [res, anRes] = await Promise.all([
        fetch(`/api/admin/bookings/${encodeURIComponent(bookingId)}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch("/api/admin/analytics", { headers: { Authorization: `Bearer ${token}` } }),
      ]);

      const [json, anJson] = await Promise.all([
        res.json() as Promise<{
          booking?: BookingDetails;
          cleaner?: Cleaner | null;
          selected_cleaner?: Cleaner | null;
          userProfile?: UserProfile | null;
          dispatch_offers?: DispatchOfferAdminRow[];
          cleaner_issue_reports?: CleanerIssueReportRow[];
          cleaner_earnings?: Array<{ id: string; status?: string | null }>;
          supports_team_assignment?: boolean;
          team_summary?: TeamSummary | null;
          error?: string;
        }>,
        anRes.json().catch(() => ({})) as Promise<{ experimentBestUxVariant?: string | null }>,
      ]);

      if (anRes.ok) {
        const raw = anJson.experimentBestUxVariant;
        if (raw === "unknown") setFleetBestUxVariant("unknown");
        else if (typeof raw === "string" && (CLEANER_UX_VARIANTS as readonly string[]).includes(raw)) {
          setFleetBestUxVariant(raw as CleanerUxVariant);
        } else {
          setFleetBestUxVariant(null);
        }
      } else {
        setFleetBestUxVariant(null);
      }
      if (!res.ok) {
        setError(json.error ?? "Could not load booking.");
        setLoading(false);
        return;
      }
      setFullBooking(json.booking ?? null);
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
      setDispatchOffers(Array.isArray(json.dispatch_offers) ? json.dispatch_offers : []);
      setCleanerIssueReports(Array.isArray(json.cleaner_issue_reports) ? json.cleaner_issue_reports : []);
      setIssueReportNowMs(Date.now());
      setSupportsTeamAssignment(json.supports_team_assignment === true);
      setTeamSummary(json.team_summary ?? null);
      let roster: BookingCleanerRow[] = [];
      try {
        const cr = await fetch(`/api/admin/bookings/${encodeURIComponent(bookingId)}/cleaners`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const cj = (await cr.json()) as { booking_cleaners?: BookingCleanerRow[] };
        if (cr.ok && Array.isArray(cj.booking_cleaners)) roster = cj.booking_cleaners;
      } catch {
        roster = [];
      }
      setBookingCleaners(roster);
      setDraftDate(json.booking?.date ?? "");
      setDraftTime((json.booking?.time ?? "").slice(0, 5));
      setError(null);
      setLoading(false);
    }
    void loadDetails();
  }, [bookingId, detailRefresh]);

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
        const sb = getSupabaseBrowser();
        const token = (await sb?.auth.getSession())?.data.session?.access_token;
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
      const sb = getSupabaseBrowser();
      const token = (await sb?.auth.getSession())?.data.session?.access_token;
      if (!token) {
        setNotificationLogsLoading(false);
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
      setNotificationLogsLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [bookingId, fullBooking]);

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
    if (!fullBooking) return false;
    const s = (fullBooking.status ?? "").toLowerCase();
    if (s === "cancelled" || s === "failed") return false;
    const p = fullBooking.payment_completed_at;
    if (p != null && String(p).trim() !== "") return false;
    return true;
  }, [fullBooking]);

  const markPaidPreviewZar = useMemo(() => {
    if (!fullBooking) return null;
    const raw = markPaidAmountZar.trim();
    if (raw) {
      const z = Number(raw.replace(",", "."));
      if (Number.isFinite(z) && z > 0) return z;
    }
    return money(fullBooking);
  }, [fullBooking, markPaidAmountZar]);

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
    if ((fullBooking.status ?? "").trim().toLowerCase() === "in_progress") return false;
    const seed = editDetailsSeedRef.current;
    const exEq = [...editExtrasSlugs].sort().join("|") === [...seed.extras].sort().join("|");
    return editBedrooms !== seed.bedrooms || editBathrooms !== seed.bathrooms || !exEq;
  }, [editDetailsModalOpen, fullBooking, editBedrooms, editBathrooms, editExtrasSlugs]);

  const editSaveBlockedByPreview =
    editDetailsModalOpen &&
    editPricingDirty &&
    (editPricePreviewLoading || editPricePreview == null || editPricePreviewHttpError != null);

  useEffect(() => {
    if (!editDetailsModalOpen || !fullBooking?.id) return;
    const inProg = (fullBooking.status ?? "").trim().toLowerCase() === "in_progress";
    if (inProg) {
      setEditPricePreview(null);
      return;
    }
    let cancelled = false;
    const t = window.setTimeout(async () => {
      setEditPricePreviewLoading(true);
      setEditPricePreviewHttpError(null);
      try {
        const sb = getSupabaseBrowser();
        const token = (await sb?.auth.getSession())?.data.session?.access_token;
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
    fullBooking?.status,
    editBedrooms,
    editBathrooms,
    editExtrasSlugs,
    editPricePreviewRetry,
  ]);

  const handleEditDetailsConfirm = async () => {
    if (!fullBooking?.id) return;
    const inProg = (fullBooking.status ?? "").trim().toLowerCase() === "in_progress";
    if (!inProg && editSaveBlockedByPreview) {
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
    if (inProg) {
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
      const sb = getSupabaseBrowser();
      const token = (await sb?.auth.getSession())?.data.session?.access_token;
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
            <Link href="/admin/bookings" className="mt-4 inline-block text-sm font-medium text-emerald-700">
              Back to bookings
            </Link>
          )}
        </div>
      </div>
    );
  }

  const total = money(fullBooking);
  const basePrice = Math.round(total * 0.85);
  const extrasPrice = Math.max(total - basePrice, 0);
  const cleanerPayoutZar = centsToZar(fullBooking.cleaner_payout_cents);
  const cleanerBonusZar = centsToZar(fullBooking.cleaner_bonus_cents) ?? 0;
  const cleanerTotalZar = cleanerPayoutZar == null ? null : cleanerPayoutZar + cleanerBonusZar;
  const companyRevenueZar = centsToZar(fullBooking.company_revenue_cents);
  const isAssigned = !!fullBooking.cleaner_id;
  const assignmentSummaryLine = assignmentSourceLabel({
    cleaner_id: fullBooking.cleaner_id ?? null,
    status: fullBooking.status ?? null,
    assignment_type: fullBooking.assignment_type ?? null,
    fallback_reason: fullBooking.fallback_reason ?? null,
  });
  const selectedCleanerIdRaw = String(fullBooking.selected_cleaner_id ?? "").trim();
  const hasSelectedCleanerUuid = /^[0-9a-f-]{36}$/i.test(selectedCleanerIdRaw);
  const dispatchSt = (fullBooking.dispatch_status ?? "").toLowerCase();
  const needsDispatchManualAttention =
    !isAssigned &&
    (fullBooking.status ?? "").toLowerCase() === "pending" &&
    ["failed", "unassignable", "no_cleaner"].includes(dispatchSt);

  const dispatchHoldHeadline =
    dispatchSt === "no_cleaner"
      ? "No cleaner available for this slot or area."
      : dispatchSt === "unassignable"
        ? "No cleaner accepted offers — automatic dispatch stopped (retry cap or exhausted)."
        : "Automatic dispatch failed for this booking.";

  const markIssueReportResolved = async (reportId: string) => {
    if (!bookingId) return;
    setIssueResolveBusyId(reportId);
    try {
      const sb = getSupabaseBrowser();
      const token = (await sb?.auth.getSession())?.data.session?.access_token;
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
      const sb = getSupabaseBrowser();
      const token = (await sb?.auth.getSession())?.data.session?.access_token;
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

  const handleFixEarnings = async () => {
    if (!fullBooking?.id) return;
    setFixEarningsBusy(true);
    try {
      const sb = getSupabaseBrowser();
      const token = (await sb?.auth.getSession())?.data.session?.access_token;
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
      const sb = getSupabaseBrowser();
      const token = (await sb?.auth.getSession())?.data.session?.access_token;
      if (!token) {
        setToast({ kind: "error", text: "Please sign in as an admin." });
        return;
      }
      const body: { method: "cash" | "zoho"; reference?: string; amount_cents?: number } = { method: markPaidMethod };
      if (markPaidMethod === "zoho" && markPaidReference.trim()) {
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
        settlement?: {
          amount_cents: number;
          total_paid_zar: number;
          method: string;
          payment_reference_external: string | null;
          paystack_reference: string;
        };
      };
      if (!res.ok) {
        setToast({ kind: "error", text: json.error ?? "Could not mark as paid." });
        return;
      }
      if (json.skipped && json.reason === "already_paid") {
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
      setMarkPaidModalOpen(false);
      setMarkPaidReference("");
      setMarkPaidAmountZar("");
      setDetailRefresh((n) => n + 1);
    } finally {
      setMarkPaidBusy(false);
    }
  };

  const handleConfirmResetEarnings = async () => {
    if (!fullBooking?.id) return;
    setResetEarningsBusy(true);
    try {
      const sb = getSupabaseBrowser();
      const token = (await sb?.auth.getSession())?.data.session?.access_token;
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
      setToast({
        kind: "success",
        text: status === "completed" ? "Booking completed" : status === "cancelled" ? "Booking cancelled" : "Booking updated",
      });
    } catch (e) {
      setFullBooking((p) => (p ? { ...p, status: prev } : p));
      setToast({ kind: "error", text: e instanceof Error ? e.message : "Something went wrong" });
    } finally {
      setStatusBusy(null);
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

  const openTeamModal = async () => {
    if (!bookingId) return;
    setTeamModalOpen(true);
    setTeamPickId(null);
    setTeamCandidates([]);
    const sb = getSupabaseBrowser();
    const token = (await sb?.auth.getSession())?.data.session?.access_token;
    if (!token) {
      setToast({ kind: "error", text: "Please sign in as an admin." });
      setTeamModalOpen(false);
      return;
    }
    try {
      const res = await fetch(`/api/admin/bookings/${encodeURIComponent(bookingId)}/assign-team`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const j = (await res.json()) as { teams?: TeamAssignCandidate[]; error?: string };
      if (!res.ok) throw new Error(j.error ?? "Could not load teams.");
      setTeamCandidates(Array.isArray(j.teams) ? j.teams : []);
    } catch (e) {
      setToast({ kind: "error", text: e instanceof Error ? e.message : "Could not load teams." });
      setTeamModalOpen(false);
    }
  };

  const handleAssignTeam = async () => {
    if (!fullBooking?.id || !teamPickId) {
      setToast({ kind: "error", text: "Select a team." });
      return;
    }
    const picked = teamCandidates.find((t) => t.id === teamPickId);
    if (!picked?.assignable) {
      setToast({ kind: "error", text: "That team cannot take this booking (capacity or empty roster)." });
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
      const sb = getSupabaseBrowser();
      const token = (await sb?.auth.getSession())?.data.session?.access_token;
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

  const handleAssignCleaner = async (selected: AdminCleanerRow) => {
    if (!fullBooking?.id || !selected?.id) {
      const msg = "Missing booking or cleaner id.";
      if (process.env.NODE_ENV === "development") {
        console.error("Assign cleaner:", { cleanerId: selected?.id, jobId: fullBooking?.id });
      }
      setToast({ kind: "error", text: msg });
      return;
    }
    if (process.env.NODE_ENV === "development") {
      console.log("Assign cleaner:", { cleanerId: selected.id, jobId: fullBooking.id });
    }
    const prevCleanerId = fullBooking.cleaner_id;
    const prevCleaner = cleaner;
    setAssigningCleanerId(selected.id);
    setFullBooking((p) => (p ? { ...p, cleaner_id: selected.id, status: "assigned" } : p));
    setCleaner({
      id: selected.id,
      full_name: selected.full_name,
      status: selected.status ?? "available",
      rating: selected.rating ?? null,
      jobs_completed: selected.jobs_completed ?? null,
    });
    try {
      await assignCleaner(fullBooking.id, selected.id);
      setAssignModalOpen(false);
      setEditingCleanerInline(false);
      setToast({ kind: "success", text: "Cleaner assigned" });
      setDetailRefresh((n) => n + 1);
    } catch (e) {
      setFullBooking((p) => (p ? { ...p, cleaner_id: prevCleanerId } : p));
      setCleaner(prevCleaner);
      setToast({ kind: "error", text: e instanceof Error ? e.message : "Something went wrong" });
    } finally {
      setAssigningCleanerId(null);
    }
  };

  const saveScheduleInline = async () => {
    if (!draftDate || !draftTime) {
      setToast({ kind: "error", text: "Date and time are required" });
      return;
    }
    const prevDate = fullBooking.date;
    const prevTime = fullBooking.time;
    setSavingSchedule(true);
    setFullBooking((p) => (p ? { ...p, date: draftDate, time: `${draftTime}:00` } : p));
    try {
      await updateBooking(fullBooking.id, { date: draftDate, time: draftTime });
      setEditingSchedule(false);
      setToast({ kind: "success", text: "Schedule updated" });
    } catch (e) {
      setFullBooking((p) => (p ? { ...p, date: prevDate, time: prevTime } : p));
      setToast({ kind: "error", text: e instanceof Error ? e.message : "Something went wrong" });
    } finally {
      setSavingSchedule(false);
    }
  };

  const handleContactCustomer = () => {
    const phone = fullBooking.phone ?? userProfile?.phone ?? null;
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

  return (
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
              <span className={["rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-wide", statusBadgeClass(fullBooking.status)].join(" ")}>
                {(fullBooking.status ?? "pending").toUpperCase()}
              </span>
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
                  onAssign={() => void openAssignModal()}
                  onReassign={() => void openAssignModal()}
                  onReschedule={() => setRescheduleOpen(true)}
                  onComplete={() => void setStatusOptimistic("completed")}
                  onCancel={() => void setStatusOptimistic("cancelled")}
                />
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-7xl grid-cols-12 gap-6 px-6 py-6">
        {needsDispatchManualAttention ? (
          <div
            className="col-span-12 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 shadow-sm"
            role="status"
          >
            <p className="font-semibold text-amber-950">Dispatch needs attention</p>
            <p className="mt-1 text-amber-900/90">{dispatchHoldHeadline}</p>
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
            <DetailRow label="Phone" value={fullBooking.phone ?? userProfile?.phone ?? "—"} />
            <DetailRow label="User ID" value={fullBooking.user_id ?? "—"} mono />
          </DetailCard>
          <DetailCard title="Service">
            <p className="text-base font-medium text-zinc-900">{fullBooking.service ?? "—"}</p>
            <DetailRow label="Duration" value={fullBooking.duration_hours ? `${fullBooking.duration_hours} hrs` : "Not specified"} />
            <div>
              <p className="text-xs text-zinc-500">Extras</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {Array.isArray(fullBooking.extras) && fullBooking.extras.length ? (
                  fullBooking.extras.map((item) => {
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
              <p className="text-xs text-zinc-500">Starts in</p>
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
            status={fullBooking.status}
            cleanerResponseStatus={fullBooking.cleaner_response_status ?? null}
            cleanerId={fullBooking.cleaner_id}
          />
          <DetailCard title="Pricing snapshot">
            {(() => {
              const snap = fullBooking ? parsePriceSnapshotV1(fullBooking.price_snapshot) : null;
              if (!snap) {
                return (
                  <div className="rounded-lg border border-amber-200/80 bg-amber-50/90 px-3 py-2 text-sm text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-50">
                    <span className="inline-flex items-center gap-1.5 font-medium">
                      <TriangleAlert size={14} aria-hidden />
                      No snapshot (legacy)
                    </span>
                    <p className="mt-1 text-xs font-normal text-amber-900/90 dark:text-amber-100/85">
                      This booking was created before immutable pricing snapshots were stored. Totals on the booking
                      row still apply; this section does not recompute from current catalog prices.
                    </p>
                  </div>
                );
              }
              return (
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between gap-4">
                    <dt className="text-zinc-500">Service type</dt>
                    <dd className="font-mono text-zinc-900 dark:text-zinc-100">{snap.service_type}</dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt className="text-zinc-500">Base (rooms &amp; core)</dt>
                    <dd className="font-medium text-zinc-900 dark:text-zinc-100">{formatZar(snap.base_price)}</dd>
                  </div>
                  <div>
                    <dt className="text-zinc-500">Extras</dt>
                    <dd className="mt-1">
                      {snap.extras.length === 0 ? (
                        <p className="text-zinc-500">None</p>
                      ) : (
                        <ul className="divide-y divide-zinc-100 rounded-md border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-700">
                          {snap.extras.map((ex) => (
                            <li key={`${ex.id}-${ex.name}`} className="flex justify-between gap-4 px-2 py-1.5 text-zinc-800 dark:text-zinc-200">
                              <span>{ex.name}</span>
                              <span className="font-medium tabular-nums">{formatZar(ex.price)}</span>
                            </li>
                          ))}
                        </ul>
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
            <p className="text-sm text-zinc-600">
              Logged from the cleaner app (&quot;Report a problem&quot;). Also written to system logs. Configure the
              dispatch alert webhook and CLEANER_ISSUE_OPS_NOTIFY_EMAIL if you want instant ops pings.
            </p>
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
                  const customerWa = digitsForWhatsApp(userProfile?.phone ?? fullBooking.phone ?? null);
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
          <DetailCard title="Notification timeline">
            <p className="text-sm text-zinc-600">
              Outbound delivery attempts for this booking (email, WhatsApp, SMS).{" "}
              <Link
                href="/admin/notification-logs"
                className="font-medium text-blue-600 underline-offset-2 hover:underline dark:text-blue-400"
              >
                Full logs
              </Link>
            </p>
            {notificationLogsLoading ? (
              <p className="text-sm text-zinc-500">Loading notification history…</p>
            ) : notificationLogs.length === 0 ? (
              <p className="text-sm text-zinc-500">No notification log rows for this booking yet.</p>
            ) : (
              <ul className="space-y-2 border-t border-zinc-100 pt-3">
                {notificationLogs.map((row) => {
                  const pl = row.payload && typeof row.payload === "object" ? row.payload : {};
                  const retriedFrom = typeof pl.retried_from === "string" ? pl.retried_from : null;
                  const fb = pl.automated_channel_fallback === true;
                  return (
                    <li
                      key={row.id}
                      className="flex flex-wrap items-baseline justify-between gap-2 rounded-lg border border-zinc-100 bg-zinc-50/80 px-3 py-2 text-sm"
                    >
                      <div className="min-w-0 flex-1">
                        <span className="font-medium text-zinc-800">
                          {row.channel} · {row.template_key}
                        </span>
                        {row.role ? (
                          <span className="ml-2 text-xs text-zinc-500">({row.role})</span>
                        ) : null}
                        {row.event_type ? (
                          <span className="ml-2 text-xs text-zinc-500">{row.event_type}</span>
                        ) : null}
                        {retriedFrom ? (
                          <span className="mt-1 block font-mono text-[11px] text-zinc-500">
                            ↳ retry of {retriedFrom.slice(0, 8)}…
                          </span>
                        ) : null}
                        {fb ? (
                          <span className="mt-1 block text-[11px] font-medium text-amber-800">Automated SMS after WhatsApp</span>
                        ) : null}
                      </div>
                      <div className="shrink-0 text-right">
                        <span
                          className={
                            row.status === "sent"
                              ? "text-xs font-semibold text-emerald-700"
                              : "text-xs font-semibold text-rose-700"
                          }
                        >
                          {row.status}
                        </span>
                        <p className="text-[11px] text-zinc-500">
                          {row.created_at
                            ? new Date(row.created_at).toLocaleString("en-ZA", {
                                day: "2-digit",
                                month: "short",
                                hour: "2-digit",
                                minute: "2-digit",
                                hour12: false,
                              })
                            : "—"}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </DetailCard>
          <DetailCard title="Dispatch offers">
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
              </div>
            ) : selectedCleaner || hasSelectedCleanerUuid ? (
              <div className="space-y-3">
                <div className="rounded-lg border border-sky-200 bg-sky-50/90 p-3 dark:border-sky-900/60 dark:bg-sky-950/40">
                  <p className="text-xs font-semibold uppercase tracking-wide text-sky-900 dark:text-sky-200">
                    Customer&apos;s choice (pending acceptance)
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
                  Customer originally requested
                </p>
                <p className="mt-1 text-sm font-medium text-zinc-900 dark:text-zinc-100">
                  {selectedCleaner.full_name ?? selectedCleaner.id}
                </p>
                <p className="mt-1 font-mono text-[11px] text-zinc-500">{selectedCleaner.id}</p>
              </div>
            ) : null}
            {editingCleanerInline ? (
              <div className="mt-3 rounded-lg border border-zinc-200 bg-zinc-50 p-2 transition">
                <div className="max-h-56 space-y-1 overflow-y-auto">
                  {cleanerOptions.length === 0 ? (
                    <p className="px-2 py-3 text-sm text-zinc-500">Loading cleaners…</p>
                  ) : (
                    cleanerOptions.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        disabled={assigningCleanerId !== null}
                        onClick={() => {
                          void handleAssignCleaner(c);
                        }}
                        className="flex w-full items-center justify-between rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-left hover:bg-zinc-50 disabled:opacity-60"
                      >
                        <div>
                          <p className="text-sm font-medium text-zinc-900">{c.full_name ?? "Unnamed cleaner"}</p>
                          <p className="text-xs text-zinc-500">{typeof c.rating === "number" ? `${c.rating.toFixed(1)} ★` : "No rating"}</p>
                        </div>
                        <span className="text-xs text-zinc-500">{(c.status ?? "busy").toLowerCase() === "available" ? "Available" : "Busy"}</span>
                      </button>
                    ))
                  )}
                </div>
                <div className="mt-2 flex justify-end">
                  <button
                    type="button"
                    disabled={assigningCleanerId !== null}
                    onClick={() => setEditingCleanerInline(false)}
                    className="rounded-md bg-zinc-100 px-2 py-1 text-xs font-medium text-zinc-700"
                  >
                    Close
                  </button>
                </div>
              </div>
            ) : null}
          </DetailCard>
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
              <div className="mt-3">
                <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Job roster</p>
                {bookingCleaners.length > 0 ? (
                  <ul className="mt-2 space-y-1.5">
                    {bookingCleaners.map((r) => (
                      <li
                        key={r.id}
                        className="flex items-center justify-between gap-2 rounded-md border border-zinc-100 bg-zinc-50 px-2 py-1.5"
                      >
                        <span className="truncate text-sm font-medium text-zinc-900">
                          {r.cleaner_name ?? r.cleaner_id}
                        </span>
                        <span
                          className={
                            String(r.role).toLowerCase() === "lead"
                              ? "shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900"
                              : "shrink-0 rounded-full bg-zinc-200 px-2 py-0.5 text-[11px] font-semibold text-zinc-700"
                          }
                        >
                          {String(r.role).toLowerCase() === "lead" ? "Lead" : "Member"}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1 text-xs text-zinc-500">
                    No roster rows yet. Assign a team or use &quot;Edit job roster&quot; to add cleaners.
                  </p>
                )}
                {fullBooking.team_id && bookingCleaners.length === 0 ? (
                  <button
                    type="button"
                    disabled={repairRosterBusy}
                    onClick={() => void repairRosterFromTeam()}
                    className="mt-2 w-full rounded-md border border-amber-300 bg-amber-50 px-2 py-1.5 text-xs font-semibold text-amber-950 hover:bg-amber-100 disabled:opacity-50"
                  >
                    {repairRosterBusy ? "Repairing roster…" : "Repair roster from team"}
                  </button>
                ) : null}
              </div>
              <div className="mt-4 rounded-lg border border-red-200 bg-red-50/80 p-3 dark:border-red-900/50 dark:bg-red-950/20">
                <p className="text-xs font-bold uppercase tracking-wide text-red-900 dark:text-red-200">
                  Emergency reassign
                </p>
                <p className="mt-1 text-xs text-red-900/90 dark:text-red-100/90">
                  Last-minute roster changes on this booking only. Does not edit team templates.
                </p>
                <button
                  type="button"
                  onClick={() => setEmergencyRosterOpen(true)}
                  className="mt-2 w-full rounded-md border border-red-300 bg-white px-3 py-1.5 text-xs font-semibold text-red-950 hover:bg-red-50 dark:border-red-800 dark:bg-red-950/40 dark:text-red-50 dark:hover:bg-red-950/70"
                >
                  Edit roster
                </button>
              </div>
              <div className="mt-3 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => void openTeamModal()}
                  className="w-full rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-zinc-700"
                >
                  Change team
                </button>
              </div>
            </DetailCard>
          ) : null}
          <DetailCard title="Flags">
            <div className="flex flex-wrap gap-2">
              {flags.length ? flags.map((flag) => <FlagPill key={flag} flag={flag} />) : <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">No issues</span>}
            </div>
          </DetailCard>
          <DetailCard title="Pricing">
            {fullBooking.payment_mismatch ? (
              <p className="mb-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-950">
                payment_mismatch: visit total was raised after payment was recorded — collect the difference from the customer,
                then use <strong>Mark as Paid</strong> for the full updated visit total. When the collected amount covers the
                quote, this flag clears automatically.
              </p>
            ) : null}
            <DetailRow label="Base price" value={`R ${basePrice.toLocaleString("en-ZA")}`} />
            <DetailRow label="Extras total" value={`R ${extrasPrice.toLocaleString("en-ZA")}`} />
            <div className="my-2 border-t border-zinc-200" />
            <div className="flex items-center justify-between"><span className="text-xs text-zinc-500">TOTAL</span><span className="text-2xl font-bold text-emerald-700">R {total.toLocaleString("en-ZA")}</span></div>
          </DetailCard>
          <DetailCard title="Cleaner payout">
            {cleanerTotalZar == null ? (
              <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800">
                Pending payout calculation
              </p>
            ) : (
              <>
                <DetailRow label="Cleaner payout" value={`R ${cleanerPayoutZar!.toLocaleString("en-ZA")}`} />
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
                    setMarkPaidModalOpen(true);
                  }}
                  disabled={!canMarkPaid || markPaidBusy || statusBusy !== null}
                  title={!canMarkPaid ? "Already paid or booking cannot accept payment." : undefined}
                  className="w-full rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-900 transition hover:bg-emerald-100 disabled:opacity-50"
                >
                  Mark as Paid
                </button>
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
                <button type="button" onClick={() => void setStatusOptimistic("completed")} disabled={statusBusy !== null} className="w-full rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-60">
                  {statusBusy === "completed" ? <span className="inline-flex items-center gap-2"><Loader2 size={14} className="animate-spin" />Saving…</span> : "Mark as completed"}
                </button>
                <button type="button" onClick={() => void setStatusOptimistic("cancelled")} disabled={statusBusy !== null} className="w-full rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700 transition hover:bg-rose-100 disabled:opacity-60">
                  {statusBusy === "cancelled" ? <span className="inline-flex items-center gap-2"><Loader2 size={14} className="animate-spin" />Saving…</span> : "Cancel booking"}
                </button>
              </div>
            </section>
          </div>
        </aside>
      </main>

      {editDetailsModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-zinc-200 bg-white p-5 shadow-xl">
            <h3 className="text-lg font-semibold text-zinc-900">Edit booking</h3>
            <p className="mt-2 text-sm text-zinc-600">
              New total will be recalculated automatically from the catalog snapshot locked on this booking.
            </p>
            {(fullBooking.status ?? "").trim().toLowerCase() === "in_progress" ? (
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
                  disabled={(fullBooking.status ?? "").trim().toLowerCase() === "in_progress"}
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
                  disabled={(fullBooking.status ?? "").trim().toLowerCase() === "in_progress"}
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
                      (fullBooking.status ?? "").trim().toLowerCase() === "in_progress" ? "cursor-not-allowed opacity-60" : "cursor-pointer"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={editExtrasSlugs.includes(slug)}
                      disabled={(fullBooking.status ?? "").trim().toLowerCase() === "in_progress"}
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
              Record cash or Zoho settlement. By default the amount comes from <code className="text-xs">total_price</code>{" "}
              (ZAR) then <code className="text-xs">total_paid_cents</code>. Use the field below if the quote is missing.
            </p>
            <div className="mt-4 space-y-3">
              <label className="block text-sm font-medium text-zinc-800">
                Amount (ZAR), optional override
                <input
                  type="text"
                  inputMode="decimal"
                  value={markPaidAmountZar}
                  onChange={(e) => setMarkPaidAmountZar(e.target.value)}
                  placeholder={fullBooking ? `e.g. ${money(fullBooking) > 0 ? String(money(fullBooking)) : "450"}` : "450"}
                  className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                />
              </label>
              <label className="block text-sm font-medium text-zinc-800">
                Method
                <select
                  value={markPaidMethod}
                  onChange={(e) => setMarkPaidMethod(e.target.value === "zoho" ? "zoho" : "cash")}
                  className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm"
                >
                  <option value="cash">Cash</option>
                  <option value="zoho">Zoho</option>
                </select>
              </label>
              {markPaidMethod === "zoho" ? (
                <label className="block text-sm font-medium text-zinc-800">
                  Reference (optional)
                  <input
                    type="text"
                    value={markPaidReference}
                    onChange={(e) => setMarkPaidReference(e.target.value)}
                    placeholder="Invoice or payment reference"
                    className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                  />
                </label>
              ) : null}
            </div>
            <div className="mt-4 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-800">
              <p className="font-semibold text-zinc-900">Confirm</p>
              <ul className="mt-1 list-inside list-disc text-xs text-zinc-700">
                <li>
                  Amount:{" "}
                  <strong>
                    {markPaidPreviewZar != null && markPaidPreviewZar > 0
                      ? formatZar(markPaidPreviewZar)
                      : "— (server will resolve from quote)"}
                  </strong>
                </li>
                <li>
                  Method: <strong>{markPaidMethod === "zoho" ? "Zoho" : "Cash"}</strong>
                </li>
                {markPaidMethod === "zoho" && markPaidReference.trim() ? (
                  <li>
                    Reference: <strong>{markPaidReference.trim().slice(0, 80)}</strong>
                  </li>
                ) : null}
              </ul>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                disabled={markPaidBusy}
                onClick={() => {
                  setMarkPaidModalOpen(false);
                  setMarkPaidReference("");
                  setMarkPaidAmountZar("");
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
            setToast({ kind: "success", text: "Team updated successfully" });
            setDetailRefresh((n) => n + 1);
          }}
        />
      ) : null}

      {teamModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-xl rounded-2xl border border-zinc-200 bg-white p-5 shadow-xl">
            <h3 className="text-lg font-semibold text-zinc-900">Assign team</h3>
            <p className="mt-2 text-sm text-zinc-600">
              Overrides auto-dispatch for this booking. Per-member payouts are reset to the standard team rate.
            </p>
            <div className="mt-4 space-y-2">
              <label htmlFor="admin-team-pick" className="text-xs font-medium text-zinc-500">
                Team
              </label>
              <select
                id="admin-team-pick"
                className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900"
                value={teamPickId ?? ""}
                onChange={(e) => setTeamPickId(e.target.value || null)}
                disabled={assigningTeam}
              >
                <option value="">Select a team…</option>
                {teamCandidates.map((t) => (
                  <option key={t.id} value={t.id} disabled={!t.assignable}>
                    {t.name} · {t.member_count} members · {t.used_slots_today}/{t.capacity_per_day} today
                    {!t.assignable ? " (unavailable)" : ""}
                  </option>
                ))}
              </select>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                disabled={assigningTeam}
                onClick={() => {
                  setTeamModalOpen(false);
                  setTeamPickId(null);
                }}
                className="rounded-md bg-zinc-100 px-3 py-1.5 text-sm font-medium text-zinc-700"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={assigningTeam || !teamPickId}
                onClick={() => void handleAssignTeam()}
                className="rounded-md bg-emerald-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
              >
                {assigningTeam ? "Assigning…" : "Assign team"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {assignModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-xl rounded-2xl border border-zinc-200 bg-white p-5 shadow-xl">
            <h3 className="text-lg font-semibold text-zinc-900">Assign cleaner</h3>
            <p className="mt-2 text-sm text-zinc-600">Select an available cleaner for this booking.</p>
            <div className="mt-4 max-h-80 space-y-2 overflow-y-auto">
              {cleanerOptions.length === 0 ? (
                <p className="rounded-lg bg-zinc-50 p-3 text-sm text-zinc-500">No cleaners available.</p>
              ) : (
                cleanerOptions.map((c) => (
                  <button key={c.id} type="button" disabled={assigningCleanerId !== null} onClick={() => void handleAssignCleaner(c)} className="flex w-full items-center justify-between rounded-lg border border-zinc-200 px-3 py-2 text-left hover:bg-zinc-50 disabled:opacity-60">
                    <div>
                      <p className="text-sm font-medium text-zinc-900">{c.full_name ?? "Unnamed cleaner"}</p>
                      <p className="text-xs text-zinc-500">{typeof c.rating === "number" ? `${c.rating.toFixed(1)} ★` : "No rating"} · Jobs {c.jobs_completed ?? 0}</p>
                    </div>
                    <span className={["rounded-full px-2 py-0.5 text-xs font-semibold", (c.status ?? "").toLowerCase() === "available" ? "bg-emerald-100 text-emerald-800" : "bg-blue-100 text-blue-800"].join(" ")}>
                      {c.status ?? "busy"}
                    </span>
                  </button>
                ))
              )}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => { setAssignModalOpen(false); setAssigningCleanerId(null); }} className="rounded-md bg-zinc-100 px-3 py-1.5 text-sm font-medium text-zinc-700">Close</button>
            </div>
          </div>
        </div>
      ) : null}

      {rescheduleOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-5 shadow-xl">
            <h3 className="text-lg font-semibold text-zinc-900">Reschedule booking</h3>
            <p className="mt-2 text-sm text-zinc-600">Reschedule UI is scaffolded and ready for date/time controls.</p>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setRescheduleOpen(false)} className="rounded-md bg-zinc-100 px-3 py-1.5 text-sm font-medium text-zinc-700">Close</button>
              <button
                type="button"
                onClick={() => {
                  void rescheduleBooking(fullBooking.id, fullBooking.date ?? "", fullBooking.time ?? "");
                  setRescheduleOpen(false);
                  setToast({ kind: "success", text: "Reschedule flow prepared" });
                }}
                className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-semibold text-white"
              >
                Save scaffold
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {toast ? <Toast kind={toast.kind} text={toast.text} onClose={() => setToast(null)} /> : null}
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

function Toast({ kind, text, onClose }: { kind: "success" | "error" | "info"; text: string; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 2800);
    return () => clearTimeout(t);
  }, [onClose]);
  const barClass =
    kind === "success"
      ? "bg-emerald-600 text-white"
      : kind === "error"
        ? "bg-rose-600 text-white"
        : "bg-zinc-700 text-white";
  return (
    <div className="fixed bottom-4 right-4 z-[60]">
      <div className={["rounded-lg px-4 py-2 text-sm font-medium shadow-lg", barClass].join(" ")}>
        {text}
      </div>
    </div>
  );
}
