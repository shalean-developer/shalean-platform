import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  recordPricingCatalogAudit,
  type PricingCatalogTable,
} from "@/lib/admin/recordPricingCatalogAudit";

export type RollbackPricingCatalogAuditResult =
  | { ok: true; tableName: PricingCatalogTable; rowId: string }
  | { ok: false; error: string; code?: string; status: number };

type AuditRow = {
  id: string;
  table_name: PricingCatalogTable;
  row_id: string;
  action: string;
  before_row: Record<string, unknown> | null;
  after_row: Record<string, unknown> | null;
  created_at: string;
};

/**
 * Restore catalog state from a pricing_catalog_audit row.
 * Refuses when a newer audit exists for the same (table, row) unless `force`.
 */
export async function rollbackPricingCatalogAudit(
  admin: SupabaseClient,
  params: {
    auditId: string;
    actorUserId?: string | null;
    actorEmail?: string | null;
    force?: boolean;
  },
): Promise<RollbackPricingCatalogAuditResult> {
  const auditId = params.auditId.trim();
  if (!auditId) {
    return { ok: false, error: "Missing audit id.", code: "missing_id", status: 400 };
  }

  const { data: audit, error: loadErr } = await admin
    .from("pricing_catalog_audit")
    .select("id, table_name, row_id, action, before_row, after_row, created_at")
    .eq("id", auditId)
    .maybeSingle();

  if (loadErr) {
    return { ok: false, error: loadErr.message, code: "audit_load_failed", status: 500 };
  }
  if (!audit) {
    return { ok: false, error: "Audit row not found.", code: "not_found", status: 404 };
  }

  const row = audit as AuditRow;
  const tableName = row.table_name;
  const rowId = String(row.row_id);

  if (!params.force) {
    const { data: newer } = await admin
      .from("pricing_catalog_audit")
      .select("id")
      .eq("table_name", tableName)
      .eq("row_id", rowId)
      .gt("created_at", row.created_at)
      .limit(1)
      .maybeSingle();
    if (newer?.id) {
      return {
        ok: false,
        error:
          "A newer catalog change exists for this row. Pass force=true to rollback anyway (may overwrite later edits).",
        code: "newer_audit_exists",
        status: 409,
      };
    }
  }

  const action = String(row.action).toLowerCase();
  let beforeSnapshot: Record<string, unknown> | null = null;
  let afterSnapshot: Record<string, unknown> | null = null;

  if (action === "rollback") {
    return {
      ok: false,
      error: "Cannot rollback a rollback audit row. Pick the original change.",
      code: "invalid_action",
      status: 400,
    };
  }

  if (tableName === "pricing_booking_config") {
    const restored = row.before_row;
    if (action === "insert") {
      // Insert of config is unusual; soft-clear by writing empty object only with force.
      return {
        ok: false,
        error: "Cannot rollback insert of booking config via one-click restore.",
        code: "unsupported",
        status: 400,
      };
    }
    if (!restored || typeof restored !== "object") {
      return {
        ok: false,
        error: "Audit row has no before_row to restore.",
        code: "missing_before",
        status: 400,
      };
    }

    const { data: current } = await admin
      .from("pricing_booking_config")
      .select("id, config")
      .eq("id", rowId)
      .maybeSingle();
    beforeSnapshot = current
      ? { id: current.id, config: current.config }
      : null;

    const configPayload =
      "config" in restored && restored.config != null && typeof restored.config === "object"
        ? restored.config
        : restored;

    const { error: upErr } = await admin
      .from("pricing_booking_config")
      .update({ config: configPayload, updated_at: new Date().toISOString() })
      .eq("id", rowId);
    if (upErr) {
      return { ok: false, error: upErr.message, code: "restore_failed", status: 500 };
    }
    afterSnapshot = { id: rowId, config: configPayload };
  } else if (tableName === "pricing_services" || tableName === "pricing_extras") {
    if (action === "update") {
      const restored = row.before_row;
      if (!restored || typeof restored !== "object") {
        return {
          ok: false,
          error: "Audit row has no before_row to restore.",
          code: "missing_before",
          status: 400,
        };
      }
      const { data: current } = await admin
        .from(tableName)
        .select("*")
        .eq("id", rowId)
        .maybeSingle();
      beforeSnapshot = (current as Record<string, unknown> | null) ?? null;

      const { id: _id, created_at: _c, ...rest } = restored as Record<string, unknown> & {
        id?: unknown;
        created_at?: unknown;
      };
      void _id;
      void _c;
      const { error: upErr } = await admin.from(tableName).update(rest).eq("id", rowId);
      if (upErr) {
        return { ok: false, error: upErr.message, code: "restore_failed", status: 500 };
      }
      afterSnapshot = { ...restored, id: rowId };
    } else if (action === "delete") {
      const restored = row.before_row;
      if (!restored || typeof restored !== "object") {
        return {
          ok: false,
          error: "Audit row has no before_row to re-insert.",
          code: "missing_before",
          status: 400,
        };
      }
      beforeSnapshot = null;
      const { error: insErr } = await admin.from(tableName).insert(restored);
      if (insErr) {
        return { ok: false, error: insErr.message, code: "restore_failed", status: 500 };
      }
      afterSnapshot = restored;
    } else if (action === "insert") {
      const { data: current } = await admin
        .from(tableName)
        .select("*")
        .eq("id", rowId)
        .maybeSingle();
      beforeSnapshot = (current as Record<string, unknown> | null) ?? null;
      // Soft-deactivate when possible; else hard delete.
      if (current && "is_active" in (current as object)) {
        const { error: upErr } = await admin
          .from(tableName)
          .update({ is_active: false })
          .eq("id", rowId);
        if (upErr) {
          return { ok: false, error: upErr.message, code: "restore_failed", status: 500 };
        }
        afterSnapshot = { ...(current as object), is_active: false };
      } else {
        const { error: delErr } = await admin.from(tableName).delete().eq("id", rowId);
        if (delErr) {
          return { ok: false, error: delErr.message, code: "restore_failed", status: 500 };
        }
        afterSnapshot = null;
      }
    } else {
      return {
        ok: false,
        error: `Unsupported audit action: ${action}`,
        code: "unsupported",
        status: 400,
      };
    }
  } else {
    return { ok: false, error: "Unknown catalog table.", code: "bad_table", status: 400 };
  }

  await recordPricingCatalogAudit(admin, {
    tableName,
    rowId,
    action: "rollback",
    beforeRow: beforeSnapshot,
    afterRow: afterSnapshot,
    actorUserId: params.actorUserId,
    actorEmail: params.actorEmail,
    rollbackOf: auditId,
  });

  return { ok: true, tableName, rowId };
}
