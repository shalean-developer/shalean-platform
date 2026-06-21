import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { isExcludedStaffCustomer } from "@/lib/admin/loadAdminCustomersList";
import { fetchAuthUsersByIds } from "@/lib/admin/searchAuthUsersForAdminCustomerLookup";
import { readCustomerProfileContact } from "@/lib/customer/readCustomerProfileContact";
import { upsertCustomerProfileContact } from "@/lib/customer/upsertCustomerProfileContact";

export type AdminCustomerDetail = {
  id: string;
  email: string;
  login_email: string | null;
  billing_email: string | null;
  full_name: string | null;
  phone: string | null;
  billing_type: string;
  schedule_type: string;
  tier: string | null;
  total_bookings: number;
  total_spend_zar: number;
  last_booking_at: string | null;
};

export async function assertAdminCustomerAccount(
  admin: SupabaseClient,
  userId: string,
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  if (!/^[0-9a-f-]{36}$/i.test(userId)) {
    return { ok: false, status: 400, error: "Invalid customer id." };
  }

  const { data: profile, error: profErr } = await admin
    .from("user_profiles")
    .select("id, role")
    .eq("id", userId)
    .maybeSingle();
  if (profErr) return { ok: false, status: 500, error: profErr.message };
  if (!profile?.id) return { ok: false, status: 404, error: "Customer not found." };

  const { data: cleanerLinks } = await admin
    .from("cleaners")
    .select("auth_user_id")
    .eq("auth_user_id", userId)
    .limit(1);
  const cleanerAuthUserIds = new Set(
    (cleanerLinks ?? [])
      .map((r) => String((r as { auth_user_id?: string }).auth_user_id ?? "").trim())
      .filter(Boolean),
  );

  const { data: authData } = await admin.auth.admin.getUserById(userId);
  const loginEmail = authData?.user?.email ?? null;

  if (
    isExcludedStaffCustomer({
      userId,
      role: (profile as { role?: string | null }).role,
      loginEmail,
      cleanerAuthUserIds,
    })
  ) {
    return { ok: false, status: 403, error: "This account is not a customer." };
  }

  return { ok: true };
}

export async function loadAdminCustomerDetail(
  admin: SupabaseClient,
  userId: string,
): Promise<AdminCustomerDetail | null> {
  const gate = await assertAdminCustomerAccount(admin, userId);
  if (!gate.ok) return null;

  const { data: profile } = await admin
    .from("user_profiles")
    .select(
      "full_name, tier, billing_email, phone, phone_e164, billing_type, schedule_type, booking_count, total_spent_cents",
    )
    .eq("id", userId)
    .maybeSingle();

  const { data: authData } = await admin.auth.admin.getUserById(userId);
  const contact = await readCustomerProfileContact(admin, userId, authData?.user ?? null);

  const { data: lastBooking } = await admin
    .from("bookings")
    .select("created_at")
    .eq("user_id", userId)
    .neq("status", "cancelled")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const p = profile as {
    tier?: string | null;
    billing_type?: string | null;
    schedule_type?: string | null;
    booking_count?: number | null;
    total_spent_cents?: number | null;
  } | null;

  return {
    id: userId,
    email: contact.bookingEmail,
    login_email: contact.loginEmail,
    billing_email: contact.billingEmail,
    full_name: contact.fullName,
    phone: contact.phone,
    billing_type: String(p?.billing_type ?? "per_booking"),
    schedule_type: String(p?.schedule_type ?? "on_demand"),
    tier: p?.tier ?? null,
    total_bookings: Math.max(0, Math.round(Number(p?.booking_count ?? 0))),
    total_spend_zar: Math.max(0, Math.round(Number(p?.total_spent_cents ?? 0) / 100)),
    last_booking_at:
      (lastBooking as { created_at?: string } | null)?.created_at ?? null,
  };
}

