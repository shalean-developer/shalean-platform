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
      reason: "global" | "client" | "unavailable";
    };

type RateLimitRow = {
  allowed: boolean;
  retry_after_seconds: number;
  request_count: number;
};

function clientRateKey(request: Request): string {
  const ip = resolveReferralClientIp(request);
  const hash = createHash("sha256").update(ip).digest("hex");
  return `client:${hash}`;
}

async function consume(
  admin: SupabaseClient,
  key: string,
  limit: number,
): Promise<RateLimitRow | null> {
  const { data, error } = await admin.rpc("consume_promotion_telemetry_rate_limit", {
    p_rate_key: key,
    p_limit: limit,
    p_window_seconds: WINDOW_SECONDS,
  });
  if (error) return null;

  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== "object") return null;

  const typed = row as Partial<RateLimitRow>;
  if (
    typeof typed.allowed !== "boolean" ||
    typeof typed.retry_after_seconds !== "number" ||
    typeof typed.request_count !== "number"
  ) {
    return null;
  }

  return {
    allowed: typed.allowed,
    retry_after_seconds: typed.retry_after_seconds,
    request_count: typed.request_count,
  };
}

export async function checkPromotionTelemetryRateLimit(
  admin: SupabaseClient,
  request: Request,
): Promise<PromotionTelemetryRateLimitDecision> {
  const global = await consume(admin, "global", GLOBAL_LIMIT);
  if (!global) {
    return { allowed: false, retryAfterSeconds: 60, reason: "unavailable" };
  }
  if (!global.allowed) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, global.retry_after_seconds),
      reason: "global",
    };
  }

  const client = await consume(admin, clientRateKey(request), CLIENT_LIMIT);
  if (!client) {
    return { allowed: false, retryAfterSeconds: 60, reason: "unavailable" };
  }
  if (!client.allowed) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, client.retry_after_seconds),
      reason: "client",
    };
  }

  return { allowed: true };
}

export function promotionTelemetryRateLimitResponse(
  decision: Extract<PromotionTelemetryRateLimitDecision, { allowed: false }>,
): Response {
  return new Response(
    JSON.stringify({
      error:
        decision.reason === "unavailable"
          ? "Telemetry is temporarily unavailable."
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
