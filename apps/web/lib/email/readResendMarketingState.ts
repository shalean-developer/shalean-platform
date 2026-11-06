export type ProviderMarketingState = {
  verified: boolean;
  unsubscribed: boolean | null;
  suppressed: boolean | null;
};
/** Read-only Resend checks immediately before a promotional send. Any error denies eligibility. */
export async function readResendMarketingState(
  email: string, apiKey: string | undefined, fetchFn: typeof fetch = fetch,
): Promise<ProviderMarketingState> {
  const unknown = { verified: false, unsubscribed: null, suppressed: null };
  if (!apiKey) return unknown;
  const id = encodeURIComponent(email.toLowerCase().trim());
  const opts = { headers: { Authorization: `Bearer ${apiKey}` }, cache: "no-store" as const, signal: AbortSignal.timeout(10000) };
  try {
    const [contact, suppression] = await Promise.all([
      fetchFn(`https://api.resend.com/contacts/${id}`, opts),
      fetchFn(`https://api.resend.com/suppressions/${id}`, opts),
    ]);
    // Contact must exist with an explicit preference. Suppression 404 means absent.
    if (!contact.ok || (suppression.status !== 404 && !suppression.ok)) return unknown;
    const body: unknown = await contact.json();
    if (!body || typeof body !== "object" || !("unsubscribed" in body)
      || typeof body.unsubscribed !== "boolean") return unknown;
    return {
      verified: true,
      unsubscribed: body.unsubscribed,
      suppressed: suppression.ok,
    };
  } catch {
    return unknown;
  }
}