export async function updateAdminCustomerContact(
  admin: SupabaseClient,
  userId: string,
  body: { full_name?: string; phone?: string; billing_email?: string | null },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const fullName = typeof body.full_name === "string" ? body.full_name.trim() : "";
  if (fullName.length < 2) return { ok: false, error: "Full name must be at least 2 characters." };

  const phoneRaw = typeof body.phone === "string" ? body.phone.trim() : "";
  if (phoneRaw.length < 5) return { ok: false, error: "Phone is required." };

  const billingRaw =
    body.billing_email === null || body.billing_email === undefined
      ? undefined
      : String(body.billing_email).trim();

  const upserted = await upsertCustomerProfileContact(admin, {
    userId,
    contact: {
      fullName,
      phone: phoneRaw,
      ...(billingRaw !== undefined ? { billingEmail: billingRaw || null } : {}),
    },
  });
  if (!upserted.ok) return upserted;

  const { data: authData } = await admin.auth.admin.getUserById(userId);
  const meta =
    authData?.user?.user_metadata && typeof authData.user.user_metadata === "object"
      ? (authData.user.user_metadata as Record<string, unknown>)
      : {};

  await admin.auth.admin.updateUserById(userId, {
    user_metadata: {
      ...meta,
      full_name: fullName,
      name: fullName,
      phone: phoneRaw,
    },
  });

  return { ok: true };
}

const BOOKING_BLOCK_ERROR =
  "Customer has booking history and cannot be deleted. Keep the account for records.";
const INVOICE_BLOCK_ERROR = "Customer has monthly invoices and cannot be deleted.";
const RECURRING_BLOCK_ERROR = "Customer has a recurring plan and cannot be deleted.";

async function loadCleanerAuthUserIds(admin: SupabaseClient): Promise<Set<string>> {
  const out = new Set<string>();
  const { data } = await admin.from("cleaners").select("auth_user_id").not("auth_user_id", "is", null);
  for (const row of data ?? []) {
    const id = String((row as { auth_user_id?: string }).auth_user_id ?? "").trim();
    if (id) out.add(id);
  }
  return out;
}

async function customerDeleteBlockReason(
  admin: SupabaseClient,
  userId: string,
): Promise<string | null> {
  const [{ count: bookingCount }, { count: invoiceCount }, { count: recurringCount }] = await Promise.all([
    admin.from("bookings").select("id", { count: "exact", head: true }).eq("user_id", userId),
    admin.from("monthly_invoices").select("id", { count: "exact", head: true }).eq("customer_id", userId),
    admin.from("recurring_bookings").select("id", { count: "exact", head: true }).eq("customer_id", userId),
  ]);

  if ((bookingCount ?? 0) > 0) return BOOKING_BLOCK_ERROR;
  if ((invoiceCount ?? 0) > 0) return INVOICE_BLOCK_ERROR;
  if ((recurringCount ?? 0) > 0) return RECURRING_BLOCK_ERROR;
  return null;
}

