export type WhatsAppQueuePayload =
  | { kind: "text"; text: string }
  | { kind: "template"; templateName: string; language?: string; bodyParams: string[] };

export type WhatsAppQueueRow = {
  id: string;
  phone: string;
  type: string;
  payload: unknown;
  context: unknown;
  status: string;
  attempts: number;
  last_error: string | null;
  meta_message_id: string | null;
  idempotency_key?: string | null;
  priority?: number;
  next_attempt_at?: string | null;
};

export const MAX_WHATSAPP_QUEUE_DELIVERY_ATTEMPTS = 5;

export type WhatsAppQueueStatusCounts = {
  pending: number;
  processing: number;
  sent: number;
  failed: number;
  dead: number;
  pending_retry: number;
};

export type ProcessBatchResult = {
  processed: number;
  ok: number;
  failed: number;
  queue_metrics?: WhatsAppQueueStatusCounts;
  worker_meta: {
    batch_limit_requested: number;
    batch_limit_effective: number;
    queue_depth_proxy: number;
    duration_ms: number;
    meta_circuit_open_remaining_ms: number;
    circuit_retry_scheduled: number;
  };
};
