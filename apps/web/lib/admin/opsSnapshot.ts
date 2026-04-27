/**
 * Pure ops counts for admin “Attention Required” — mirrors dispatch SLA watchdog clock rules.
 */

export type OpsSnapshot = {
  unassignable: number;
  slaBreaches: number;
  /** Max minutes past the SLA deadline among breach rows (0 if none). */
  oldestBreachMinutes: number;
  /** Breaches with overdue strictly greater than 30 minutes. */
  slaBreachesOverdueGt30: number;
  /** Breaches with overdue in (10, 30] minutes (excludes >30 bucket). */
  slaBreachesOverdueGt10Le30: number;
  /** `became_pending_at` / `created_at` of a worst-overdue breach row (for “Pending since” tooltip). */
  slaWorstBreachPendingSinceIso: string | null;
  unassigned: number;
  startingSoon: number;
  /** Smallest “starts in” minutes among starting-soon rows; null if none. */
  startingSoonNextMinutes: number | null;
};

export type OpsSnapshotRow = {
  id: string;
  status: string | null;
  date: string | null;
  time: string | null;
  cleaner_id: string | null;
  dispatch_status: string | null;
  became_pending_at?: string | null;
  created_at: string | null;
  total_paid_zar: number | null;
  amount_paid_cents: number | null;
};

const DEFAULT_SLA_MIN = 10;

export function getDispatchSlaBreachMinutes(): number {
  const raw = Number(process.env.DISPATCH_SLA_BREACH_MINUTES ?? DEFAULT_SLA_MIN);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_SLA_MIN;
}

export function effectivePendingClockIso(row: {
  became_pending_at?: string | null;
  created_at?: string | null;
}): string | null {
  const b = row.became_pending_at?.trim();
  if (b) return b;
  const c = row.created_at?.trim();
  return c && c.length > 0 ? c : null;
}

export function effectivePendingClockMs(row: {
  became_pending_at?: string | null;
  created_at?: string | null;
}): number | null {
  const eff = effectivePendingClockIso(row);
  if (!eff) return null;
  const t = new Date(eff).getTime();
  return Number.isFinite(t) ? t : null;
}

function zar(r: OpsSnapshotRow): number {
  if (typeof r.total_paid_zar === "number") return r.total_paid_zar;
  return Math.round((r.amount_paid_cents ?? 0) / 100);
}

function isPaid(r: OpsSnapshotRow): boolean {
  return zar(r) > 0;
}

function isClosedStatus(status: string | null): boolean {
  const st = String(status ?? "").toLowerCase();
  return st === "completed" || st === "cancelled" || st === "failed" || st === "payment_expired";
}

export function bookingScheduledStartUtcMs(date: string | null, time: string | null): number | null {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const safeTime = time && /^\d{2}:\d{2}/.test(time) ? `${time.slice(0, 5)}:00` : "00:00:00";
  const t = new Date(`${date}T${safeTime}+02:00`).getTime();
  return Number.isFinite(t) ? t : null;
}

function startsInMinutesFromNow(date: string | null, time: string | null, nowMs: number): number | null {
  const dt = bookingScheduledStartUtcMs(date, time);
  if (dt == null) return null;
  return Math.round((dt - nowMs) / (60 * 1000));
}

function isSlaBreachRow(r: OpsSnapshotRow, nowMs: number, slaMinutes: number): boolean {
  const st = String(r.status ?? "").toLowerCase();
  if (st !== "pending") return false;
  if (r.cleaner_id) return false;
  const ds = String(r.dispatch_status ?? "").toLowerCase();
  if (ds !== "searching" && ds !== "offered") return false;
  const eff = effectivePendingClockIso(r);
  if (!eff) return false;
  const t = new Date(eff).getTime();
  if (!Number.isFinite(t)) return false;
  const cutoffMs = nowMs - slaMinutes * 60_000;
  return t < cutoffMs;
}

export type AttentionQueueFilter = "unassignable" | "sla" | "unassigned" | "starting-soon";

export function rowMatchesAttentionFilter(
  r: OpsSnapshotRow,
  key: AttentionQueueFilter,
  nowMs = Date.now(),
  slaMinutes: number = getDispatchSlaBreachMinutes(),
): boolean {
  if (isClosedStatus(r.status)) return false;
  const st = String(r.status ?? "").toLowerCase();
  if (st === "pending_payment") return false;

  const ds = String(r.dispatch_status ?? "").toLowerCase();
  const noCleaner = !r.cleaner_id;

  if (key === "unassignable") {
    return ds === "unassignable";
  }
  if (key === "sla") {
    return isSlaBreachRow(r, nowMs, slaMinutes);
  }
  if (key === "unassigned") {
    return noCleaner && isPaid(r);
  }
  if (key === "starting-soon") {
    if (!noCleaner) return false;
    const startsIn = startsInMinutesFromNow(r.date, r.time, nowMs);
    return startsIn != null && startsIn >= 0 && startsIn < 120;
  }
  return false;
}

