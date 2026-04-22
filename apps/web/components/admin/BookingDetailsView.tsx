"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Loader2, MapPin, Pencil, TriangleAlert } from "lucide-react";
import BookingActionsDropdown from "@/components/admin/BookingActionsDropdown";
import { assignCleaner, fetchCleaners, updateBooking, updateBookingStatus, type AdminCleanerRow } from "@/lib/admin/dashboard";
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
  status: string | null;
  user_id: string | null;
  cleaner_id: string | null;
  duration_hours?: number | null;
  extras?: string[] | null;
  created_at: string;
  phone?: string | null;
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

type ToastState = { kind: "success" | "error"; text: string } | null;

function money(booking: BookingDetails): number {
  if (typeof booking.total_paid_zar === "number") return booking.total_paid_zar;
  return Math.round((booking.amount_paid_cents ?? 0) / 100);
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

  useEffect(() => {
    async function loadDetails() {
      if (!bookingId) {
        setError("Missing booking ID.");
        setLoading(false);
        return;
      }
      setLoading(true);
      const sb = getSupabaseBrowser();
      const { data: sessionData } = (await sb?.auth.getSession()) ?? { data: { session: null } };
      const token = sessionData.session?.access_token;
      if (!token) {
        setError("Please sign in as an admin.");
        setLoading(false);
        return;
      }

      const res = await fetch(`/api/admin/bookings/${encodeURIComponent(bookingId)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = (await res.json()) as {
        booking?: BookingDetails;
        cleaner?: Cleaner | null;
        userProfile?: UserProfile | null;
        error?: string;
      };
      if (!res.ok) {
        setError(json.error ?? "Could not load booking.");
        setLoading(false);
        return;
      }
      setFullBooking(json.booking ?? null);
      setCleaner(json.cleaner ?? null);
      setUserProfile(json.userProfile ?? null);
      setDraftDate(json.booking?.date ?? "");
      setDraftTime((json.booking?.time ?? "").slice(0, 5));
      setError(null);
      setLoading(false);
    }
    void loadDetails();
  }, [bookingId]);

  const flags = useMemo(() => (fullBooking ? detailFlags(fullBooking, userProfile) : []), [fullBooking, userProfile]);
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
  const isAssigned = !!fullBooking.cleaner_id;
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
                  fullBooking.extras.map((item) => (
                    <span key={item} className="rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-xs font-medium text-zinc-700">{item}</span>
                  ))
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

function Toast({ kind, text, onClose }: { kind: "success" | "error"; text: string; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 2800);
    return () => clearTimeout(t);
  }, [onClose]);
  return (
    <div className="fixed bottom-4 right-4 z-[60]">
      <div className={["rounded-lg px-4 py-2 text-sm font-medium shadow-lg", kind === "success" ? "bg-emerald-600 text-white" : "bg-rose-600 text-white"].join(" ")}>
        {text}
      </div>
    </div>
  );
}
