/**
 * Enforce Meta-style delivery progression on `whatsapp_queue.delivery_status`
 * after the row is `sent`. Blocks downgrades and impossible edges (e.g. read → failed).
 */
export function canAdvanceWhatsAppDeliveryStatus(
  previous: string | null | undefined,
  incoming: string,
): boolean {
  const next = incoming.trim().toLowerCase();
  if (!next) return false;
  const prev = (previous ?? "").trim().toLowerCase() || null;

  if (next === prev) return true;

  if (prev === "read" || prev === "failed") return false;

  if (next === "failed") {
    return prev === "sent" || prev === "delivered";
  }

  if (next === "sent") return prev === "" || prev === null;

  if (next === "delivered") return prev === "sent";

  if (next === "read") return prev === "sent" || prev === "delivered";

  return false;
}
