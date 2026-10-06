import "server-only";

import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveReferralClientIp } from "@/lib/referrals/clientIp";

const WINDOW_SECONDS = 60;
const GLOBAL_LIMIT = 600;
const CLIENT_LIMIT = 60;

export type PromotionTelemetryRateLimitDecision =
  | { allowed: true }
  | {
      allowed: false;
      retryAfterSeconds: number;
      reason: "global" | "client" | "busy" | "unavailable";
    };

type CombinedRateLimitRow = {
  allowed: boolean;
  reason: "global" | "client" | "busy" | null;
  retry_after_seconds: number;
  client_request_count: number | null;
  global_request_count: number | null;
};

function clientRateKey(request: Request): string {
  const ip = resolveReferralClientIp(request);
  const hash = createHash("sha256").update(ip).digest("hex");
  return `client:${hash}`;
}

const BUSY_RETRY_DELAYS_MS = [5, 15, 30] as const;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function checkPromotionTelemetryRateLimit(
  admin: SupabaseClient,
  request: Request,
): Promise<PromotionTelemetryRateLimitDecision> {
  const args = {
    p_client_rate_key: clientRateKey(request),
    p_client_limit: CLIENT_LIMIT,
    p_global_limit: GLOBAL_LIMIT,
    p_window_seconds: WINDOW_SECONDS,
  };

  for (let attempt = 0; attempt <= BUSY_RETRY_DELAYS_MS.length; attempt += 1) {
    const { data, error } = await admin.rpc("consume_promotion_telemetry_limits", args);

    if (error) {
      return { allowed: false, retryAfterSeconds: 60, reason: "unavailable" };
    }

    const row = Array.isArray(data) ? data[0] : data;
    if (!row || typeof row !== "object") {
      return { allowed: false, retryAfterSeconds: 60, reason: "unavailable" };
    }

    const typed = row as Partial<CombinedRateLimitRow>;
    if (
      typeof typed.allowed !== "boolean" ||
      typeof typed.retry_after_seconds !== "number" ||
      (typed.reason !== null &&
        typed.reason !== "global" &&
        typed.reason !== "client" &&
        typed.reason !== "busy")
    ) {
      return { allowed: false, retryAfterSeconds: 60, reason: "unavailable" };
    }

    if (typed.allowed) return { allowed: true };

    if (typed.reason === "busy") {
      const delay = BUSY_RETRY_DELAYS_MS[attempt];
      if (delay !== undefined) {
        await wait(delay);
        continue;
      }
      return { allowed: false, retryAfterSeconds: 1, reason: "busy" };
    }

    if (typed.reason !== "global" && typed.reason !== "client") {
      return { allowed: false, retryAfterSeconds: 60, reason: "unavailable" };
    }

    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, typed.retry_after_seconds),
      reason: typed.reason,
    };
  }

  return { allowed: false, retryAfterSeconds: 1, reason: "busy" };
}

export function promotionTelemetryRateLimitResponse(
  decision: Extract<PromotionTelemetryRateLimitDecision, { allowed: false }>,
): Response {
  return new Response(
    JSON.stringify({
      error:
        decision.reason === "unavailable"
          ? "Telemetry is temporarily unavailable."
          : decision.reason === "busy"
            ? "Telemetry is busy. Please try again shortly."
            : "Too many requests. Please try again shortly.",
      retryAfterSeconds: decision.retryAfterSeconds,
    }),
    {
      status: decision.reason === "unavailable" ? 503 : 429,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": String(decision.retryAfterSeconds),
      },
    },
  );
}

export const PROMOTION_TELEMETRY_RATE_LIMITS = Object.freeze({
  windowSeconds: WINDOW_SECONDS,
  globalPerWindow: GLOBAL_LIMIT,
  clientPerWindow: CLIENT_LIMIT,
});
