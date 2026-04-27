export type WhatsappDeliveryFailureCategory =
  | "invalid_number"
  | "blocked"
  | "template_rejected"
  | "rate_limited"
  | "unknown";

/** Meta Cloud API / Graph error objects vary; keep classification heuristic and idempotent. */
export function classifyMetaWhatsappDeliveryFailure(errors: unknown): WhatsappDeliveryFailureCategory {
  const raw = safeStringify(errors).toLowerCase();

  if (!raw.trim()) return "unknown";

  if (
    raw.includes("invalid") && (raw.includes("phone") || raw.includes("recipient") || raw.includes("number"))
  ) {
    return "invalid_number";
  }
  if (raw.includes("blocked") || raw.includes("131031") || raw.includes("user has blocked")) {
    return "blocked";
  }
  if (raw.includes("template") && (raw.includes("reject") || raw.includes("disabled") || raw.includes("paused"))) {
    return "template_rejected";
  }
  if (
    raw.includes("rate") ||
    raw.includes("80007") ||
    raw.includes("130429") ||
    raw.includes("too many") ||
    raw.includes("throttl")
  ) {
    return "rate_limited";
  }
  if (raw.includes("131026") || raw.includes("undeliverable")) return "invalid_number";

  return "unknown";
}

function safeStringify(errors: unknown): string {
  try {
    return JSON.stringify(errors ?? {}).slice(0, 4000);
  } catch {
    return "";
  }
}
