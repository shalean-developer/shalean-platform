const BOOKING_REF_RE = /\[booking:([0-9a-f-]{36})\]/i;

export function bookingRefTag(bookingId: string): string {
  return `[booking:${bookingId}]`;
}

export function parseBookingRefFromReason(reason: unknown): string | null {
  const text = String(reason ?? "");
  const match = BOOKING_REF_RE.exec(text);
  return match?.[1] ?? null;
}

export function appendBookingRefToReason(reason: string, bookingId: string): string {
  const tag = bookingRefTag(bookingId);
  const trimmed = reason.trim();
  if (!trimmed) return tag;
  if (trimmed.includes(tag)) return trimmed;
  return `${trimmed} ${tag}`.trim().slice(0, 2000);
}

export function isMissingInvoiceAdjustmentBookingIdColumn(error: { message?: string; code?: string } | null): boolean {
  if (!error) return false;
  const msg = String(error.message ?? "").toLowerCase();
  return (
    error.code === "PGRST204" ||
    msg.includes("booking_id") && (msg.includes("schema cache") || msg.includes("does not exist"))
  );
}
