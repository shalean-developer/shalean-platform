import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getOrCreateVendor } from "@/lib/zoho/zohoBooksService";
import { logSystemEvent } from "@/lib/logging/systemLog";

/**
 * Push a local vendor to Zoho Books as a supplier contact. Idempotent.
 */
export async function syncVendorToZoho(
  admin: SupabaseClient,
  vendorId: string,
): Promise<{ ok: true; zohoVendorId: string } | { ok: false; error: string }> {
  const { data: vendor } = await admin
    .from("expense_vendors")
    .select("id, name, email, phone, external_accounting_id, sync_status")
    .eq("id", vendorId)
    .maybeSingle();

  if (!vendor) return { ok: false, error: "vendor_not_found" };
  if (vendor.external_accounting_id && vendor.sync_status === "synced") {
    return { ok: true, zohoVendorId: vendor.external_accounting_id };
  }

  const res = await getOrCreateVendor({
    name: vendor.name,
    email: vendor.email ?? undefined,
    phone: vendor.phone ?? undefined,
  });

  if (!res.ok) {
    const now = new Date().toISOString();
    await admin
      .from("expense_vendors")
      .update({ sync_status: "failed", sync_errors: res.error, updated_at: now })
      .eq("id", vendorId);
    return { ok: false, error: res.error };
  }

  const now = new Date().toISOString();
  await admin
    .from("expense_vendors")
    .update({
      external_accounting_id: res.vendorId,
      sync_status: "synced",
      last_synced_at: now,
      sync_errors: null,
      updated_at: now,
    })
    .eq("id", vendorId);

  await logSystemEvent({
    level: "info",
    source: "accounting/syncVendorToZoho",
    message: "vendor_synced_to_zoho",
    context: { vendor_id: vendorId, zoho_vendor_id: res.vendorId },
  });

  return { ok: true, zohoVendorId: res.vendorId };
}
