import type { WhatsAppQueuePayload } from "@/lib/whatsapp/types";

/**
 * Build a queued template payload (body variables {{1}}..{{N}} in order).
 * Template must exist and be approved in Meta Business Suite.
 */
export function buildQueuedTemplatePayload(params: {
  templateName: string;
  language?: string;
  bodyParams: string[];
}): { type: "template"; payload: WhatsAppQueuePayload } {
  return {
    type: "template" as const,
    payload: {
      kind: "template",
      templateName: params.templateName,
      language: params.language ?? "en",
      bodyParams: params.bodyParams,
    },
  };
}
