import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { reportOperationalIssue } from "@/lib/logging/systemLog";

/** Same threshold as {@link computeBookingEarnings} / {@link calculateCleanerPayout}. */
export const TENURE_MONTHS_THRESHOLD_FOR_LINE_SHARE = 4;

/** Tenure-based share of eligible line totals (matches display/hybrid tenure bands). */
export const NEW_CLEANER_LINE_SHARE = 0.6;
export const EXPERIENCED_CLEANER_LINE_SHARE = 0.7;

/** Last-resort line share when snapshot and tenure cannot be resolved (legacy rows). */
export const FALLBACK_LINE_CLEANER_SHARE = 0.7;

/**
 * Calendar months between cleaner anchor (`joined_at` / `created_at`) and booking appointment,
 * matching `computeBookingEarnings` / `monthsBetween` semantics.
 */
export function monthsBetweenCleanerJoinedAndBookingDate(joinedAtIso: string, bookingDateIso: string): number {
  const d1 = new Date(joinedAtIso);
  const d2 = new Date(bookingDateIso);
  if (Number.isNaN(d1.getTime()) || Number.isNaN(d2.getTime())) {
    return 0;
  }
  let months = (d2.getFullYear() - d1.getFullYear()) * 12 + (d2.getMonth() - d1.getMonth());
  if (d2.getDate() < d1.getDate()) {
    months -= 1;
  }
  return Math.max(months, 0);
}

/**
 * Appointment instant for tenure (UTC Z). Requires `YYYY-MM-DD` date; time optional `HH:MM`.
 * Returns null if date is missing/invalid — callers must not substitute "now" for booking time.
 */
export function bookingAppointmentIsoUtc(
  dateYmd: string | null | undefined,
  timeHm: string | null | undefined,
): string | null {
  const d = String(dateYmd ?? "").trim();
  const t = String(timeHm ?? "").trim().slice(0, 5);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
  if (/^\d{2}:\d{2}$/.test(t)) return `${d}T${t}:00.000Z`;
  return `${d}T12:00:00.000Z`;
}

export function tenureMonthsToLineSharePercentage(months: number): number {
  return months < TENURE_MONTHS_THRESHOLD_FOR_LINE_SHARE ? NEW_CLEANER_LINE_SHARE : EXPERIENCED_CLEANER_LINE_SHARE;
}

export function parseStoredCleanerSharePercentage(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  const n = Number(typeof raw === "string" ? raw.trim() : raw);
  if (!Number.isFinite(n) || n < 0 || n > 1) return null;
  return n;
}

/**
 * 0.6 / 0.7 from cleaner tenure at **booking appointment** (not wall clock). Returns null if
 * cleaner id or appointment date cannot be resolved.
 */
export async function resolveTenureBasedCleanerShareForBookingRow(params: {
  admin: SupabaseClient;
  cleanerId: string | null | undefined;
  bookingDate: string | null | undefined;
  bookingTime: string | null | undefined;
}): Promise<number | null> {
  const cid = String(params.cleanerId ?? "").trim();
  if (!/^[0-9a-f-]{36}$/i.test(cid)) return null;

  const apptIso = bookingAppointmentIsoUtc(params.bookingDate, params.bookingTime);
  if (!apptIso) return null;

  const { data: c, error } = await params.admin.from("cleaners").select("joined_at, created_at").eq("id", cid).maybeSingle();
  if (error || !c) return null;

  const row = c as { joined_at?: string | null; created_at?: string | null };
  const joinedRaw = String(row.joined_at ?? row.created_at ?? "").trim();
  if (!joinedRaw) return null;

  const months = monthsBetweenCleanerJoinedAndBookingDate(joinedRaw, apptIso);
  return tenureMonthsToLineSharePercentage(months);
}

/**
 * Line-ledger share: prefer stored `cleaner_share_percentage`; else tenure at appointment
 * for `cleanerId`; else last-resort constant (with warn).
 */
export async function resolveEffectiveLineCleanerSharePercentageForBooking(
  admin: SupabaseClient,
  params: {
    bookingId: string;
    cleanerId: string;
    row: { cleaner_share_percentage?: unknown; date?: string | null; time?: string | null };
    logSource: string;
  },
): Promise<number> {
  const bid = params.bookingId.trim();
  const parsed = parseStoredCleanerSharePercentage(params.row.cleaner_share_percentage);
  if (parsed != null) return parsed;

  const fromTenure = await resolveTenureBasedCleanerShareForBookingRow({
    admin,
    cleanerId: params.cleanerId,
    bookingDate: params.row.date,
    bookingTime: params.row.time,
  });
  if (fromTenure != null) return fromTenure;

  void reportOperationalIssue("warn", params.logSource, "Missing cleaner_share_percentage and tenure — using fallback", {
    bookingId: bid,
    cleanerId: params.cleanerId,
  });
  return FALLBACK_LINE_CLEANER_SHARE;
}
