import type { SupabaseClient } from "@supabase/supabase-js";

export const CUSTOMER_ADDRESS_SELECT =
  "id, user_id, label, line1, suburb, city, postal_code, notes, is_default, created_at, updated_at";

export type CustomerAddressWriteInput = {
  label: string;
  line1: string;
  suburb: string;
  city: string;
  postalCode: string;
  notes: string | null;
  isDefault: boolean;
};

export type CustomerAddressWriteResult =
  | { ok: true; value: CustomerAddressWriteInput }
  | { ok: false; error: string };

/** Accepts camelCase or snake_case bodies from mobile / web. */
export function parseCustomerAddressWriteBody(
  body: Record<string, unknown>,
  opts?: { partial?: boolean },
): CustomerAddressWriteResult {
  const partial = opts?.partial === true;
  const labelRaw = body.label;
  const line1Raw = body.line1;
  const suburbRaw = body.suburb;
  const cityRaw = body.city;
  const postalRaw = body.postalCode ?? body.postal_code;
  const notesRaw = body.notes;
  const defaultRaw = body.isDefault ?? body.is_default;

  const label = typeof labelRaw === "string" ? labelRaw.trim() : "";
  const line1 = typeof line1Raw === "string" ? line1Raw.trim() : "";
  const suburb = typeof suburbRaw === "string" ? suburbRaw.trim() : "";
  const city =
    typeof cityRaw === "string" && cityRaw.trim().length > 0 ? cityRaw.trim() : "Cape Town";
  const postalCode = typeof postalRaw === "string" ? postalRaw.trim() : "";
  const notes =
    typeof notesRaw === "string" ? notesRaw.trim().slice(0, 2000) || null : null;
  const isDefault = typeof defaultRaw === "boolean" ? defaultRaw : false;

  if (!partial || typeof labelRaw === "string") {
    if (label.length < 1 || label.length > 120) {
      return { ok: false, error: "label (property name) is required (1–120 chars)." };
    }
  }
  if (!partial || typeof line1Raw === "string") {
    if (line1.length < 1 || line1.length > 240) {
      return { ok: false, error: "line1 is required (1–240 chars)." };
    }
  }
  if (!partial || typeof suburbRaw === "string") {
    if (suburb.length < 1 || suburb.length > 120) {
      return { ok: false, error: "suburb is required (1–120 chars)." };
    }
  }

  return {
    ok: true,
    value: { label, line1, suburb, city, postalCode, notes, isDefault },
  };
}

export async function clearOtherDefaultAddresses(
  admin: SupabaseClient,
  userId: string,
  exceptId?: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  let q = admin
    .from("customer_saved_addresses")
    .update({ is_default: false, updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("is_default", true);
  if (exceptId) q = q.neq("id", exceptId);
  const { error } = await q;
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Ownership probe: address belongs to userId. */
export function customerOwnsAddressRow(
  row: { user_id?: string | null } | null | undefined,
  userId: string,
): boolean {
  const uid = String(userId ?? "").trim();
  const rowUid = String(row?.user_id ?? "").trim();
  return Boolean(uid && rowUid && uid === rowUid);
}
