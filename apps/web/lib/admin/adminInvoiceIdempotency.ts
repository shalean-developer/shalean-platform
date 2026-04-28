import "server-only";

import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

const TTL_MS = 12 * 60 * 1000;

export type AdminInvoiceIdempotentAction =
  | "adjustment"
  | "mark_paid"
  | "hard_close"
  | "resend_invoice";

/**
 * Reads `Idempotency-Key` (optional). When absent, idempotency is skipped (backward compatible).
 */
export function readIdempotencyKey(request: Request): string | null {
  const raw = request.headers.get("Idempotency-Key")?.trim();
  if (!raw || raw.length > 256) return null;
  return raw;
}

function routeKeyFromRequest(request: Request): string {
  try {
    const u = new URL(request.url);
    return `${u.pathname}`;
  } catch {
    return "unknown";
  }
}

export async function replayIdempotentAdminInvoicePost(
  admin: SupabaseClient,
  request: Request,
  invoiceId: string,
  action: AdminInvoiceIdempotentAction,
): Promise<NextResponse | null> {
  const idempotencyKey = readIdempotencyKey(request);
  if (!idempotencyKey) return null;

  const nowIso = new Date().toISOString();
  const route = routeKeyFromRequest(request);

  const { data, error } = await admin
    .from("admin_api_idempotency")
    .select("status_code, response_body")
    .eq("idempotency_key", idempotencyKey)
    .eq("route", route)
    .eq("invoice_id", invoiceId)
    .eq("action", action)
    .gt("expires_at", nowIso)
    .maybeSingle();

  if (error || !data) return null;

  const status = Math.round(Number((data as { status_code?: number }).status_code ?? 200));
  const body = (data as { response_body?: unknown }).response_body;
  return NextResponse.json(body != null && typeof body === "object" ? body : {}, {
    status: Number.isFinite(status) && status >= 200 && status < 600 ? status : 200,
    headers: { "X-Idempotent-Replayed": "1" },
  });
}

export async function rememberIdempotentAdminInvoicePost(
  admin: SupabaseClient,
  request: Request,
  invoiceId: string,
  action: AdminInvoiceIdempotentAction,
  statusCode: number,
  responseBody: Record<string, unknown>,
): Promise<void> {
  const idempotencyKey = readIdempotencyKey(request);
  if (!idempotencyKey) return;

  const route = routeKeyFromRequest(request);
  const expiresAt = new Date(Date.now() + TTL_MS).toISOString();

  const { error } = await admin.from("admin_api_idempotency").insert({
    idempotency_key: idempotencyKey,
    route,
    invoice_id: invoiceId,
    action,
    status_code: statusCode,
    response_body: responseBody,
    expires_at: expiresAt,
  });

  if ((error as { code?: string } | null)?.code === "23505") {
    return;
  }
}
