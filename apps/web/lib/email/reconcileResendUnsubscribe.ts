import { isNonProductionDeployment } from "@/lib/env/deploymentEnvironment";

/**
 * Marketing-only provider reconciliation primitive. No send, no auto-enrolment,
 * and never performs a subscribe/re-subscribe operation.
 * Caller must first durably record consent withdrawal in the CRM.
 */
export async function reconcileResendUnsubscribe(
  email: string,
  options: { apiKey: string; fetchFn?: typeof fetch },
): Promise<"updated" | "not_found" | "retry_required"> {
  // Defense in depth: this primitive must not PATCH real contacts from staging.
  if (isNonProductionDeployment() || process.env.RESEND_CONTACT_WRITES_DISABLED !== "false")
    return "retry_required";
  const normalized = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) || !options.apiKey)
    return "retry_required";
  const send = options.fetchFn ?? fetch;
  try {
    const response = await send(`https://api.resend.com/contacts/${encodeURIComponent(normalized)}`, {
      method: "PATCH",
      signal: AbortSignal.timeout(10000),
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ unsubscribed: true }),
    });
    if (response.ok) return "updated";
    if (response.status === 404) return "not_found";
    // Do not erase CRM suppression on provider errors; queue for reconciliation.
    return "retry_required";
  } catch {
    return "retry_required";
  }
}
