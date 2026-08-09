import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { fetchAuthUsersByIds } from "@/lib/admin/searchAuthUsersForAdminCustomerLookup";
import { isAdmin } from "@/lib/auth/admin";

export type AdminCustomerListRow = {
  id: string;
  user_id: string;
  crm_customer_id: string;
  auth_user_id: string | null;
  email: string;
  full_name: string | null;
  phone: string | null;
  location: string | null;
  suburb: string | null;
  total_bookings: number;
  total_spend_zar: number;
  last_booking_at: string | null;
  tier: string | null;
  status: "active" | "inactive";
  has_active_recurring_plan: boolean;
};

type CrmCustomerRow = {
  id: string;
  auth_user_id: string | null;
  display_name: string | null;
  primary_email: string | null;
  normalized_email: string | null;
  primary_phone: string | null;
  normalized_phone: string | null;
  status: string;
  updated_at: string | null;
};

type ProfileRow = {
  id: string;
  full_name: string | null;
  tier: string | null;
  billing_email: string | null;
  phone: string | null;
  phone_e164: string | null;
  role: string | null;
};

type BookingRow = {
  crm_customer_id: string | null;
  created_at: string | null;
  suburb: string | null;
  location: string | null;
  amount_paid_cents: number | null;
  total_paid_zar: number | null;
};

type BookingAggregate = {
  count: number;
  spendCents: number;
  lastBookingAt: string | null;
  suburb: string | null;
  location: string | null;
};

const ACTIVE_MS = 1000 * 60 * 60 * 24 * 90;

export function deriveCustomerListStatus(params: {
  lastBookingAt: string | null;
  hasActiveRecurringPlan: boolean;
  nowMs?: number;
}): "active" | "inactive" {
  if (params.hasActiveRecurringPlan) return "active";
  if (!params.lastBookingAt) return "inactive";
  const now = params.nowMs ?? Date.now();
  return now - new Date(params.lastBookingAt).getTime() <= ACTIVE_MS ? "active" : "inactive";
}

export function resolveCustomerTotalBookings(profileCount: number, actualCount: number): number {
  return Math.max(0, Math.max(Math.round(profileCount), Math.round(actualCount)));
}

/** True when the linked auth account belongs to staff, not a billing customer. */
export function isExcludedStaffCustomer(params: {
  userId: string;
  role: string | null | undefined;
  loginEmail: string | null | undefined;
  cleanerAuthUserIds: ReadonlySet<string>;
}): boolean {
  const role = String(params.role ?? "").trim().toLowerCase();
  if (role === "admin" || role === "cleaner") return true;
  if (params.cleanerAuthUserIds.has(params.userId)) return true;
  const email = String(params.loginEmail ?? "").trim().toLowerCase();
  if (email && isAdmin(email)) return true;
  return false;
}

async function loadCleanerAuthUserIds(admin: SupabaseClient): Promise<Set<string>> {
  const out = new Set<string>();
  const { data } = await admin.from("cleaners").select("auth_user_id").not("auth_user_id", "is", null);
  for (const row of data ?? []) {
    const id = String((row as { auth_user_id?: string }).auth_user_id ?? "").trim();
    if (id) out.add(id);
  }
  return out;
}

async function loadCrmCustomers(admin: SupabaseClient): Promise<CrmCustomerRow[]> {
  const all: CrmCustomerRow[] = [];
  const pageSize = 500;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await admin
      .from("customers")
      .select("id,auth_user_id,display_name,primary_email,normalized_email,primary_phone,normalized_phone,status,updated_at")
      .eq("status", "active")
      .order("updated_at", { ascending: false })
      .range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as CrmCustomerRow[];
    all.push(...rows);
    if (rows.length < pageSize) break;
  }
  return all;
}

async function loadProfilesByAuthId(admin: SupabaseClient, userIds: string[]): Promise<Map<string, ProfileRow>> {
  const out = new Map<string, ProfileRow>();
  const chunkSize = 100;
  for (let i = 0; i < userIds.length; i += chunkSize) {
    const chunk = userIds.slice(i, i + chunkSize);
    if (!chunk.length) continue;
    const { data } = await admin
      .from("user_profiles")
      .select("id,full_name,tier,billing_email,phone,phone_e164,role")
      .in("id", chunk);
    for (const raw of data ?? []) {
      const row = raw as ProfileRow;
      if (row.id) out.set(row.id, row);
    }
  }
  return out;
}

