import { createHash } from "node:crypto";

export const ZOHO_REFERENCE_MAX_LENGTH = 49;

export function formatZohoReference(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length <= ZOHO_REFERENCE_MAX_LENGTH) return trimmed;

  const digest = createHash("sha256").update(trimmed).digest("hex").slice(0, 8);
  const prefixLength = ZOHO_REFERENCE_MAX_LENGTH - 1 - digest.length;
  return `${trimmed.slice(0, prefixLength)}-${digest}`;
}
