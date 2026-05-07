/** Display string for admin table: name (code) with fallbacks. */
export function buildReferrerDisplayLabel(params: {
  displayName: string | null;
  referralCode: string | null;
  emailOrPhone: string | null;
  fallbackId: string;
}): string {
  const name = params.displayName?.trim() || null;
  const code = params.referralCode?.trim() || null;
  const secondary = params.emailOrPhone?.trim() || null;
  if (name && code) return `${name} (${code})`;
  if (name && secondary) return `${name} · ${secondary}`;
  if (name) return name;
  if (code && secondary) return `${code} · ${secondary}`;
  if (code) return code;
  if (secondary) return secondary;
  return `${params.fallbackId.slice(0, 8)}…`;
}

export function rollupKey(referrerType: string, referrerId: string): string {
  return `${referrerType}:${referrerId}`;
}