async function loadBookingAggregates(admin: SupabaseClient): Promise<Map<string, BookingAggregate>> {
  const out = new Map<string, BookingAggregate>();
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await admin
      .from("bookings")
      .select("crm_customer_id,created_at,suburb,location,amount_paid_cents,total_paid_zar")
      .not("crm_customer_id", "is", null)
      .neq("status", "cancelled")
      .order("created_at", { ascending: false })
      .range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as BookingRow[];
    for (const row of rows) {
      const id = String(row.crm_customer_id ?? "").trim();
      if (!id) continue;
      const existing = out.get(id) ?? {
        count: 0,
        spendCents: 0,
        lastBookingAt: null,
        suburb: null,
        location: null,
      };
      existing.count += 1;
      const paidCents = Number.isFinite(Number(row.amount_paid_cents))
        ? Math.max(0, Math.round(Number(row.amount_paid_cents)))
        : Math.max(0, Math.round(Number(row.total_paid_zar ?? 0) * 100));
      existing.spendCents += paidCents;
      if (!existing.lastBookingAt && row.created_at) {
        existing.lastBookingAt = row.created_at;
        existing.suburb = row.suburb ?? null;
        existing.location = row.location ?? null;
      }
      out.set(id, existing);
    }
    if (rows.length < pageSize) break;
  }
  return out;
}

async function loadActiveRecurringAuthIds(admin: SupabaseClient, userIds: string[]): Promise<Set<string>> {
  const out = new Set<string>();
  const chunkSize = 100;
  for (let i = 0; i < userIds.length; i += chunkSize) {
    const chunk = userIds.slice(i, i + chunkSize);
    if (!chunk.length) continue;
    const { data } = await admin
      .from("recurring_bookings")
      .select("customer_id")
      .eq("status", "active")
      .in("customer_id", chunk);
    for (const raw of data ?? []) {
      const uid = String((raw as { customer_id?: string | null }).customer_id ?? "").trim();
      if (uid) out.add(uid);
    }
  }
  return out;
}

/**
 * P4 CRM source of truth: customer identity comes from `customers`.
 * Auth/user_profiles are optional enrichment; booking facts aggregate by `crm_customer_id`.
 */
export async function loadAdminCustomersList(admin: SupabaseClient): Promise<AdminCustomerListRow[]> {
  const crmCustomers = await loadCrmCustomers(admin);
  const authIds = crmCustomers.map((c) => c.auth_user_id).filter((id): id is string => Boolean(id));
  const [cleanerAuthUserIds, profilesById, authById, bookingsByCustomer, activeRecurringIds] = await Promise.all([
    loadCleanerAuthUserIds(admin),
    loadProfilesByAuthId(admin, authIds),
    fetchAuthUsersByIds(admin, authIds),
    loadBookingAggregates(admin),
    loadActiveRecurringAuthIds(admin, authIds),
  ]);

  const now = Date.now();
  const customers: AdminCustomerListRow[] = [];

  for (const crm of crmCustomers) {
    const authId = crm.auth_user_id;
    const profile = authId ? profilesById.get(authId) : undefined;
    const auth = authId ? authById.get(authId) : undefined;

    if (
      authId &&
      isExcludedStaffCustomer({
        userId: authId,
        role: profile?.role,
        loginEmail: auth?.email ?? null,
        cleanerAuthUserIds,
      })
    ) {
      continue;
    }

    const aggregate = bookingsByCustomer.get(crm.id);
    const hasActiveRecurringPlan = Boolean(authId && activeRecurringIds.has(authId));
    const email = String(crm.primary_email ?? crm.normalized_email ?? profile?.billing_email ?? auth?.email ?? "").trim();
    const phone = String(crm.primary_phone ?? crm.normalized_phone ?? profile?.phone_e164 ?? profile?.phone ?? "").trim() || null;
    const fullName = crm.display_name?.trim() || profile?.full_name?.trim() || auth?.metaDisplayName || null;
    const lastBookingAt = aggregate?.lastBookingAt ?? null;

    customers.push({
      // Preserve legacy UI action compatibility for auth-linked customers while exposing the stable CRM id explicitly.
      id: authId ?? crm.id,
      user_id: authId ?? crm.id,
      crm_customer_id: crm.id,
      auth_user_id: authId ?? null,
      email: email || phone || `(no contact · ${crm.id.slice(0, 8)})`,
      full_name: fullName,
      phone,
      location: aggregate?.location ?? null,
      suburb: aggregate?.suburb ?? null,
      total_bookings: aggregate?.count ?? 0,
      total_spend_zar: Math.max(0, Math.round((aggregate?.spendCents ?? 0) / 100)),
      last_booking_at: lastBookingAt,
      tier: profile?.tier ?? null,
      has_active_recurring_plan: hasActiveRecurringPlan,
      status: deriveCustomerListStatus({
        lastBookingAt,
        hasActiveRecurringPlan,
        nowMs: now,
      }),
    });
  }

  customers.sort((a, b) => {
    const aKey = a.last_booking_at ?? "";
    const bKey = b.last_booking_at ?? "";
    if (aKey !== bKey) return bKey.localeCompare(aKey);
    return a.email.localeCompare(b.email);
  });

  return customers;
}
