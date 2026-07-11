import { isApiClientError } from "@shalean/api-client";

/** Map API / network failures to cleaner-friendly copy. */
export function friendlyErrorMessage(error: unknown, fallback = "Something went wrong. Please try again."): string {
  if (typeof error === "string" && error.trim()) return error.trim();

  if (isApiClientError(error)) {
    switch (error.code) {
      case "not_authenticated":
        return "Your session expired. Please sign in again.";
      case "timeout":
        return "The request timed out. Check your connection and try again.";
      case "network":
        return "You appear to be offline. We’ll retry when you’re back online.";
      case "aborted":
        return "Request cancelled.";
      default:
        return error.message || fallback;
    }
  }

  if (error instanceof Error && error.message.trim()) {
    const msg = error.message.trim();
    if (/network|offline|failed to fetch/i.test(msg)) {
      return "You appear to be offline. Check your connection and try again.";
    }
    if (/timeout/i.test(msg)) {
      return "The request timed out. Please try again.";
    }
    if (/401|not signed in|session/i.test(msg)) {
      return "Your session expired. Please sign in again.";
    }
    return msg;
  }

  return fallback;
}
