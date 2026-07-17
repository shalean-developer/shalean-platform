/**
 * MKT-001D — Format structured publish API failures for admin toasts.
 * Safe for client import (no server-only deps).
 */

export type PublishFailureFields = {
  error?: string;
  recoveryGuidance?: string;
  retryable?: boolean;
  retryAfterMs?: number | null;
  correlationId?: string;
  classification?: string;
};

export function formatPublishFailureToast(fields: PublishFailureFields): string {
  const parts: string[] = [];
  const error = fields.error?.trim();
  if (error) parts.push(error);

  const guidance = fields.recoveryGuidance?.trim();
  if (guidance && guidance !== error) parts.push(guidance);

  if (fields.retryable && fields.retryAfterMs && fields.retryAfterMs > 0) {
    const seconds = Math.max(1, Math.ceil(fields.retryAfterMs / 1000));
    parts.push(`Wait ~${seconds}s before retry.`);
  }

  if (fields.correlationId?.trim()) {
    parts.push(`Ref: ${fields.correlationId.trim()}`);
  }

  return parts.join(" — ") || "Publish failed.";
}
