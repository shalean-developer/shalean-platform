import {
  buildMetaDataDeletionAck,
  hashMetaUserIdForAudit,
  issueDataDeletionConfirmationCode,
  parseMetaSignedRequest,
} from "@/lib/meta/dataDeletion";
import {
  allowMetaDataDeletionRequest,
  metaDataDeletionRateLimitKey,
} from "@/lib/rateLimit/metaDataDeletionIpLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Meta Data Deletion Request Callback.
 *
 * Acknowledges the request and returns a confirmation URL/code. Does **not**
 * automatically delete booking, customer, business, or social connection records —
 * only logs a hashed Meta user id for authorized operator follow-up.
 *
 * Operator owner: privacy/support mailbox (CUSTOMER_SUPPORT_EMAIL / hello@shalean.co.za).
 * Completion requires verified operational evidence (connection row removed / tokens wiped).
 *
 * @see https://developers.facebook.com/docs/development/create-an-app/app-dashboard/data-deletion-callback/
 */
export async function POST(request: Request): Promise<Response> {
  if (!allowMetaDataDeletionRequest(metaDataDeletionRateLimitKey(request))) {
    return Response.json({ error: "rate_limited" }, { status: 429 });
  }

  let signedRequest = "";
  const contentType = request.headers.get("content-type") ?? "";
  try {
    if (contentType.includes("application/json")) {
      const body = (await request.json()) as { signed_request?: unknown };
      signedRequest = typeof body.signed_request === "string" ? body.signed_request : "";
    } else {
      const form = await request.formData();
      const raw = form.get("signed_request");
      signedRequest = typeof raw === "string" ? raw : "";
    }
  } catch {
    return Response.json({ error: "invalid_body" }, { status: 400 });
  }

  const payload = parseMetaSignedRequest(signedRequest);
  if (!payload?.user_id) {
    return Response.json({ error: "invalid_signed_request" }, { status: 400 });
  }

  const confirmationCode = issueDataDeletionConfirmationCode();
  if (!confirmationCode) {
    return Response.json({ error: "callback_not_configured" }, { status: 503 });
  }

  // Structured audit only — no tokens, no raw Meta user ids, no automatic deletes.
  // confirmationCode is logged so operators can correlate Meta's UI with status lookups.
  console.info("[meta-data-deletion] request_ack", {
    userHash: hashMetaUserIdForAudit(payload.user_id),
    confirmationCode,
    issuedAt: payload.issued_at ?? null,
    status: "acknowledged_pending_operator",
    owner: "privacy-support",
  });

  return Response.json(buildMetaDataDeletionAck(confirmationCode), { status: 200 });
}

export function GET(): Response {
  return Response.json(
    {
      service: "meta-data-deletion",
      method: "POST",
      instructions: "https://shalean.co.za/data-deletion",
    },
    { status: 405, headers: { Allow: "POST" } },
  );
}