function breachOverdueMinutes(r: OpsSnapshotRow, nowMs: number, slaMinutes: number): number | null {
  if (!isSlaBreachRow(r, nowMs, slaMinutes)) return null;
  const eff = effectivePendingClockIso(r);
  if (!eff) return null;
  const t = new Date(eff).getTime();
  if (!Number.isFinite(t)) return null;
  const deadlineMs = t + slaMinutes * 60_000;
  return Math.max(0, Math.floor((nowMs - deadlineMs) / 60_000));
}

/** Exported for bookings table sort / tooling. */
export function slaBreachOverdueMinutes(
  r: OpsSnapshotRow,
  nowMs: number,
  slaMinutes: number,
): number | null {
  return breachOverdueMinutes(r, nowMs, slaMinutes);
}

/**
 * Ops queue ordering so “Assign now” targets the most urgent row first.
 * SLA: highest overdue first; unassignable: longest in queue; unassigned/soon: soonest start first.
 */
export function sortRowsForAttentionQueue<T extends OpsSnapshotRow>(
  rows: T[],
  key: AttentionQueueFilter,
  nowMs = Date.now(),
  slaMinutes: number = getDispatchSlaBreachMinutes(),
): T[] {
  const copy = [...rows];
  if (key === "sla") {
    return copy.sort((a, b) => {
      const oa = slaBreachOverdueMinutes(a, nowMs, slaMinutes) ?? -1;
      const ob = slaBreachOverdueMinutes(b, nowMs, slaMinutes) ?? -1;
      if (ob !== oa) return ob - oa;
      const ta = effectivePendingClockMs(a) ?? 0;
      const tb = effectivePendingClockMs(b) ?? 0;
      return ta - tb;
    });
  }
  if (key === "unassignable") {
    return copy.sort((a, b) => {
      const ta = effectivePendingClockMs(a) ?? Number.POSITIVE_INFINITY;
      const tb = effectivePendingClockMs(b) ?? Number.POSITIVE_INFINITY;
      return ta - tb;
    });
  }
  if (key === "unassigned") {
    return copy.sort((a, b) => {
      const ta = bookingScheduledStartUtcMs(a.date, a.time) ?? Number.POSITIVE_INFINITY;
      const tb = bookingScheduledStartUtcMs(b.date, b.time) ?? Number.POSITIVE_INFINITY;
      return ta - tb;
    });
  }
  if (key === "starting-soon") {
    return copy.sort((a, b) => {
      const sa = startsInMinutesFromNow(a.date, a.time, nowMs) ?? 9999;
      const sb = startsInMinutesFromNow(b.date, b.time, nowMs) ?? 9999;
      return sa - sb;
    });
  }
  return copy;
}

export function computeOpsSnapshotFromRows(rows: OpsSnapshotRow[], nowMs = Date.now()): OpsSnapshot {
  const slaMinutes = getDispatchSlaBreachMinutes();
  let unassignable = 0;
  let slaBreaches = 0;
  let oldestBreachMinutes = 0;
  let slaBreachesOverdueGt30 = 0;
  let slaBreachesOverdueGt10Le30 = 0;
  let worstBreachOverdue = -1;
  let slaWorstBreachPendingSinceIso: string | null = null;
  let unassigned = 0;
  let startingSoon = 0;
  let startingSoonNextMinutes: number | null = null;

  for (const r of rows) {
    if (isClosedStatus(r.status)) continue;
    const st = String(r.status ?? "").toLowerCase();
    if (st === "pending_payment") continue;

    const ds = String(r.dispatch_status ?? "").toLowerCase();
    const noCleaner = !r.cleaner_id;

    if (ds === "unassignable") {
      unassignable++;
    }

    if (isSlaBreachRow(r, nowMs, slaMinutes)) {
      slaBreaches++;
      const overdue = breachOverdueMinutes(r, nowMs, slaMinutes) ?? 0;
      oldestBreachMinutes = Math.max(oldestBreachMinutes, overdue);
      if (overdue > 30) slaBreachesOverdueGt30++;
      else if (overdue > 10) slaBreachesOverdueGt10Le30++;

      const eff = effectivePendingClockIso(r);
      if (overdue > worstBreachOverdue) {
        worstBreachOverdue = overdue;
        slaWorstBreachPendingSinceIso = eff;
      } else if (overdue === worstBreachOverdue && eff) {
        const cur = slaWorstBreachPendingSinceIso;
        if (!cur || new Date(eff).getTime() < new Date(cur).getTime()) {
          slaWorstBreachPendingSinceIso = eff;
        }
      }
    }

    if (noCleaner && isPaid(r)) {
      unassigned++;
    }

    if (noCleaner) {
      const startsIn = startsInMinutesFromNow(r.date, r.time, nowMs);
      if (startsIn != null && startsIn >= 0 && startsIn < 120) {
        startingSoon++;
        startingSoonNextMinutes =
          startingSoonNextMinutes == null ? startsIn : Math.min(startingSoonNextMinutes, startsIn);
      }
    }
  }

  return {
    unassignable,
    slaBreaches,
    oldestBreachMinutes,
    slaBreachesOverdueGt30,
    slaBreachesOverdueGt10Le30,
    slaWorstBreachPendingSinceIso,
    unassigned,
    startingSoon,
    startingSoonNextMinutes,
  };
}
