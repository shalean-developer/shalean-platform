import type { CleanerBookingRow } from "@/lib/cleaner/cleanerBookingRow";

/** UI lifecycle for cleaner field app (maps DB status + timestamps). */
export type CleanerMobilePhase = "assigned" | "en_route" | "in_progress" | "completed";

export type CleanerMobileJobView = {
  id: string;
  customerName: string;
  areaLabel: string;
  address: string;
  time: string;
  durationHours: number;
  date: string;
  service: string;
  statusRaw: string;
  phase: CleanerMobilePhase;
  phone: string;
  notes: string | null;
  /** ZAR — cleaner share when known, else customer total as fallback. */
  earningsZar: number;
  payoutStatus: "paid" | "pending";
};

function durationHoursFromSnapshot(snap: unknown): number {
  const o = snap as { locked?: { finalHours?: number } } | null;
  const h = o?.locked?.finalHours;
  if (typeof h === "number" && Number.isFinite(h) && h > 0) return h;
  return 2;
}

function notesFromSnapshot(snap: unknown): string | null {
  const o = snap as { locked?: { notes?: string } } | null;
  const n = o?.locked?.notes;
  return typeof n === "string" && n.trim() ? n.trim().slice(0, 600) : null;
}

function shortArea(location: string | null): string {
  if (!location?.trim()) return "Location TBD";
  const line = location.split(/\r?\n/)[0]?.trim() ?? location.trim();
  return line.length > 40 ? `${line.slice(0, 37)}…` : line;
}

export function deriveMobilePhase(row: CleanerBookingRow): CleanerMobilePhase {
  const st = String(row.status ?? "").toLowerCase();
  if (st === "completed") return "completed";
  if (st === "in_progress") return "in_progress";
  if (st === "assigned" || st === "pending") {
    if (row.en_route_at) return "en_route";
    return "assigned";
  }
  return "assigned";
}

export function bookingRowToMobileView(row: CleanerBookingRow): CleanerMobileJobView {
  const st = String(row.status ?? "").toLowerCase();
  const phase = deriveMobilePhase(row);
  const payoutCents = row.cleaner_payout_cents != null && Number.isFinite(Number(row.cleaner_payout_cents)) ? Math.round(Number(row.cleaner_payout_cents)) : null;
  const paidZar = row.total_paid_zar != null && Number.isFinite(Number(row.total_paid_zar)) ? Math.round(Number(row.total_paid_zar)) : 0;
  const earningsZar = payoutCents != null ? Math.round(payoutCents / 100) : paidZar;
  const payoutStatus: "paid" | "pending" = row.payout_id ? "paid" : "pending";

  return {
    id: row.id,
    customerName: row.customer_name?.trim() || "Customer",
    areaLabel: shortArea(row.location),
    address: row.location?.trim() || "Address on file",
    time: row.time?.trim() || "—",
    durationHours: durationHoursFromSnapshot(row.booking_snapshot),
    date: row.date?.trim() || "",
    service: row.service?.trim() || "Cleaning",
    statusRaw: st,
    phase,
    phone: row.customer_phone?.trim() || "",
    notes: notesFromSnapshot(row.booking_snapshot),
    earningsZar,
    payoutStatus: st === "completed" ? payoutStatus : "pending",
  };
}

export function getActiveMobileJob(rows: CleanerBookingRow[]): CleanerMobileJobView | null {
  const inProg = rows.filter((r) => String(r.status ?? "").toLowerCase() === "in_progress");
  if (inProg.length === 0) return null;
  const sorted = [...inProg].sort((a, b) => (a.date ?? "").localeCompare(b.date ?? "") || (a.time ?? "").localeCompare(b.time ?? ""));
  return bookingRowToMobileView(sorted[0]!);
}

export function getNextUpcomingMobileJob(rows: CleanerBookingRow[]): CleanerMobileJobView | null {
  const candidates = rows.filter((r) => {
    const st = String(r.status ?? "").toLowerCase();
    return st === "assigned" || st === "pending";
  });
  if (candidates.length === 0) return null;
  const sorted = [...candidates].sort((a, b) => (a.date ?? "").localeCompare(b.date ?? "") || (a.time ?? "").localeCompare(b.time ?? ""));
  return bookingRowToMobileView(sorted[0]!);
}

export function ymdLocal(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function earningsSummaryFromRows(rows: CleanerBookingRow[], now: Date) {
  const completed = rows.filter((r) => String(r.status ?? "").toLowerCase() === "completed");
  const todayY = ymdLocal(now);
  const startOfWeek = new Date(now);
  const dow = startOfWeek.getDay();
  const diff = dow === 0 ? 6 : dow - 1;
  startOfWeek.setDate(startOfWeek.getDate() - diff);
  startOfWeek.setHours(0, 0, 0, 0);
  const weekStartMs = startOfWeek.getTime();
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const zar = (r: CleanerBookingRow) => {
    const c = r.cleaner_payout_cents;
    if (c != null && Number.isFinite(Number(c))) return Math.round(Number(c) / 100);
    const z = r.total_paid_zar;
    if (z != null && Number.isFinite(Number(z))) return Math.round(Number(z));
    return 0;
  };

  let today = 0;
  let week = 0;
  let month = 0;
  for (const r of completed) {
    const z = zar(r);
    const d = (r.completed_at ?? r.date ?? "").slice(0, 10);
    if (!d) continue;
    if (d === todayY) today += z;
    const dayMs = new Date(`${d}T12:00:00`).getTime();
    if (!Number.isNaN(dayMs) && dayMs >= weekStartMs) week += z;
    if (d.slice(0, 7) === monthKey) month += z;
  }
  return { today, week, month };
}
