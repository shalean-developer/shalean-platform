import type { CleanerBookingRow } from "@/lib/cleaner/cleanerBookingRow";
import { cleanerBookingCardDetailsFromRow, cleanerBookingScopeLines } from "@/lib/cleaner/cleanerBookingScopeSummary";
import { optionalCentsFromDb } from "@/lib/cleaner/cleanerJobDisplayEarningsResolve";
import { resolveCleanerEarningsCents } from "@/lib/cleaner/resolveCleanerEarnings";
import { CLEANER_RESPONSE } from "@/lib/dispatch/cleanerResponseStatus";
import { isBookingPayoutPaid } from "@/lib/cleaner/cleanerPayoutPaid";
import { johannesburgCalendarYmd } from "@/lib/dashboard/johannesburgMonth";
import { jobTotalZarFromCleanerBookingLike } from "@/lib/cleaner/cleanerUxEstimatedPayZar";

/** UI lifecycle for cleaner field app (maps DB status + timestamps). */
export type CleanerMobilePhase = "pending" | "assigned" | "en_route" | "in_progress" | "completed";

export type CleanerMobileJobView = {
  id: string;
  customerName: string;
  areaLabel: string;
  address: string;
  time: string;
  durationHours: number;
  date: string;
  service: string;
  /** Catalog slug when present (`bookings.service_slug`). */
  serviceSlug: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  /** Extra add-on names for card bullets (from line items / extras / snapshot). */
  extrasBulletNames: readonly string[];
  statusRaw: string;
  phase: CleanerMobilePhase;
  phone: string;
  /** Keyword chips (Keys, Dog, …) for quick scan; empty when none. */
  operationalNoteChips: readonly string[];
  /** Full merged notes (admin + customer + locked); no duplicate heads-up line. */
  notes: string | null;
  /** ZAR — whole rand, may round from cents; prefer {@link CleanerMobileJobView.earningsCents} for display. */
  earningsZar: number | null;
  /** Resolved cleaner-facing pay in cents when stored; null until calculated. */
  earningsCents: number | null;
  /** True when API marks display pay as an estimate (e.g. team placeholder). */
  earningsIsEstimate: boolean;
  payoutStatus: "paid" | "pending" | "eligible" | "invalid";
  /** Team-assigned booking (cleaner_id may be null on server). */
  isTeamJob: boolean;
  /** You are the designated team lead (payout owner) for this job. */
  isLeadCleaner: boolean;
  /** Other teammates on the canonical roster (excludes you); null when solo on roster or not a team job. */
  teamRosterSummary: string | null;
  /** Full roster with roles for detail / coordination. */
  teamRoster: readonly { cleaner_id: string; full_name: string | null; role: string }[];
  /** Active cleaners on booking date; null if unknown or not a team job (legacy snapshot / template). */
  teamMemberCount: number | null;
  /** From `bookings.cleaner_response_status` (snake_case on wire). */
  cleanerResponseStatus?: string | null;
  enRouteAt?: string | null;
  cleanerId?: string | null;
  /** Invoice / paid total in ZAR when present — UX-only pay hint when {@link CleanerMobileJobView.earningsCents} is null. */
  jobTotalZar: number | null;
  /**
   * Rooms, bathrooms, and add-ons **as stored on the booking** (columns + snapshot + `extras` JSON).
   * Never derived from the live pricing catalog.
   */
  scopeLines: readonly string[];
};

/** Hours from `booking_snapshot.locked.finalHours`, default 2 when missing. */
export function durationHoursFromBookingSnapshot(snap: unknown): number {
  const o = snap as { locked?: { finalHours?: number } } | null;
  const h = o?.locked?.finalHours;
  if (typeof h === "number" && Number.isFinite(h) && h > 0) return h;
  return 2;
}

/** Like {@link durationHoursFromBookingSnapshot} but returns null when hours are not set on the snapshot (no default). */
export function explicitDurationHoursFromBookingSnapshot(snap: unknown): number | null {
  const o = snap as { locked?: { finalHours?: number } } | null;
  const h = o?.locked?.finalHours;
  if (typeof h === "number" && Number.isFinite(h) && h > 0) return h;
  return null;
}

/** Under pay: expected time on site from `finalHours` (or snapshot default), e.g. `Takes ~3h`. */
export function formatTakesAboutJobHoursLine(hours: number): string | null {
  if (!Number.isFinite(hours) || hours <= 0) return null;
  return `Takes ~${Number.isInteger(hours) ? String(hours) : hours.toFixed(1)}h`;
}

