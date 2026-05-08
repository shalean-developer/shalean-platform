import { z } from "zod";
import { USER_EVENT_TYPES_ALLOWED_SET } from "@/lib/analytics/userEventRegistry";

const MAX_PAYLOAD_KEYS = 80;
const MAX_PAYLOAD_DEPTH = 6;

function payloadTooDeep(value: unknown, depth: number): boolean {
  if (depth > MAX_PAYLOAD_DEPTH) return true;
  if (value === null || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some((v) => payloadTooDeep(v, depth + 1));
  return Object.values(value as Record<string, unknown>).some((v) => payloadTooDeep(v, depth + 1));
}

/** Validates `/api/analytics/event` bodies — keeps ingestion stable as volumes grow. */
export const analyticsEventIngestSchema = z
  .object({
    event_type: z.string().trim().min(1).max(128),
    payload: z.record(z.string(), z.unknown()).optional(),
  })
  .superRefine((val, ctx) => {
    if (!USER_EVENT_TYPES_ALLOWED_SET.has(val.event_type)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid event_type", path: ["event_type"] });
    }
    const payload = val.payload ?? {};
    const keys = Object.keys(payload);
    if (keys.length > MAX_PAYLOAD_KEYS) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Payload exceeds ${MAX_PAYLOAD_KEYS} keys`,
        path: ["payload"],
      });
    }
    if (payloadTooDeep(payload, 0)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Payload nesting too deep", path: ["payload"] });
    }
  });
