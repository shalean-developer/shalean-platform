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
  /** Keyword chips (Keys, Dog, …) for quick scan; empty when none. */
  operationalNoteChips: readonly string[];
  /** Full merged notes (admin + customer + locked); no duplicate heads-up line. */
  notes: string | null;
  /** ZAR — null until stored display earnings is available. */
  earningsZar: number | null;
  /** Team placeholder (fixed member amount) vs confirmed stored earnings. */
  earningsIsEstimate: boolean;
  payoutStatus: "paid" | "pending";
  /** Team-assigned booking (cleaner_id may be null on server). */
  isTeamJob: boolean;
  /** Active cleaners on roster for booking date; null if unknown or not a team job. */
  teamMemberCount: number | null;
};

/** Hours from `booking_snapshot.locked.finalHours`, default 2 when missing. */
export function durationHoursFromBookingSnapshot(snap: unknown): number {
  const o = snap as { locked?: { finalHours?: number } } | null;
  const h = o?.locked?.finalHours;
  if (typeof h === "number" && Number.isFinite(h) && h > 0) return h;
  return 2;
}

/** Approximate hourly rate for cleaner-facing pay display. */
export function formatApproxEarningsPerHourZar(earningsZar: number, durationHours: number): string | null {
  if (!Number.isFinite(earningsZar) || !Number.isFinite(durationHours) || durationHours <= 0) return null;
  const per = Math.round(earningsZar / durationHours);
  if (!Number.isFinite(per) || per < 0) return null;
  return `≈ R${per.toLocaleString("en-ZA")}/hr`;
}

/** Higher-signal keywords first; at most three shown to avoid noisy heads-up lines. */
const OPS_NOTE_KEYWORDS = ["keys", "dog", "gate", "fragile"] as const;

const OPS_NOTE_CHIP_LABEL: Record<(typeof OPS_NOTE_KEYWORDS)[number], string> = {
  keys: "🔑 Keys",
  dog: "🐶 Dog",
  gate: "🚪 Gate",
  fragile: "📦 Fragile",
};

/** Chips for cleaner UI (emoji + label), max three, priority order preserved. */
export function operationalNoteChipsFromText(notes: string): string[] {
  const lower = notes.toLowerCase();
  return OPS_NOTE_KEYWORDS.filter((k) => lower.includes(k))
    .slice(0, 3)
    .map((k) => OPS_NOTE_CHIP_LABEL[k]);
}

function notesFromSnapshot(snap: unknown): string | null {
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
  return parts.join("\n\n").trim() || null;
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
  const displayCents =
    row.displayEarningsCents != null && Number.isFinite(Number(row.displayEarningsCents))
      ? Math.round(Number(row.displayEarningsCents))
      : null;
  const earningsZar = displayCents != null ? Math.round(displayCents / 100) : null;
  const earningsIsEstimate = row.displayEarningsIsEstimate === true;
  const payoutStatus: "paid" | "pending" = row.payout_id ? "paid" : "pending";
  const teamMemberCountRaw = row.teamMemberCount;
  const teamMemberCount =
    typeof teamMemberCountRaw === "number" && Number.isFinite(teamMemberCountRaw) && teamMemberCountRaw > 0
      ? Math.floor(teamMemberCountRaw)
      : null;

  const mergedNotes = notesFromSnapshot(row.booking_snapshot);
  const chips = mergedNotes ? operationalNoteChipsFromText(mergedNotes) : [];

  return {
    id: row.id,
    customerName: row.customer_name?.trim() || "Customer",
    areaLabel: shortArea(row.location),
    address: row.location?.trim() || "Address on file",
    time: row.time?.trim() || "—",
    durationHours: durationHoursFromBookingSnapshot(row.booking_snapshot),
    date: row.date?.trim() || "",
    service: row.service?.trim() || "Cleaning",
    statusRaw: st,
    phase,
    phone: row.customer_phone?.trim() || "",
    operationalNoteChips: chips,
    notes: mergedNotes ? mergedNotes.slice(0, 600) : null,
    earningsZar,
    earningsIsEstimate,
    payoutStatus: st === "completed" ? payoutStatus : "pending",
    isTeamJob: row.is_team_job === true,
    teamMemberCount,
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
    const c = r.displayEarningsCents;
    if (c != null && Number.isFinite(Number(c))) {
      return Math.round(Number(c) / 100);
    }
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

/** Minutes since last completed job (for offer fairness). No completions → 24h nominal idle. */
export function idleMinutesSinceLastCompletedJob(rows: CleanerBookingRow[], now: Date): number {
  let maxMs = 0;
  for (const r of rows) {
    if (String(r.status ?? "").toLowerCase() !== "completed") continue;
    const raw = r.completed_at;
    if (!raw) continue;
    const t = new Date(raw).getTime();
    if (!Number.isNaN(t) && t > maxMs) maxMs = t;
  }
  if (maxMs === 0) return 24 * 60;
  return Math.max(0, (now.getTime() - maxMs) / 60000);
}

/**
 * Weekly earnings goal: at least R1000, or 1.2× completed ZAR in the trailing 7 days (stretch target).
 */
export function adaptiveWeeklyEarningsGoalZar(rows: CleanerBookingRow[], now: Date): number {
  const cutoff = now.getTime() - 7 * 24 * 60 * 60 * 1000;
  let sum = 0;
  for (const r of rows) {
    if (String(r.status ?? "").toLowerCase() !== "completed") continue;
    const raw = r.completed_at ?? r.date;
    if (!raw) continue;
    const t = new Date(raw).getTime();
    if (Number.isNaN(t) || t < cutoff) continue;
    const c = r.displayEarningsCents;
    if (c == null || !Number.isFinite(Number(c))) continue;
    sum += Math.round(Number(c) / 100);
  }
  return Math.max(1000, Math.round(sum * 1.2));
}

/** Dispatch offer shape (avoid importing full row type). */
type TodayOfferHint = {
  booking_id: string;
  displayEarningsCents?: number | null;
  booking: { date?: string | null; is_team_job?: boolean | null } | null;
} | null;

/**
 * Sum known display earnings (ZAR) for today’s open pipeline: assigned/pending/in-progress
 * bookings dated today, plus a pending solo offer dated today if that booking is not already in `rows`.
 */
export function todayPotentialEarningsZar(params: {
  rows: CleanerBookingRow[];
  topOffer: TodayOfferHint;
  now: Date;
}): { zar: number; hasGap: boolean } {
  const todayY = ymdLocal(params.now);
  let zar = 0;
  let hasGap = false;
  const rowIds = new Set(params.rows.map((r) => String(r.id)));

  for (const r of params.rows) {
    const d = String(r.date ?? "").slice(0, 10);
    if (d !== todayY) continue;
    const st = String(r.status ?? "").toLowerCase();
    if (st === "completed") continue;
    const view = bookingRowToMobileView(r);
    if (view.earningsZar != null) zar += view.earningsZar;
    else hasGap = true;
  }

  const o = params.topOffer;
  if (o?.booking && o.booking.is_team_job !== true) {
    const od = String(o.booking.date ?? "").slice(0, 10);
    if (od === todayY && !rowIds.has(String(o.booking_id))) {
      const c = o.displayEarningsCents;
      if (c != null && Number.isFinite(Number(c))) zar += Math.max(0, Math.round(Number(c) / 100));
      else hasGap = true;
    }
  }

  return { zar, hasGap };
}
