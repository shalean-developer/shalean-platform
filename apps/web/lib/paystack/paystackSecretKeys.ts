import "server-only";

export type PaystackSecretKeyCandidate = {
  secret: string;
  label: "primary" | "live" | "test";
  mode: "live" | "test" | "unknown";
};

function inferPaystackKeyMode(secret: string): "live" | "test" | "unknown" {
  if (secret.startsWith("sk_live_")) return "live";
  if (secret.startsWith("sk_test_")) return "test";
  return "unknown";
}

/**
 * Collect unique Paystack secret keys to try (primary + optional mode-specific fallbacks).
 * Set PAYSTACK_SECRET_KEY_LIVE / PAYSTACK_SECRET_KEY_TEST when reconcile must search both environments.
 */
export function getPaystackSecretKeyCandidates(): PaystackSecretKeyCandidate[] {
  const entries: Array<{ env: string; label: PaystackSecretKeyCandidate["label"] }> = [
    { env: "PAYSTACK_SECRET_KEY", label: "primary" },
    { env: "PAYSTACK_SECRET_KEY_LIVE", label: "live" },
    { env: "PAYSTACK_SECRET_KEY_TEST", label: "test" },
  ];

  const seen = new Set<string>();
  const out: PaystackSecretKeyCandidate[] = [];

  for (const { env, label } of entries) {
    const secret = process.env[env]?.trim();
    if (!secret || seen.has(secret)) continue;
    seen.add(secret);
    out.push({ secret, label, mode: inferPaystackKeyMode(secret) });
  }

  return out;
}

export function describePaystackKeyModes(candidates: PaystackSecretKeyCandidate[]): string {
  if (candidates.length === 0) return "none configured";
  return candidates.map((c) => `${c.label}(${c.mode})`).join(", ");
}
