import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { fetchAuthUsersByIds } from "@/lib/admin/searchAuthUsersForAdminCustomerLookup";
import { isAdmin } from "@/lib/auth/admin";
import { normalizeEmail } from "@/lib/booking/normalizeEmail";
import { pickBillingEmail } from "@/lib/zoho/shaleanBillingContactEmail";

export type AdminCustomerListRow = {
  id: string;
  user_id: string;
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

type ProfileRow = {
  id: string;
  full_name: string | null;
  tier: string | null;
  billing_email: string | null;
  phone: string | null;
  phone_e164: string | null;
  role: string | null;
  booking_count: number | null;
  total_spent_cents: number | null;
  updated_at: string | null;
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

/** True when the profile belongs to staff (admin/cleaner), not a billing customer. */
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

async function loadAllCustomerProfiles(admin: SupabaseClient): Promise<ProfileRow[]> {
  const all: ProfileRow[] = [];
  const pageSize = 500;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await admin
      .from("user_profiles")
      .select(
        "id, full_name, tier, billing_email, phone, phone_e164, role, booking_count, total_spent_cents, updated_at",
      )
      .eq("role", "customer")
      .order("updated_at", { ascending: false })
      .range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as ProfileRow[];
    all.push(...rows);
    if (rows.length < pageSize) break;
  }
  return all;
}

async function loadLatestBookingHints(
  admin: SupabaseClient,
  userIds: string[],
): Promise<Map<string, { last_booking_at: string; suburb: string | null; location: string | null }>> {
  const out = new Map<string, { last_booking_at: string; suburb: string | null; location: string | null }>();
  const chunkSize = 100;
  for (let i = 0; i < userIds.length; i += chunkSize) {
    const chunk = userIds.slice(i, i + chunkSize);
    const { data } = await admin
      .from("bookings")
      .select("user_id, created_at, suburb, location")
      .in("user_id", chunk)
      .neq("status", "cancelled")
      .order("created_at", { ascending: false });
    for (const raw of data ?? []) {
      const row = raw as {
        user_id?: string | null;
        created_at?: string;
        suburb?: string | null;
        location?: string | null;
      };
      const uid = String(row.user_id ?? "").trim();
      const createdAt = String(row.created_at ?? "").trim();
      if (!uid || !createdAt || out.has(uid)) continue;
      out.set(uid, {
        last_booking_at: createdAt,
        suburb: row.suburb ?? null,
        location: row.location ?? null,
      });
    }
  }
  return out;
}

async function loadBookingCountsByUserId(admin: SupabaseClient, userIds: string[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  const chunkSize = 100;
  for (let i = 0; i < userIds.length; i += chunkSize) {
    const chunk = userIds.slice(i, i + chunkSize);
    const { data } = await admin
      .from("bookings")
      .select("user_id")
      .in("user_id", chunk)
      .neq("status", "cancelled");
    for (const raw of data ?? []) {
      const uid = String((raw as { user_id?: string | null }).user_id ?? "").trim();
      if (!uid) continue;
      counts.set(uid, (counts.get(uid) ?? 0) + 1);
    }
  }
  return counts;
}

async function loadActiveRecurringCustomerIds(admin: SupabaseClient, userIds: string[]): Promise<Set<string>> {
  const out = new Set<string>();
  const chunkSize = 100;
  for (let i = 0; i < userIds.length; i += chunkSize) {
    const chunk = userIds.slice(i, i + chunkSize);
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

function displayEmail(profile: ProfileRow, loginEmail: string | null): string {
  const billing = pickBillingEmail([profile.billing_email, loginEmail]);
  if (billing) return billing;
  const login = loginEmail ? normalizeEmail(loginEmail) : null;
  if (login) return login;
  return displayPhone(profile) ?? "";
}

function displayLabel(profile: ProfileRow, loginEmail: string | null): string {
  const email = displayEmail(profile, loginEmail);
  if (email) return email;
  return `(no contact · ${profile.id.slice(0, 8)})`;
}

function displayPhone(profile: ProfileRow): string | null {
  const phone = String(profile.phone_e164 ?? profile.phone ?? "").trim();
  return phone || null;
}

/**
 * Lists all customer accounts from `user_profiles` + auth, excluding admins and cleaners.
 */
export async function loadAdminCustomersList(admin: SupabaseClient): Promise<AdminCustomerListRow[]> {
  const cleanerAuthUserIds = await loadCleanerAuthUserIds(admin);
  const profiles = await loadAllCustomerProfiles(admin);

  const preFiltered = profiles.filter(
    (profile) =>
      !isExcludedStaffCustomer({
        userId: profile.id,
        role: profile.role,
        loginEmail: null,
        cleanerAuthUserIds,
      }),
  );

  const capturedById = await fetchAuthUsersByIds(
    admin,
    preFiltered.map((p) => p.id),
  );

  const filteredProfiles: ProfileRow[] = [];
  for (const profile of preFiltered) {
    const loginEmail = capturedById.get(profile.id)?.email ?? null;
    if (
      isExcludedStaffCustomer({
        userId: profile.id,
        role: profile.role,
        loginEmail,
        cleanerAuthUserIds,
      })
    ) {
      continue;
    }
    filteredProfiles.push(profile);
  }

  const filteredIds = filteredProfiles.map((p) => p.id);
  const bookingHints = await loadLatestBookingHints(admin, filteredIds);
  const bookingCounts = await loadBookingCountsByUserId(admin, filteredIds);
  const activeRecurringIds = await loadActiveRecurringCustomerIds(admin, filteredIds);

  const now = Date.now();
  const customers: AdminCustomerListRow[] = [];

  for (const profile of filteredProfiles) {
    const auth = capturedById.get(profile.id);
    const loginEmail = auth?.email ?? null;
    const email = displayLabel(profile, loginEmail);

    const hints = bookingHints.get(profile.id);
    const totalBookings = resolveCustomerTotalBookings(
      Number(profile.booking_count ?? 0),
      bookingCounts.get(profile.id) ?? 0,
    );
    const totalSpendZar = Math.max(0, Math.round(Number(profile.total_spent_cents ?? 0) / 100));
    const lastBookingAt = hints?.last_booking_at ?? null;
    const hasActiveRecurringPlan = activeRecurringIds.has(profile.id);

    customers.push({
      id: profile.id,
      user_id: profile.id,
      email,
      full_name: profile.full_name?.trim() || auth?.metaDisplayName || null,
      phone: displayPhone(profile),
      location: hints?.location ?? null,
      suburb: hints?.suburb ?? null,
      total_bookings: totalBookings,
      total_spend_zar: totalSpendZar,
      last_booking_at: lastBookingAt,
      tier: profile.tier ?? null,
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
