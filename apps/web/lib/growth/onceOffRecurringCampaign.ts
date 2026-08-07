import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { customerPhoneToE164 } from "@/lib/notifications/customerPhoneNormalize";

export const ONCE_OFF_RECURRING_TEMPLATE_KEY = "once_off_to_recurring_offer" as const;
export const ONCE_OFF_RECURRING_BOOKING_URL = "https://shalean.co.za/book";

export type OnceOffRecurringCandidate = {
  phone: string;
  phoneE164: string;
  firstName: string;
  customerName: string;
  email: string | null;
  service: string | null;
  lastCompletedAt: string;
  daysSinceLastBooking: number;
};

type BookingRow = {
  customer_name?: string | null;
  customer_phone?: string | null;
  normalized_phone?: string | null;
  customer_email?: string | null;
  service?: string | null;
  completed_at?: string | null;
  date?: string | null;
  is_recurring_generated?: boolean | null;
  recurring_id?: string | null;
};

function digits(value: string | null | undefined): string {
  return String(value ?? "").replace(/\D/g, "");
}

function completedAt(row: BookingRow): Date | null {
  if (row.completed_at) {
    const d = new Date(row.completed_at);
    if (!Number.isNaN(d.getTime())) return d;
  }
  if (row.date && /^\d{4}-\d{2}-\d{2}$/.test(row.date)) {
    const d = new Date(`${row.date}T12:00:00.000Z`);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return null;
}

function firstName(name: string | null | undefined): string {
  const value = String(name ?? "").trim();
  if (!value) return "there";
  return value.split(/\s+/)[0] || "there";
}

export async function loadOnceOffRecurringCandidates(
  admin: SupabaseClient,
  now = new Date(),
): Promise<OnceOffRecurringCandidate[]> {
  const { data, error } = await admin
    .from("bookings")
    .select("customer_name,customer_phone,normalized_phone,customer_email,service,completed_at,date,is_recurring_generated,recurring_id")
    .eq("status", "completed")
    .eq("is_test", false)
    .order("completed_at", { ascending: false, nullsFirst: false })
    .limit(5000);
  if (error) throw new Error(error.message);

  const groups = new Map<string, BookingRow[]>();
  for (const raw of data ?? []) {
    const row = raw as BookingRow;
    const key = digits(row.normalized_phone || row.customer_phone);
    if (key.length < 10 || key.length > 15) continue;
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  }

  const out: OnceOffRecurringCandidate[] = [];
  for (const [phoneKey, rows] of groups) {
    if (rows.length !== 1) continue;
    const row = rows[0];
    if (row.is_recurring_generated || row.recurring_id) continue;
    const last = completedAt(row);
    if (!last) continue;
    const days = Math.floor((now.getTime() - last.getTime()) / 86_400_000);
    if (days < 8 || days > 90) continue;
    const phoneE164 = customerPhoneToE164(row.customer_phone || row.normalized_phone || phoneKey);
    if (!phoneE164) continue;
    const name = String(row.customer_name ?? "").trim();
    out.push({
      phone: row.customer_phone || phoneKey,
      phoneE164,
      firstName: firstName(name),
      customerName: name || "Customer",
      email: String(row.customer_email ?? "").trim() || null,
      service: String(row.service ?? "").trim() || null,
      lastCompletedAt: last.toISOString(),
      daysSinceLastBooking: days,
    });
  }

  return out.sort((a, b) => b.daysSinceLastBooking - a.daysSinceLastBooking);
}
