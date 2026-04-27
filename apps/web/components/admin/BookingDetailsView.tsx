"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Loader2, MapPin, Pencil, TriangleAlert } from "lucide-react";
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
import { getSupabaseBrowser } from "@/lib/supabase/browser";

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
  user_id: string | null;
  cleaner_id: string | null;
  team_id?: string | null;
  is_team_job?: boolean | null;
  booking_snapshot?: unknown;
  duration_hours?: number | null;
  /** Legacy string slugs or persisted `{ slug, name, price }` rows from checkout. */
  extras?: unknown[] | null;
  created_at: string;
  phone?: string | null;
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

function statusBadgeClass(status: string | null): string {
  const st = (status ?? "").toLowerCase();
  if (st === "completed") return "bg-emerald-100 text-emerald-800";
  if (st === "cancelled" || st === "failed") return "bg-rose-100 text-rose-800";
  if (st === "assigned") return "bg-blue-100 text-blue-800";
  return "bg-amber-100 text-amber-800";
}

function detailFlags(booking: BookingDetails, userProfile: UserProfile | null) {
  const flags: string[] = [];
  if ((userProfile?.tier ?? "").toLowerCase() === "gold" || (userProfile?.tier ?? "").toLowerCase() === "platinum") {
    flags.push("VIP");
  }
  if (!booking.cleaner_id) flags.push("NO CLEANER");
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
  const [supportsTeamAssignment, setSupportsTeamAssignment] = useState(false);
  const [teamSummary, setTeamSummary] = useState<TeamSummary | null>(null);
  const [teamModalOpen, setTeamModalOpen] = useState(false);
  const [teamCandidates, setTeamCandidates] = useState<TeamAssignCandidate[]>([]);
  const [teamPickId, setTeamPickId] = useState<string | null>(null);
  const [assigningTeam, setAssigningTeam] = useState(false);
  const [detailRefresh, setDetailRefresh] = useState(0);
  const [resetDispatchBusy, setResetDispatchBusy] = useState(false);

  useEffect(() => {
    async function loadDetails() {
      if (!bookingId) {
        setError("Missing booking ID.");
        setLoading(false);
        return;
      }
      setLoading(true);
      setFleetBestUxVariant(null);
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
          userProfile?: UserProfile | null;
          dispatch_offers?: DispatchOfferAdminRow[];
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
      setCleaner(json.cleaner ?? null);
      setUserProfile(json.userProfile ?? null);
      setDispatchOffers(Array.isArray(json.dispatch_offers) ? json.dispatch_offers : []);
      setSupportsTeamAssignment(json.supports_team_assignment === true);
      setTeamSummary(json.team_summary ?? null);
      setDraftDate(json.booking?.date ?? "");
      setDraftTime((json.booking?.time ?? "").slice(0, 5));
      setError(null);
      setLoading(false);
    }
    void loadDetails();
  }, [bookingId, detailRefresh]);

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
    const mins = Math.round((dt.getTime() - Date.now()) / 60000);
    const abs = Math.abs(mins);
    if (mins >= 0) {
      if (mins < 60) return `Starts in ${mins}m`;
      return `Starts in ${Math.floor(mins / 60)}h ${abs % 60}m`;
    }
    if (abs < 60) return `Started ${abs}m ago`;
    return `Started ${Math.floor(abs / 60)}h ${abs % 60}m ago`;
  }, [fullBooking?.date, fullBooking?.time]);

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
      const sb = getSupabaseBrowser();
      const token = (await sb?.auth.getSession())?.data.session?.access_token;
      if (token) {
        const refresh = await fetch(`/api/admin/bookings/${encodeURIComponent(fullBooking.id)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const jr = (await refresh.json()) as {
          booking?: BookingDetails;
          team_summary?: TeamSummary | null;
          supports_team_assignment?: boolean;
        };
        if (refresh.ok && jr.booking) {
          setFullBooking(jr.booking);
          setTeamSummary(jr.team_summary ?? null);
          setSupportsTeamAssignment(jr.supports_team_assignment === true);
        }
      }
    } catch (e) {
      setToast({ kind: "error", text: e instanceof Error ? e.message : "Team assignment failed" });
    } finally {
      setAssigningTeam(false);
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
              {fullBooking.is_test ? (
                <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-amber-900 ring-1 ring-amber-200">
                  TEST BOOKING
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
              </div>
            ) : (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                <p className="flex items-center gap-2 text-sm font-medium text-amber-800"><TriangleAlert size={14} />No cleaner assigned</p>
                <button type="button" onClick={() => void openCleanerPickerInline()} className="mt-3 rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-zinc-700">Assign cleaner</button>
              </div>
            )}
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
              <button
                type="button"
                onClick={() => void openTeamModal()}
                className="mt-3 w-full rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-zinc-700"
              >
                Change team
              </button>
            </DetailCard>
          ) : null}
          <DetailCard title="Flags">
            <div className="flex flex-wrap gap-2">
              {flags.length ? flags.map((flag) => <FlagPill key={flag} flag={flag} />) : <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">No issues</span>}
            </div>
          </DetailCard>
          <DetailCard title="Pricing">
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
                <button type="button" onClick={() => setRescheduleOpen(true)} className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50">Reschedule</button>
                <button type="button" onClick={handleContactCustomer} className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50">Contact customer</button>
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

function DetailRow({ label, value, mono = false, strong = false }: { label: string; value: string; mono?: boolean; strong?: boolean }) {
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