/** Offer-style duration line when `finalHours` is on the snapshot, e.g. `~3h job`. */
export function formatApproxJobDurationJobLabel(hours: number): string | null {
  if (!Number.isFinite(hours) || hours <= 0) return null;
  const s = Number.isInteger(hours) ? String(hours) : hours.toFixed(1);
  return `~${s}h job`;
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

/** Admin + customer + locked checkout notes (deduped). */
export function mergedBookingNotesFromSnapshot(snap: unknown): string | null {
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
  if (st === "completed" || st === "cancelled") return "completed";
  if (st === "in_progress") return "in_progress";
  if (st === "pending") return row.en_route_at ? "en_route" : "pending";
  if (st === "assigned") return row.en_route_at ? "en_route" : "assigned";
  return "pending";
}

/** At most one primary action group for schedule / job detail (matches server lifecycle rules). */
export type CleanerJobLifecycleSlot =
  | { kind: "accept_reject"; canReject: boolean }
  | { kind: "en_route" }
  | { kind: "start" }
  | { kind: "complete" }
  | null;

export function deriveCleanerJobLifecycleSlot(row: CleanerBookingRow): CleanerJobLifecycleSlot {
  const st = String(row.status ?? "").toLowerCase();
  if (st === "completed" || st === "cancelled" || st === "failed") return null;
  if (st === "in_progress") return { kind: "complete" };
  const rec = row as Record<string, unknown>;
  const raw = rec.cleaner_response_status as string | null | undefined;
  const r = raw == null || raw === "" ? "" : String(raw).trim().toLowerCase();
  const isTeam = row.is_team_job === true;
  const accepted = r === CLEANER_RESPONSE.ACCEPTED;
  const onMyWay = r === CLEANER_RESPONSE.ON_MY_WAY;
  const hasEnRoute = Boolean(row.en_route_at);
  if (st === "assigned") {
    const readyToStart = hasEnRoute || onMyWay;
    if (readyToStart) return { kind: "start" };
    if (!accepted) return { kind: "accept_reject", canReject: !isTeam };
    return { kind: "en_route" };
  }
  return null;
}

/** Prefer camelCase from cleaner APIs; fall back to snake_case if present. */
export function cleanerFacingDisplayEarningsCents(row: CleanerBookingRow): number | null {
  const rec = row as Record<string, unknown>;
  return resolveCleanerEarningsCents({
    cleaner_earnings_total_cents: rec.cleaner_earnings_total_cents,
    payout_frozen_cents: rec.payout_frozen_cents,
    display_earnings_cents:
      optionalCentsFromDb(row.displayEarningsCents) ?? optionalCentsFromDb(rec.display_earnings_cents),
  });
}

function payoutUiForCompleted(row: CleanerBookingRow): "paid" | "pending" | "eligible" | "invalid" {
  const rec = row as Record<string, unknown>;
  const ps = String(rec.payout_status ?? "")
    .trim()
    .toLowerCase();
  if (ps === "paid") {
    if (isBookingPayoutPaid({ payout_status: rec.payout_status, payout_paid_at: rec.payout_paid_at })) return "paid";
    return "invalid";
  }
  if (ps === "eligible") return "eligible";
  return "pending";
}

export function bookingRowToMobileView(row: CleanerBookingRow): CleanerMobileJobView {
  const st = String(row.status ?? "").toLowerCase();
  const phase = deriveMobilePhase(row);
  const rec = row as Record<string, unknown>;
  const crsRaw = row.cleaner_response_status ?? (rec.cleaner_response_status as string | null | undefined);
  const displayCents = cleanerFacingDisplayEarningsCents(row);
  const earningsZar = displayCents != null ? Math.round(displayCents / 100) : null;
  const estimateFlag = row.displayEarningsIsEstimate === true || row.earnings_estimated === true;
  const payoutStatus: "paid" | "pending" | "eligible" | "invalid" =
    st === "completed" ? payoutUiForCompleted(row) : "pending";
  const teamMemberCountRaw = row.teamMemberCount;
  const teamMemberCount =
    typeof teamMemberCountRaw === "number" && Number.isFinite(teamMemberCountRaw) && teamMemberCountRaw > 0
      ? Math.floor(teamMemberCountRaw)
      : null;

  const mergedNotes = mergedBookingNotesFromSnapshot(row.booking_snapshot);
  const chips = mergedNotes ? operationalNoteChipsFromText(mergedNotes) : [];
  const scopeLines = cleanerBookingScopeLines(row);
  const cardDetails = cleanerBookingCardDetailsFromRow(row);
  const slugRaw = rec.service_slug as string | null | undefined;
  const serviceSlug = typeof slugRaw === "string" && slugRaw.trim() ? slugRaw.trim().toLowerCase() : null;

  return {
    id: row.id,
    customerName: row.customer_name?.trim() || "Customer",
    areaLabel: shortArea(row.location),
    address: row.location?.trim() || "Address on file",
    time: row.time?.trim() || "—",
    durationHours: durationHoursFromBookingSnapshot(row.booking_snapshot),
    date: row.date?.trim() || "",
    service: row.service?.trim() || "Cleaning",
    serviceSlug,
    bedrooms: cardDetails.bedrooms,
    bathrooms: cardDetails.bathrooms,
    extrasBulletNames: cardDetails.extraNames,
    statusRaw: st,
    phase,
    phone: row.customer_phone?.trim() || "",
    operationalNoteChips: chips,
    notes: mergedNotes ? mergedNotes.slice(0, 600) : null,
    earningsZar,
    earningsCents: displayCents,
    earningsIsEstimate: estimateFlag,
    payoutStatus,
    isTeamJob: row.is_team_job === true,
    isLeadCleaner: (row as { is_lead_cleaner?: boolean | null }).is_lead_cleaner === true,
    teamRosterSummary:
      typeof row.team_roster_summary === "string" && row.team_roster_summary.trim()
        ? row.team_roster_summary.trim()
        : null,
    teamRoster: Array.isArray(row.team_roster) ? row.team_roster : [],
    teamMemberCount,
    cleanerResponseStatus: crsRaw != null && crsRaw !== "" ? String(crsRaw) : null,
    enRouteAt: row.en_route_at ? String(row.en_route_at) : null,
    cleanerId: row.cleaner_id != null && String(row.cleaner_id).trim() ? String(row.cleaner_id).trim() : null,
    jobTotalZar: jobTotalZarFromCleanerBookingLike(row),
    scopeLines,
  };
}

export function getActiveMobileJob(rows: CleanerBookingRow[]): CleanerMobileJobView | null {
  const inProg = rows.filter((r) => String(r.status ?? "").toLowerCase() === "in_progress");
  if (inProg.length === 0) return null;
  const sorted = [...inProg].sort((a, b) => (a.date ?? "").localeCompare(b.date ?? "") || (a.time ?? "").localeCompare(b.time ?? ""));
  return bookingRowToMobileView(sorted[0]!);
}

export function getNextUpcomingMobileJob(rows: CleanerBookingRow[], now = new Date()): CleanerMobileJobView | null {
  const todayYmd = johannesburgCalendarYmd(now);
  const candidates = rows.filter((r) => {
    const st = String(r.status ?? "").toLowerCase();
    if (!(st === "assigned" || st === "pending")) return false;
    const d = String(r.date ?? "").slice(0, 10);
    if (!d) return false;
    return d >= todayYmd;
  });
  if (candidates.length === 0) return null;
  const sorted = [...candidates].sort((a, b) => (a.date ?? "").localeCompare(b.date ?? "") || (a.time ?? "").localeCompare(b.time ?? ""));
  return bookingRowToMobileView(sorted[0]!);
}

/** Schedule tab / jobs list: overdue (open, date before JHB today), Today (open, JHB today), Upcoming (open, future dates), Completed. */
export type CleanerScheduleSectionKey = "overdue" | "today" | "upcoming" | "completed";

export function groupCleanerScheduleRows(
  rows: CleanerBookingRow[],
  now: Date,
): {
  todayYmd: string;
  sections: { key: CleanerScheduleSectionKey; title: string; rows: CleanerBookingRow[] }[];
} {
  const todayYmd = johannesburgCalendarYmd(now);
  const stOf = (r: CleanerBookingRow) => String(r.status ?? "").toLowerCase();
  const dOf = (r: CleanerBookingRow) => String(r.date ?? "").slice(0, 10);
  const sortBySchedule = (a: CleanerBookingRow, b: CleanerBookingRow) =>
    (a.date ?? "").localeCompare(b.date ?? "") || String(a.time ?? "").localeCompare(String(b.time ?? ""));
  const pastStamp = (r: CleanerBookingRow) => {
    const st = stOf(r);
    if (st === "completed") return String(r.completed_at ?? r.date ?? "");
    if (st === "cancelled") return String(r.date ?? r.created_at ?? "");
    return "";
  };
  const sortPastDesc = (a: CleanerBookingRow, b: CleanerBookingRow) => pastStamp(b).localeCompare(pastStamp(a));

  const pastRows = rows
    .filter((r) => {
      const st = stOf(r);
      return st === "completed" || st === "cancelled";
    })
    .sort(sortPastDesc);
  const open = rows.filter((r) => {
    const st = stOf(r);
    return st !== "completed" && st !== "cancelled";
  });
  const overdue = open
    .filter((r) => {
      const d = dOf(r);
      if (!d) return true;
      return d < todayYmd;
    })
    .sort(sortBySchedule);
  const todayRows = open.filter((r) => dOf(r) === todayYmd).sort(sortBySchedule);
  const upcomingRows = open
    .filter((r) => {
      const d = dOf(r);
      if (!d) return false;
      return d > todayYmd;
    })
    .sort(sortBySchedule);

  const sections: { key: CleanerScheduleSectionKey; title: string; rows: CleanerBookingRow[] }[] = [];
  if (overdue.length) sections.push({ key: "overdue", title: "Needs attention", rows: overdue });
  if (todayRows.length) sections.push({ key: "today", title: "Today", rows: todayRows });
  if (upcomingRows.length) sections.push({ key: "upcoming", title: "Upcoming", rows: upcomingRows });
  if (pastRows.length) sections.push({ key: "completed", title: "Past", rows: pastRows });
  return { todayYmd, sections };
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
    const c = cleanerFacingDisplayEarningsCents(r);
    if (c == null) continue;
    sum += Math.round(c / 100);
  }
  return Math.max(1000, Math.round(sum * 1.2));
}
