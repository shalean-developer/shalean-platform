import "server-only";

import type { MonthlyPattern, RecurringScheduleRow } from "@/lib/recurring/calculateNextRunDate";

function isIntArrayDays(v: unknown): v is number[] {
  return Array.isArray(v) && v.length > 0 && v.every((x) => typeof x === "number" && x >= 1 && x <= 7);
}

function parseMonthlyPattern(v: unknown): MonthlyPattern | undefined {
  if (v !== "mirror_start_date" && v !== "nth_weekday" && v !== "last_weekday") return undefined;
  return v;
}

/**
 * Partial update map from JSON body (admin or customer). Returns empty object if nothing valid.
 */
export function recurringPatchFieldsFromBody(body: Record<string, unknown>): Record<string, unknown> {
  const patch: Record<string, unknown> = {};

  if (typeof body.frequency === "string" && ["weekly", "biweekly", "monthly"].includes(body.frequency)) {
    patch.frequency = body.frequency;
  }
  if (isIntArrayDays(body.days_of_week)) {
    patch.days_of_week = body.days_of_week;
  }
  if (typeof body.start_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.start_date)) {
    patch.start_date = body.start_date;
  }
  if (body.end_date === null) {
    patch.end_date = null;
  } else if (typeof body.end_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.end_date)) {
    patch.end_date = body.end_date;
  }
  if (typeof body.price === "number" && Number.isFinite(body.price) && body.price >= 0) {
    patch.price = body.price;
  }
  if (body.booking_snapshot_template !== undefined) {
    patch.booking_snapshot_template = body.booking_snapshot_template;
  }
  if (typeof body.address_id === "string" && body.address_id.trim()) {
    patch.address_id = body.address_id.trim();
  } else if (body.address_id === null) {
    patch.address_id = null;
  }

  const mp = parseMonthlyPattern(body.monthly_pattern);
  if (mp !== undefined) {
    patch.monthly_pattern = mp;
  }
  if (body.monthly_nth === null) {
    patch.monthly_nth = null;
  } else if (typeof body.monthly_nth === "number" && Number.isFinite(body.monthly_nth)) {
    const n = Math.floor(body.monthly_nth);
    if (n >= 1 && n <= 4) patch.monthly_nth = n;
  }

  return patch;
}

export function scheduleFromMergedRow(merged: Record<string, unknown>): RecurringScheduleRow {
  const mpRaw = merged.monthly_pattern;
  const monthly_pattern: MonthlyPattern | null =
    mpRaw === "mirror_start_date" || mpRaw === "nth_weekday" || mpRaw === "last_weekday" ? mpRaw : null;
  return {
    frequency: merged.frequency as RecurringScheduleRow["frequency"],
    days_of_week: merged.days_of_week as number[],
    start_date: String(merged.start_date),
    end_date: merged.end_date != null ? String(merged.end_date) : null,
    monthly_pattern,
    monthly_nth: typeof merged.monthly_nth === "number" ? merged.monthly_nth : null,
  };
}
