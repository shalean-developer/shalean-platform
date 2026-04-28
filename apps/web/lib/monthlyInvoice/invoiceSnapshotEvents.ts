import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { logSystemEvent } from "@/lib/logging/systemLog";

import { parseAdjustmentCategory, type AdjustmentCategory } from "@/lib/monthlyInvoice/adjustmentCategory";

/**
 * Discriminated payloads appended to `monthly_invoice_events` / `snapshot_current.events`.
 * DB stores JSON; use these shapes from TS when calling `monthly_invoice_append_snapshot_event`.
 */
export type InvoiceSnapshotEvent =
  | {
      kind: "invoice_finalized";
      at: string;
      total_amount_cents: number;
      booking_count: number;
    }
  | {
      kind: "payment_received";
      at: string;
      paystack_charge_reference: string;
      amount_cents: number;
      amount_paid_cents_after: number;
      total_amount_cents: number;
      /** Remaining customer balance immediately after this payment (minor units). */
      balance_cents_after: number;
      settled: "full" | "partial";
      actor: "system";
      /** Same as paystack_charge_reference for exports / support. */
      reference: string;
    }
  | {
      kind: "adjustment_applied";
      at: string;
      adjustment_id: string;
      amount_cents: number;
      reason: string;
      category?: AdjustmentCategory;
      amount_paid_cents_after?: number;
      balance_cents_after?: number;
      actor?: string;
      reference?: string;
    }
  | {
      kind: "invoice_closed";
      at: string;
      via: "paid" | "manual";
    }
  | {
      kind: "admin_mark_paid";
      at: string;
      admin_email: string;
      admin_user_id?: string;
      /** Same as amount_recorded_cents; explicit for support / exports. */
      amount_cents: number;
      amount_recorded_cents: number;
      amount_paid_cents_after: number;
      total_amount_cents: number;
      booking_count_settled?: number;
      note?: string;
      settled: "full";
      /** Always 0 for full manual settlement. */
      balance_cents_after: number;
      actor: string;
      reference: "manual";
    }
  | {
      kind: "invoice_resent";
      at: string;
      channel: "email" | "whatsapp";
      actor: string;
      reference: string;
      balance_cents_after: number;
      amount_paid_cents_after: number;
      total_amount_cents: number;
      delivery_status: "sent" | "failed";
      error_message?: string | null;
    }
  | {
      kind: "invoice_reminder_sent";
      at: string;
      day_offset: number;
      channel: "email" | "whatsapp";
      delivery_status: "sent" | "failed";
      error_message?: string | null;
      /** Outstanding balance (minor units) at send time — same as balance_cents_after for reminders. */
      amount_cents: number;
      amount_paid_cents_after: number;
      balance_cents_after: number;
      actor: "system";
      reference: string;
    };

