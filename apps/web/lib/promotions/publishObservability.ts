import "server-only";

import { createHash, randomUUID } from "crypto";
import { logSystemEvent } from "@/lib/logging/systemLog";
import type { PublishProvider } from "@/lib/promotions/publishIdempotency";
import type { PublishFailureClass } from "@/lib/promotions/publishProviderErrors";

/**
 * MKT-001B — Structured publish observability.
 * Correlation IDs tie claim → provider call → ledger update without logging secrets.
 */

export type PublishLogPhase =
  | "claim"
  | "provider_call"
  | "provider_result"
  | "ledger_success"
  | "ledger_failed"
  | "idempotent_replay"
  | "rejected";

export function createPublishCorrelationId(): string {
  return randomUUID();
}

/** Short non-reversible fingerprint for logs (never log raw tokens / full messages). */
export function fingerprintPublishPayload(parts: {
  message: string;
  link?: string | null;
  promotionId?: string | null;
}): string {
  const canonical = JSON.stringify({
    message: parts.message.trim().slice(0, 500),
    link: (parts.link ?? "").trim(),
    promotionId: parts.promotionId ?? "",
  });
  return createHash("sha256").update(canonical, "utf8").digest("hex").slice(0, 16);
}

export async function logPublishEvent(args: {
  level?: "info" | "warn" | "error";
  provider: PublishProvider;
  phase: PublishLogPhase;
  correlationId: string;
  publishId?: string | null;
  idempotencyKeyFingerprint?: string | null;
  outcome?: string;
  classification?: PublishFailureClass;
  retryable?: boolean;
  httpStatus?: number | null;
  providerResponseId?: string | null;
  latencyMs?: number;
  attempts?: number;
  detail?: string;
}): Promise<void> {
  const context: Record<string, unknown> = {
    provider: args.provider,
    phase: args.phase,
    correlationId: args.correlationId,
  };
  if (args.publishId) context.publishId = args.publishId;
  if (args.idempotencyKeyFingerprint) {
    context.idempotencyKeyFingerprint = args.idempotencyKeyFingerprint;
  }
  if (args.outcome) context.outcome = args.outcome;
  if (args.classification) context.classification = args.classification;
  if (args.retryable !== undefined) context.retryable = args.retryable;
  if (args.httpStatus != null) context.httpStatus = args.httpStatus;
  if (args.providerResponseId) context.providerResponseId = args.providerResponseId;
  if (args.latencyMs != null) context.latencyMs = args.latencyMs;
  if (args.attempts != null) context.attempts = args.attempts;
  if (args.detail) context.detail = args.detail.slice(0, 500);

  await logSystemEvent({
    level: args.level ?? "info",
    source: `publish_${args.provider}`,
    message: `publish_${args.phase}`,
    context,
  });
}
