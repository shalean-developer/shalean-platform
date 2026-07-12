import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export type PricingCatalogTable = "pricing_services" | "pricing_extras" | "pricing_booking_config";

/**
 * Best-effort catalog audit. Never throws — catalog writes must not fail on audit errors.
 */
export async function recordPricingCatalogAudit(
  admin: SupabaseClient,
  args: {
    tableName: PricingCatalogTable;
    rowId: string;
    action: "insert" | "update" | "delete" | "rollback";
    beforeRow?: Record<string, unknown> | null;
    afterRow?: Record<string, unknown> | null;
    actorUserId?: string | null;
    actorEmail?: string | null;
    rollbackOf?: string | null;
  },
): Promise<void> {
  try {
    await admin.from("pricing_catalog_audit").insert({
      table_name: args.tableName,
      row_id: args.rowId,
      action: args.action,
      before_row: args.beforeRow ?? null,
      after_row: args.afterRow ?? null,
      actor_user_id: args.actorUserId ?? null,
      actor_email: args.actorEmail ?? null,
      ...(args.rollbackOf ? { rollback_of: args.rollbackOf } : {}),
    });
  } catch (err) {
    console.warn("[pricing_catalog_audit] insert failed:", err);
  }
}
