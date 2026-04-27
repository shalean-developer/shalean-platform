import "server-only";

export type ChargeAuthorizationResult =
  | { ok: true; reference: string; status: string }
  | { ok: false; message: string; httpStatus?: number };

/**
 * Paystack `POST /transaction/charge_authorization` — webhook remains source of truth for booking payment.
 */
export async function chargePaystackAuthorization(params: {
  secret: string;
  authorizationCode: string;
  email: string;
  amountCents: number;
  reference: string;
  metadata?: Record<string, unknown>;
}): Promise<ChargeAuthorizationResult> {
  const res = await fetch("https://api.paystack.co/transaction/charge_authorization", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.secret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      authorization_code: params.authorizationCode,
      email: params.email,
      amount: params.amountCents,
      reference: params.reference,
      ...(params.metadata && Object.keys(params.metadata).length ? { metadata: params.metadata } : {}),
    }),
  });

  const json = (await res.json()) as {
    status?: boolean;
    message?: string;
    data?: { status?: string; reference?: string };
  };

  const ok = res.ok && json.status === true && String(json.data?.status ?? "").toLowerCase() === "success";
  if (ok && json.data?.reference) {
    return { ok: true, reference: String(json.data.reference), status: String(json.data.status ?? "success") };
  }
  return {
    ok: false,
    message: json.message || "charge_authorization failed",
    httpStatus: res.status,
  };
}