async function removeCustomerAccountRow(
  admin: SupabaseClient,
  userId: string,
  hasAuthUser: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (hasAuthUser) {
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  }

  const { error } = await admin.from("user_profiles").delete().eq("id", userId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function deleteAdminCustomerAccount(
  admin: SupabaseClient,
  userId: string,
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const gate = await assertAdminCustomerAccount(admin, userId);
  if (!gate.ok) return gate;

  const blockReason = await customerDeleteBlockReason(admin, userId);
  if (blockReason) {
    return { ok: false, status: 409, error: blockReason };
  }

  const { data: authData } = await admin.auth.admin.getUserById(userId);
  const removed = await removeCustomerAccountRow(admin, userId, Boolean(authData?.user?.id));
  if (!removed.ok) return { ok: false, status: 500, error: removed.error };
  return { ok: true };
}

export type BulkDeleteAdminCustomerResult = {
  deleted: string[];
  failed: Array<{ user_id: string; error: string }>;
};

const BULK_DELETE_MAX = 50;
const BULK_DELETE_CONCURRENCY = 5;

function chunkArray<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function loadUserIdsWithRelatedRows(
  admin: SupabaseClient,
  table: "bookings" | "monthly_invoices" | "recurring_bookings",
  column: "user_id" | "customer_id",
  userIds: string[],
): Promise<Set<string>> {
  const blocked = new Set<string>();
  for (const chunk of chunkArray(userIds, 100)) {
    const { data, error } = await admin.from(table).select(column).in(column, chunk);
    if (error) throw new Error(error.message);
    for (const row of data ?? []) {
      const id = String((row as Record<string, string | null>)[column] ?? "").trim();
      if (id) blocked.add(id);
    }
  }
  return blocked;
}

async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  let index = 0;
  async function worker() {
    while (index < items.length) {
      const current = items[index];
      index += 1;
      if (current === undefined) return;
      await fn(current);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
}

/** Delete up to 50 customer accounts; skips failures and returns per-id results. */
export async function bulkDeleteAdminCustomerAccounts(
  admin: SupabaseClient,
  rawUserIds: string[],
): Promise<{ ok: true; result: BulkDeleteAdminCustomerResult } | { ok: false; status: number; error: string }> {
  const userIds = [...new Set(rawUserIds.map((id) => String(id ?? "").trim()).filter(Boolean))];
  if (userIds.length === 0) {
    return { ok: false, status: 400, error: "Select at least one customer." };
  }
  if (userIds.length > BULK_DELETE_MAX) {
    return { ok: false, status: 400, error: `Delete at most ${BULK_DELETE_MAX} customers at a time.` };
  }
  for (const id of userIds) {
    if (!/^[0-9a-f-]{36}$/i.test(id)) {
      return { ok: false, status: 400, error: `Invalid customer id: ${id}` };
    }
  }

  const [cleanerAuthUserIds, profilesRes, authById, withBookings, withInvoices, withRecurring] =
    await Promise.all([
      loadCleanerAuthUserIds(admin),
      admin.from("user_profiles").select("id, role").in("id", userIds),
      fetchAuthUsersByIds(admin, userIds),
      loadUserIdsWithRelatedRows(admin, "bookings", "user_id", userIds),
      loadUserIdsWithRelatedRows(admin, "monthly_invoices", "customer_id", userIds),
      loadUserIdsWithRelatedRows(admin, "recurring_bookings", "customer_id", userIds),
    ]);

  if (profilesRes.error) {
    return { ok: false, status: 500, error: profilesRes.error.message };
  }

  const profileById = new Map(
    (profilesRes.data ?? []).map((row) => [String((row as { id: string }).id), row as { id: string; role?: string | null }]),
  );

  const deleted: string[] = [];
  const failed: BulkDeleteAdminCustomerResult["failed"] = [];
  const toDelete: Array<{ userId: string; hasAuthUser: boolean }> = [];

  for (const userId of userIds) {
    const profile = profileById.get(userId);
    if (!profile) {
      failed.push({ user_id: userId, error: "Customer not found." });
      continue;
    }

    const loginEmail = authById.get(userId)?.email ?? null;
    if (
      isExcludedStaffCustomer({
        userId,
        role: profile.role,
        loginEmail,
        cleanerAuthUserIds,
      })
    ) {
      failed.push({ user_id: userId, error: "This account is not a customer." });
      continue;
    }

    if (withBookings.has(userId)) {
      failed.push({ user_id: userId, error: BOOKING_BLOCK_ERROR });
      continue;
    }
    if (withInvoices.has(userId)) {
      failed.push({ user_id: userId, error: INVOICE_BLOCK_ERROR });
      continue;
    }
    if (withRecurring.has(userId)) {
      failed.push({ user_id: userId, error: RECURRING_BLOCK_ERROR });
      continue;
    }

    toDelete.push({ userId, hasAuthUser: authById.has(userId) });
  }

  await runWithConcurrency(toDelete, BULK_DELETE_CONCURRENCY, async ({ userId, hasAuthUser }) => {
    const removed = await removeCustomerAccountRow(admin, userId, hasAuthUser);
    if (removed.ok) {
      deleted.push(userId);
    } else {
      failed.push({ user_id: userId, error: removed.error });
    }
  });

  return { ok: true, result: { deleted, failed } };
}
