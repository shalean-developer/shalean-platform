import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { digitsOnly, normalizeSouthAfricaPhone } from "@/lib/utils/phone";

/**
 * Stable login email for walk-in customers without a personal email (Auth requires an email).
 * Example: +27810768318 → 27810768318@walkin.shalean.com
 */
export function customerGeneratedLoginEmailFromE164(normalizedPhone: string): string {
  const d = digitsOnly(normalizedPhone);
  return `${d}@walkin.shalean.com`.toLowerCase();
}

export function customerGeneratedLoginEmailFromAnyPhone(phone: string): string | null {
  const n = normalizeSouthAfricaPhone(phone);
  if (!n) return null;
  return customerGeneratedLoginEmailFromE164(n);
}

export function normalizeCustomerEmail(value: string | null | undefined): string | null {
  const email = String(value ?? "").trim().toLowerCase();
  return email || null;
}

/** CRM phone normalization must preserve valid international numbers, not force every number to ZA. */
export function normalizeCustomerPhone(value: string | null | undefined): string | null {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("00")) return digits.slice(2) || null;
  if (digits.startsWith("0") && digits.length >= 9) return `27${digits.slice(1)}`;
  return digits;
}

type ResolveCustomerInput = {
  authUserId?: string | null;
  email?: string | null;
  phone?: string | null;
  displayName?: string | null;
  source: string;
  createIfMissing?: boolean;
};

type AliasRow = { customer_id: string };

async function aliasCustomerIds(admin: SupabaseClient, type: "email" | "phone", value: string | null): Promise<string[]> {
  if (!value) return [];
  const { data, error } = await admin
    .from("customer_identity_aliases")
    .select("customer_id")
    .eq("identity_type", type)
    .eq("normalized_value", value)
    .limit(10);
  if (error) throw error;
  return [...new Set((data ?? []).map((row) => (row as AliasRow).customer_id).filter(Boolean))];
}

async function rememberAlias(
  admin: SupabaseClient,
  customerId: string,
  type: "email" | "phone",
  normalizedValue: string | null,
  rawValue: string | null | undefined,
  source: string,
) {
  if (!normalizedValue) return;
  const now = new Date().toISOString();
  const { data } = await admin
    .from("customer_identity_aliases")
    .select("id")
    .eq("customer_id", customerId)
    .eq("identity_type", type)
    .eq("normalized_value", normalizedValue)
    .maybeSingle();
  if (data?.id) {
    await admin.from("customer_identity_aliases").update({ last_seen_at: now, raw_value: rawValue ?? null, source }).eq("id", data.id);
    return;
  }
  await admin.from("customer_identity_aliases").insert({
    customer_id: customerId,
    identity_type: type,
    normalized_value: normalizedValue,
    raw_value: rawValue ?? null,
    source,
    first_seen_at: now,
    last_seen_at: now,
  });
}

export async function resolveCanonicalCustomer(admin: SupabaseClient, input: ResolveCustomerInput) {
  const normalizedEmail = normalizeCustomerEmail(input.email);
  const normalizedPhone = normalizeCustomerPhone(input.phone);

  if (input.authUserId) {
    const { data, error } = await admin.from("customers").select("*").eq("auth_user_id", input.authUserId).eq("status", "active").maybeSingle();
    if (error) return { ok: false as const, error: error.message };
    if (data) {
      await rememberAlias(admin, data.id, "email", normalizedEmail, input.email, input.source);
      await rememberAlias(admin, data.id, "phone", normalizedPhone, input.phone, input.source);
      return { ok: true as const, customer: data, matchedBy: "auth_user_id" as const };
    }
  }

  try {
    const emailIds = await aliasCustomerIds(admin, "email", normalizedEmail);
    const phoneIds = await aliasCustomerIds(admin, "phone", normalizedPhone);
    const candidates = [...new Set([...emailIds, ...phoneIds])];
    if (candidates.length > 1) return { ok: false as const, error: "ambiguous_customer_identity", candidateCustomerIds: candidates };
    if (candidates.length === 1) {
      const customerId = candidates[0];
      const { data, error } = await admin.from("customers").select("*").eq("id", customerId).eq("status", "active").maybeSingle();
      if (error || !data) return { ok: false as const, error: error?.message ?? "customer_not_found" };
      if (input.authUserId && !data.auth_user_id) {
        const { data: authConflict } = await admin.from("customers").select("id").eq("auth_user_id", input.authUserId).eq("status", "active").maybeSingle();
        if (!authConflict) await admin.from("customers").update({ auth_user_id: input.authUserId, updated_at: new Date().toISOString() }).eq("id", customerId);
      }
      await rememberAlias(admin, customerId, "email", normalizedEmail, input.email, input.source);
      await rememberAlias(admin, customerId, "phone", normalizedPhone, input.phone, input.source);
      return { ok: true as const, customer: data, matchedBy: emailIds.length ? "email_alias" as const : "phone_alias" as const };
    }
  } catch (error) {
    return { ok: false as const, error: error instanceof Error ? error.message : "identity_lookup_failed" };
  }

  if (input.createIfMissing === false) return { ok: false as const, error: "customer_not_found" };
  const now = new Date().toISOString();
  const { data, error } = await admin.from("customers").insert({
    auth_user_id: input.authUserId ?? null,
    display_name: input.displayName?.trim() || null,
    primary_email: input.email?.trim() || null,
    normalized_email: normalizedEmail,
    primary_phone: input.phone?.trim() || null,
    normalized_phone: normalizedPhone,
    metadata: { created_from: input.source },
    created_at: now,
    updated_at: now,
  }).select("*").single();
  if (error || !data) return { ok: false as const, error: error?.message ?? "customer_create_failed" };
  await rememberAlias(admin, data.id, "email", normalizedEmail, input.email, input.source);
  await rememberAlias(admin, data.id, "phone", normalizedPhone, input.phone, input.source);
  return { ok: true as const, customer: data, matchedBy: "created" as const };
}
