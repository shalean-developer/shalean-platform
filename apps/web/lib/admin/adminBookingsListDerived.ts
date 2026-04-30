import type { AdminBookingsListRow } from "@/lib/admin/adminBookingsListRow";

export function zar(r: AdminBookingsListRow): number {
  if (typeof r.total_paid_zar === "number") return r.total_paid_zar;
  return Math.round((r.amount_paid_cents ?? 0) / 100);
}

export function centsToZar(cents: number | null | undefined): number | null {
  if (cents == null || !Number.isFinite(Number(cents))) return null;
  return Math.round(Number(cents) / 100);
}

export function formatWhen(date: string | null, time: string | null): string {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return "—";
  const [y, m, d] = date.split("-").map(Number);
  const label = new Date(y, m - 1, d).toLocaleDateString("en-ZA", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  return time ? `${label} ${time}` : label;
}

export function parseBookingDateTime(date: string | null, time: string | null): Date | null {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const safeTime = time && /^\d{2}:\d{2}/.test(time) ? `${time.slice(0, 5)}:00` : "00:00:00";
  return new Date(`${date}T${safeTime}+02:00`);
}

export function startsInMinutes(date: string | null, time: string | null): number | null {
  const dt = parseBookingDateTime(date, time);
  if (!dt) return null;
  return Math.round((dt.getTime() - Date.now()) / (60 * 1000));
}

export function formatStartsIn(mins: number | null): string {
  if (mins == null) return "—";
  if (mins < 0) {
    const a = Math.abs(mins);
    if (a < 60) return `${a}m ago`;
    return `${Math.floor(a / 60)}h ${a % 60}m ago`;
  }
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

export function startsInClass(mins: number | null): string {
  if (mins == null) return "text-zinc-600 dark:text-zinc-400";
  if (mins >= 0 && mins < 60) return "font-semibold text-red-700 dark:text-red-300";
  if (mins >= 0 && mins < 180) return "font-semibold text-orange-700 dark:text-orange-300";
  return "text-zinc-700 dark:text-zinc-300";
}

export function dispatchStateLabel(
  dispatchStatus: AdminBookingsListRow["dispatch_status"],
  status: string | null,
): string {
  const ds = String(dispatchStatus ?? "").toLowerCase();
  if (ds === "searching") return "Searching for cleaner...";
  if (ds === "offered") return "Dispatching to 3 cleaners...";
  if (ds === "assigned") return "Assigned";
  if (ds === "failed") return "Failed";
  if (ds === "no_cleaner") return "No cleaner (area)";
  if (ds === "unassignable") return "No cleaner accepted — assign manually";
  const s = String(status ?? "").toLowerCase();
  if (s === "assigned") return "Assigned";
  return status ?? "—";
}

export function cleanerSelectEmptyLabel(r: AdminBookingsListRow): string {
  const st = (r.status ?? "").toLowerCase();
  const ds = (r.dispatch_status ?? "").toLowerCase();
  if (!r.cleaner_id && st === "pending" && ds === "searching") return "Assigning…";
  return "Unassigned";
}

export function adminRowFlags(r: AdminBookingsListRow, today: string) {
  const cents = r.amount_paid_cents ?? 0;
  const tzar = r.total_paid_zar ?? 0;
  const paymentMissing = cents <= 0 && tzar <= 0;
  const st = (r.status ?? "").toLowerCase();
  const d = r.date && /^\d{4}-\d{2}-\d{2}$/.test(r.date) ? r.date : null;
  const active = st === "pending" || st === "assigned" || st === "in_progress";
  const statusInconsistent = active && d !== null && d < today;
  const missingEmail = !r.customer_email?.trim();
  return { paymentMissing, statusInconsistent, missingEmail };
}

export function rowHighlightClass(r: AdminBookingsListRow, today: string): string {
  const f = adminRowFlags(r, today);
  if (f.paymentMissing) return "bg-red-50/90 dark:bg-red-950/30";
  if (f.statusInconsistent) return "bg-orange-50/85 dark:bg-orange-950/25";
  if (r.user_id == null) return "bg-amber-50/85 dark:bg-amber-950/25";
  if (f.missingEmail) return "bg-rose-50/80 dark:bg-rose-950/20";
  return "";
}

/** Time-only label for card subline (Johannesburg wall time from stored date+time). */
export function formatTimeShort(date: string | null, time: string | null): string {
  const dt = parseBookingDateTime(date, time);
  if (!dt) return "—";
  return dt.toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" });
}

export function rosterTooltipNames(
  roster: readonly { full_name: string | null; role: string }[],
): string {
  if (!roster.length) return "";
  return roster
    .map((m) => {
      const n = m.full_name?.trim() || "Cleaner";
      return String(m.role).toLowerCase() === "lead" ? `${n} (lead)` : n;
    })
    .join(", ");
}

export function cleanerDisplayName(
  cleanerId: string | null,
  cleaners: readonly { id: string; full_name: string | null }[],
): string | null {
  if (!cleanerId) return null;
  const hit = cleaners.find((c) => c.id === cleanerId);
  return hit?.full_name ?? cleanerId;
}
