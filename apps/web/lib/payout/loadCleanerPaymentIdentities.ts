import type { SupabaseClient } from "@supabase/supabase-js";
import { cleanerPaymentReference } from "./cleanerPaymentReference";

export async function loadCleanerPaymentIdentities(admin: SupabaseClient, cleanerIds: string[]) {
  const ids = [...new Set(cleanerIds)];
  const result = new Map<string, { name: string; paymentId: string }>();
  if (!ids.length) return result;
  const { data, error } = await admin.from("cleaners").select("id, full_name, payment_id").in("id", ids);
  if (error) throw new Error("Cleaner payment identities could not be loaded.");
  for (const row of data ?? []) {
    if (!ids.includes(row.id) || result.has(row.id) || !row.full_name?.trim() || !row.payment_id) {
      throw new Error("Cleaner payment identity is incomplete or ambiguous.");
    }
    cleanerPaymentReference(row.payment_id, "2026-10"); // Validate the permanent ID contract.
    result.set(row.id, { name: row.full_name.trim(), paymentId: row.payment_id });
  }
  if (result.size !== ids.length) throw new Error("Cleaner payment identity is incomplete or ambiguous.");
  return result;
}
