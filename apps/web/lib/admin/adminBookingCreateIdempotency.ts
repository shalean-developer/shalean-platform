import "server-only";

import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import { readIdempotencyKey } from "@/lib/admin/adminInvoiceIdempotency";
import { logSystemEvent } from "@/lib/logging/systemLog";

/** Replay + dedupe window: brief tab switches / retries (not multi-day). */
const TTL_MS = 20 * 60 * 1000;
/** Do not reclaim a pending claim until the server has had this long to finish Paystack + inserts. */
const IN_FLIGHT_STALE_MS = 15 * 60 * 1000;

export type AdminBookingCreateFingerprint = {
  customerUserId: string;
  serviceDate: string;
  serviceTime: string;
  serviceSlug: string;
  locationHash: string;
};

function routePathFromRequest(request: Request): string {
  try {
    return new URL(request.url).pathname;
  } catch {
    return "/api/admin/bookings";
  }
}

/**
 * Claim idempotency slot before side effects. Returns replay/in-flight or proceed with claim row id.
 */
export async function claimAdminBookingCreateIdempotency(
  admin: SupabaseClient,
  request: Request,
  fp: AdminBookingCreateFingerprint,
  depth = 0,
): Promise<
  | { kind: "proceed"; claimId: string }
  | { kind: "replay"; response: NextResponse }
  | { kind: "in_flight"; response: NextResponse }
  | { kind: "skip" }
  | { kind: "error"; response: NextResponse }
> {
  if (depth > 10) {
    return {
      kind: "error",
      response: NextResponse.json({ error: "Idempotency claim failed after retries." }, { status: 503 }),
    };
  }

  const idempotencyKey = readIdempotencyKey(request);
  if (!idempotencyKey) return { kind: "skip" };

  const route = routePathFromRequest(request);
  const expiresAt = new Date(Date.now() + TTL_MS).toISOString();

  const { data: inserted, error: insErr } = await admin
    .from("admin_booking_create_idempotency")
    .insert({
      idempotency_key: idempotencyKey,
      route,
      customer_user_id: fp.customerUserId,
      service_date: fp.serviceDate,
      service_time: fp.serviceTime,
      service_slug: fp.serviceSlug,
      location_hash: fp.locationHash,
      pending: true,
      status_code: null,
      response_body: { pending: true },
      expires_at: expiresAt,
    })
    .select("id")
    .maybeSingle();

  if (!insErr && inserted && typeof inserted === "object" && "id" in inserted) {
    return { kind: "proceed", claimId: String((inserted as { id: string }).id) };
  }

  if (!insErr) {
    return {
      kind: "error",
      response: NextResponse.json({ error: "Could not reserve idempotency key." }, { status: 503 }),
    };
  }

  if ((insErr as { code?: string }).code !== "23505") {
    return {
      kind: "error",
      response: NextResponse.json(
        { error: "Could not reserve idempotency key. Try again in a moment." },
        { status: 503 },
      ),
    };
  }

  const { data: existing } = await admin
    .from("admin_booking_create_idempotency")
    .select("id, pending, status_code, response_body, created_at")
    .match({
      idempotency_key: idempotencyKey,
      route,
      customer_user_id: fp.customerUserId,
      service_date: fp.serviceDate,
      service_time: fp.serviceTime,
      service_slug: fp.serviceSlug,
      location_hash: fp.locationHash,
    })
    .maybeSingle();

  const ex = existing as
    | { id?: string; pending?: boolean; status_code?: number | null; response_body?: unknown; created_at?: string }
    | null;
  if (!ex) {
    return {
      kind: "error",
      response: NextResponse.json({ error: "Idempotency state was lost. Retry the request." }, { status: 503 }),
    };
  }

  if (ex.pending) {
    const createdMs = ex.created_at ? Date.parse(ex.created_at) : NaN;
    if (Number.isFinite(createdMs) && Date.now() - createdMs < IN_FLIGHT_STALE_MS) {
      return {
        kind: "in_flight",
        response: NextResponse.json(
          { error: "An identical admin booking request is still processing. Retry in a few seconds." },
          { status: 409 },
        ),
      };
    }
    await admin.from("admin_booking_create_idempotency").delete().eq("id", String(ex.id));
    return claimAdminBookingCreateIdempotency(admin, request, fp, depth + 1);
  }

  const status = Math.round(Number(ex.status_code ?? 200));
  const body = ex.response_body;
  const safe = body != null && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
  void logSystemEvent({
    level: "info",
    source: "admin_booking_create_idempotency",
    message: "admin_booking_idempotent_replay",
    context: {
      fingerprint: fp,
      booking_id: typeof safe.bookingId === "string" ? safe.bookingId : null,
      idempotency_key_prefix: idempotencyKey.slice(0, 12),
    },
  });
  return {
    kind: "replay",
    response: NextResponse.json(safe, {
      status: Number.isFinite(status) && status >= 200 && status < 600 ? status : 200,
      headers: { "X-Idempotent-Replayed": "1" },
    }),
  };
}

export async function finalizeAdminBookingCreateIdempotency(
  admin: SupabaseClient,
  claimId: string,
  statusCode: number,
  responseBody: Record<string, unknown>,
): Promise<void> {
  await admin
    .from("admin_booking_create_idempotency")
    .update({
      pending: false,
      status_code: statusCode,
      response_body: responseBody,
    })
    .eq("id", claimId);
}

export async function abandonAdminBookingCreateIdempotency(admin: SupabaseClient, claimId: string): Promise<void> {
  await admin.from("admin_booking_create_idempotency").delete().eq("id", claimId);
}
