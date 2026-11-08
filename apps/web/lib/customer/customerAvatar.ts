export const CUSTOMER_AVATAR_BUCKET = "customer-avatars";
export const CUSTOMER_AVATAR_MAX_BYTES = 2 * 1024 * 1024;

/** Metadata is display data only; storage access must still be scoped to the verified user. */
export function ownedCustomerAvatarPath(userId: string, value: unknown): string | null {
  return typeof value === "string" && value.startsWith(`${userId}/`)
    && /^[a-f0-9-]+\/[a-f0-9-]{36}\.webp$/.test(value) ? value : null;
}

export function providerAvatarUrl(metadata: Record<string, unknown> | undefined): string | undefined {
  if (metadata?.customer_avatar_removed === true) return undefined;
  for (const value of [metadata?.avatar_url, metadata?.picture]) {
    if (typeof value !== "string") continue;
    try {
      const url = new URL(value);
      if (url.protocol === "https:" && !url.username && !url.password) return url.href;
    } catch { /* Invalid metadata must fall back to initials. */ }
  }
  return undefined;
}
