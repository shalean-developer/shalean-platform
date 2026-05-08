import { z } from "zod";
import { ANALYTICS_EVENTS } from "@/lib/analytics/userEventRegistry";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function nonEmptyRef(reference: unknown): boolean {
  return typeof reference === "string" && reference.trim().length > 0;
}

function validBookingId(bookingId: unknown): boolean {
  return typeof bookingId === "string" && UUID_RE.test(bookingId.trim());
}

/** Strong contract for conversion signals — allows legacy beacons but rejects empty payloads. */
const bookingCompletedPayloadSchema = z
  .object({
    booking_id: z.unknown().optional(),
    reference: z.unknown().optional(),
  })
  .passthrough()
  .superRefine((p, ctx) => {
    if (validBookingId(p.booking_id) || nonEmptyRef(p.reference)) return;
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `${ANALYTICS_EVENTS.BOOKING_COMPLETED} payload requires booking_id (UUID) or reference`,
    });
  });

const paymentCompletedPayloadSchema = z
  .object({
    booking_id: z.unknown().optional(),
    reference: z.unknown().optional(),
  })
  .passthrough()
  .superRefine((p, ctx) => {
    if (validBookingId(p.booking_id) || nonEmptyRef(p.reference)) return;
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `${ANALYTICS_EVENTS.PAYMENT_COMPLETED} payload requires booking_id (UUID) or reference`,
    });
  });

const pageViewPayloadSchema = z
  .object({
    page_type: z.string().trim().min(1).max(160),
  })
  .passthrough();

const SCHEMA_BY_EVENT: Partial<Record<string, z.ZodType<Record<string, unknown>>>> = {
  [ANALYTICS_EVENTS.BOOKING_COMPLETED]: bookingCompletedPayloadSchema,
  [ANALYTICS_EVENTS.PAYMENT_COMPLETED]: paymentCompletedPayloadSchema,
  [ANALYTICS_EVENTS.PAGE_VIEW]: pageViewPayloadSchema,
};

/**
 * Second-pass validation after generic ingest checks. Extend SCHEMA_BY_EVENT as contracts tighten.
 */
export function validateEventSpecificPayload(
  eventType: string,
  payload: Record<string, unknown>,
): { ok: true } | { ok: false; message: string } {
  const schema = SCHEMA_BY_EVENT[eventType];
  if (!schema) return { ok: true };
  const r = schema.safeParse(payload);
  if (r.success) return { ok: true };
  const msg = r.error.issues.map((i) => i.message).join("; ") || "Invalid payload for event_type";
  return { ok: false, message: msg };
}