/** Narrow unknown JSON from DB into a typed event when possible. */
export function parseInvoiceSnapshotEvent(raw: unknown): InvoiceSnapshotEvent | null {
  const o = raw != null && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;
  if (!o) return null;
  const kind = String(o.kind ?? "");
  if (kind === "invoice_finalized") {
    return {
      kind: "invoice_finalized",
      at: String(o.at ?? ""),
      total_amount_cents: Math.round(Number(o.total_amount_cents ?? 0)),
      booking_count: Math.round(Number(o.booking_count ?? 0)),
    };
  }
  if (kind === "payment_received" || kind === "payment_applied") {
    const totalAmt = Math.round(Number(o.total_amount_cents ?? 0));
    const paidAfter = Math.round(Number(o.amount_paid_cents_after ?? 0));
    const explicit =
      typeof o.balance_cents_after === "number" && Number.isFinite(o.balance_cents_after)
        ? Math.round(o.balance_cents_after)
        : null;
    const balance_cents_after = explicit != null ? Math.max(0, explicit) : Math.max(0, totalAmt - paidAfter);
    const ref = String(o.paystack_charge_reference ?? o.reference ?? "");
    return {
      kind: "payment_received",
      at: String(o.at ?? ""),
      paystack_charge_reference: ref,
      amount_cents: Math.round(Number(o.amount_cents ?? 0)),
      amount_paid_cents_after: paidAfter,
      total_amount_cents: totalAmt,
      balance_cents_after,
      settled: o.settled === "full" ? "full" : "partial",
      actor: "system",
      reference: ref || "paystack",
    };
  }
  if (kind === "adjustment_applied" || kind === "adjustment_post_send") {
    return {
      kind: "adjustment_applied",
      at: String(o.at ?? ""),
      adjustment_id: String(o.adjustment_id ?? ""),
      amount_cents: Math.round(Number(o.amount_cents ?? 0)),
      reason: String(o.reason ?? ""),
      category: parseAdjustmentCategory(o.category),
      amount_paid_cents_after:
        typeof o.amount_paid_cents_after === "number" && Number.isFinite(o.amount_paid_cents_after)
          ? Math.round(o.amount_paid_cents_after)
          : undefined,
      balance_cents_after:
        typeof o.balance_cents_after === "number" && Number.isFinite(o.balance_cents_after)
          ? Math.max(0, Math.round(o.balance_cents_after))
          : undefined,
      actor: typeof o.actor === "string" ? o.actor : undefined,
      reference: typeof o.reference === "string" ? o.reference : undefined,
    };
  }
  if (kind === "invoice_closed") {
    const via = o.via === "paid" ? "paid" : "manual";
    return { kind: "invoice_closed", at: String(o.at ?? ""), via };
  }
  if (kind === "admin_mark_paid") {
    const explicitBal =
      typeof o.balance_cents_after === "number" && Number.isFinite(o.balance_cents_after)
        ? Math.max(0, Math.round(o.balance_cents_after))
        : 0;
    const recorded = Math.round(Number(o.amount_recorded_cents ?? o.amount_cents ?? 0));
    const paidAfter =
      typeof o.amount_paid_cents_after === "number" && Number.isFinite(o.amount_paid_cents_after)
        ? Math.max(0, Math.round(o.amount_paid_cents_after))
        : Math.round(Number(o.total_amount_cents ?? 0));
    return {
      kind: "admin_mark_paid",
      at: String(o.at ?? ""),
      admin_email: String(o.admin_email ?? ""),
      admin_user_id: typeof o.admin_user_id === "string" ? o.admin_user_id : undefined,
      amount_cents: recorded,
      amount_recorded_cents: recorded,
      amount_paid_cents_after: paidAfter,
      total_amount_cents: Math.round(Number(o.total_amount_cents ?? 0)),
      booking_count_settled:
        typeof o.booking_count_settled === "number" ? Math.round(o.booking_count_settled) : undefined,
      note: typeof o.note === "string" ? o.note : undefined,
      settled: "full",
      balance_cents_after: explicitBal,
      actor: typeof o.actor === "string" && o.actor.trim() ? o.actor.trim() : `admin:${String(o.admin_email ?? "").trim() || "unknown"}`,
      reference: "manual",
    };
  }
  if (kind === "invoice_resent") {
    const ch = String(o.channel ?? "").toLowerCase() === "whatsapp" ? "whatsapp" : "email";
    const ds = String(o.delivery_status ?? "sent").toLowerCase() === "failed" ? "failed" : "sent";
    return {
      kind: "invoice_resent",
      at: String(o.at ?? ""),
      channel: ch,
      actor: String(o.actor ?? "admin"),
      reference: String(o.reference ?? ""),
      balance_cents_after: Math.max(0, Math.round(Number(o.balance_cents_after ?? 0))),
      amount_paid_cents_after: Math.max(0, Math.round(Number(o.amount_paid_cents_after ?? 0))),
      total_amount_cents: Math.max(0, Math.round(Number(o.total_amount_cents ?? 0))),
      delivery_status: ds,
      error_message: typeof o.error_message === "string" ? o.error_message : null,
    };
  }
  if (kind === "invoice_reminder_sent") {
    const ch = String(o.channel ?? "").toLowerCase() === "whatsapp" ? "whatsapp" : "email";
    const ds = String(o.delivery_status ?? "sent").toLowerCase() === "failed" ? "failed" : "sent";
    return {
      kind: "invoice_reminder_sent",
      at: String(o.at ?? ""),
      day_offset: Math.round(Number(o.day_offset ?? 0)),
      channel: ch,
      delivery_status: ds,
      error_message: typeof o.error_message === "string" ? o.error_message : null,
      amount_cents: Math.max(0, Math.round(Number(o.amount_cents ?? 0))),
      amount_paid_cents_after: Math.max(0, Math.round(Number(o.amount_paid_cents_after ?? 0))),
      balance_cents_after: Math.max(0, Math.round(Number(o.balance_cents_after ?? 0))),
      actor: "system",
      reference: String(o.reference ?? `reminder:${ch}`),
    };
  }
  return null;
}

export function invoiceSnapshotEventToRpcPayload(ev: InvoiceSnapshotEvent): Record<string, unknown> {
  switch (ev.kind) {
    case "invoice_finalized":
      return {
        kind: ev.kind,
        at: ev.at,
        total_amount_cents: ev.total_amount_cents,
        booking_count: ev.booking_count,
      };
    case "payment_received":
      return { ...ev, kind: "payment_received" };
    case "adjustment_applied":
      return { ...ev, kind: "adjustment_applied" };
    case "invoice_closed":
      return { ...ev, kind: "invoice_closed" };
    case "admin_mark_paid":
      return { ...ev, kind: "admin_mark_paid" };
    case "invoice_resent":
      return { ...ev, kind: "invoice_resent" };
    case "invoice_reminder_sent":
      return { ...ev, kind: "invoice_reminder_sent" };
    default: {
      const _x: never = ev;
      return _x as Record<string, unknown>;
    }
  }
}

export async function appendMonthlyInvoiceSnapshotEvent(
  admin: SupabaseClient,
  invoiceId: string,
  event: InvoiceSnapshotEvent,
  logContext?: { source?: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await admin.rpc("monthly_invoice_append_snapshot_event", {
    p_invoice_id: invoiceId,
    p_event: invoiceSnapshotEventToRpcPayload(event),
  });
  if (error) {
    await logSystemEvent({
      level: "warn",
      source: logContext?.source ?? "monthly_invoice/snapshot_event",
      message: "snapshot_append_failed",
      context: { invoice_id: invoiceId, kind: event.kind, error: error.message },
    });
    return { ok: false, error: error.message };
  }
  return { ok: true };
}
