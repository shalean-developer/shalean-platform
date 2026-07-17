/**
 * MKT-001B — Provider failure taxonomy for social publish.
 *
 * Classifies HTTP / transport failures into retry policy, user-facing copy,
 * and operator recovery guidance. Keeps Facebook, Instagram, and Google responses aligned.
 */

import type { PublishProvider } from "@/lib/promotions/publishIdempotency";

export type PublishFailureClass =
  | "auth"
  | "permission"
  | "not_found"
  | "conflict"
  | "validation"
  | "rate_limit"
  | "provider_unavailable"
  | "timeout"
  | "network"
  | "unknown";

export type ClassifiedPublishFailure = {
  classification: PublishFailureClass;
  /** Safe to auto-retry or for the admin to click Retry without changing payload. */
  retryable: boolean;
  /** Suggested wait before retry (ms); null when not retryable. */
  retryAfterMs: number | null;
  userMessage: string;
  recoveryGuidance: string;
  httpStatus: number;
};

const RETRY_AFTER_RATE_LIMIT_MS = 60_000;
const RETRY_AFTER_TRANSIENT_MS = 15_000;

function baseFromStatus(httpStatus: number): Pick<
  ClassifiedPublishFailure,
  "classification" | "retryable" | "retryAfterMs"
> {
  if (httpStatus === 401) {
    return { classification: "auth", retryable: false, retryAfterMs: null };
  }
  if (httpStatus === 403) {
    return { classification: "permission", retryable: false, retryAfterMs: null };
  }
  if (httpStatus === 404) {
    return { classification: "not_found", retryable: false, retryAfterMs: null };
  }
  if (httpStatus === 409) {
    return { classification: "conflict", retryable: false, retryAfterMs: null };
  }
  if (httpStatus === 422 || httpStatus === 400) {
    return { classification: "validation", retryable: false, retryAfterMs: null };
  }
  if (httpStatus === 429) {
    return {
      classification: "rate_limit",
      retryable: true,
      retryAfterMs: RETRY_AFTER_RATE_LIMIT_MS,
    };
  }
  if (httpStatus === 408 || httpStatus === 504) {
    return {
      classification: "timeout",
      retryable: true,
      retryAfterMs: RETRY_AFTER_TRANSIENT_MS,
    };
  }
  if (httpStatus === 500 || httpStatus === 502 || httpStatus === 503) {
    return {
      classification: "provider_unavailable",
      retryable: true,
      retryAfterMs: RETRY_AFTER_TRANSIENT_MS,
    };
  }
  return { classification: "unknown", retryable: false, retryAfterMs: null };
}

function recoveryFor(
  provider: PublishProvider,
  classification: PublishFailureClass,
): string {
  switch (classification) {
    case "auth":
      if (provider === "google_business") {
        return "Reconnect Google Business Profile from Connected Accounts.";
      }
      if (provider === "instagram") {
        return "Reconnect Instagram from Connected Accounts (Page-linked professional account + valid Page token).";
      }
      return "Replace FACEBOOK_PAGE_ACCESS_TOKEN with a valid Page token (pages_manage_posts).";
    case "permission":
      if (provider === "google_business") {
        return "Confirm the Google account manages the selected location and Business Profile APIs are enabled.";
      }
      if (provider === "instagram") {
        return "Ensure the Page token has instagram_basic, instagram_content_publish, pages_show_list, and pages_read_engagement, and that a Professional Instagram account is linked to the Page.";
      }
      return "Ensure the Page token has pages_manage_posts and pages_read_engagement.";
    case "not_found":
      if (provider === "google_business") {
        return "Re-select the Business location from Connected Accounts.";
      }
      if (provider === "instagram") {
        return "Verify the Instagram professional account is still linked to the selected Facebook Page.";
      }
      return "Verify FACEBOOK_PAGE_ID matches the Page for this token.";
    case "conflict":
      return "Wait for the in-progress publish to finish, or change the content / use a new Idempotency-Key for a deliberate repost.";
    case "validation":
      return "Fix the message, image, or link and try again.";
    case "rate_limit":
      return "Wait about a minute, then retry the same content (idempotency will reclaim a failed attempt).";
    case "timeout":
    case "provider_unavailable":
    case "network":
      return "Retry shortly. If it keeps failing, check provider status and Connected Accounts health.";
    default:
      return "Review the error detail, then retry or reconnect the provider if auth-related.";
  }
}

/**
 * Classify a provider HTTP failure for structured logging and API responses.
 * `rawMessage` should already be the user-facing provider formatter output.
 */
export function classifyPublishFailure(args: {
  provider: PublishProvider;
  httpStatus?: number | null;
  rawMessage: string;
  transportHint?: "timeout" | "connection_reset" | "network" | null;
}): ClassifiedPublishFailure {
  const message = (args.rawMessage ?? "").trim() || "Publish failed.";
  const lower = message.toLowerCase();

  if (args.transportHint === "timeout" || lower.includes("timeout") || lower.includes("timed out")) {
    return {
      classification: "timeout",
      retryable: true,
      retryAfterMs: RETRY_AFTER_TRANSIENT_MS,
      userMessage: message,
      recoveryGuidance: recoveryFor(args.provider, "timeout"),
      httpStatus: args.httpStatus && args.httpStatus >= 400 ? args.httpStatus : 504,
    };
  }

  if (
    args.transportHint === "connection_reset" ||
    args.transportHint === "network" ||
    lower.includes("econnreset") ||
    lower.includes("network") ||
    lower.includes("fetch failed")
  ) {
    return {
      classification: "network",
      retryable: true,
      retryAfterMs: RETRY_AFTER_TRANSIENT_MS,
      userMessage: message,
      recoveryGuidance: recoveryFor(args.provider, "network"),
      httpStatus: args.httpStatus && args.httpStatus >= 400 ? args.httpStatus : 503,
    };
  }

  const status =
    args.httpStatus && args.httpStatus >= 400 && args.httpStatus < 600 ? args.httpStatus : 400;
  const base = baseFromStatus(status);

  return {
    ...base,
    userMessage: message,
    recoveryGuidance: recoveryFor(args.provider, base.classification),
    httpStatus: status,
  };
}

/** JSON body fragment for failed publish API responses. */
export function publishFailureResponseBody(failure: ClassifiedPublishFailure): {
  error: string;
  classification: PublishFailureClass;
  retryable: boolean;
  retryAfterMs: number | null;
  recoveryGuidance: string;
} {
  return {
    error: failure.userMessage,
    classification: failure.classification,
    retryable: failure.retryable,
    retryAfterMs: failure.retryAfterMs,
    recoveryGuidance: failure.recoveryGuidance,
  };
}
