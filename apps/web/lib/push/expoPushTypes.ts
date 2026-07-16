export type ExpoPushTicketStatus = "ok" | "error";

export type ExpoPushTicket = {
  status: ExpoPushTicketStatus;
  id?: string;
  message?: string;
  details?: { error?: string; fault?: string };
};

export type ExpoPushMessage = {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: "default" | null;
  priority?: "default" | "normal" | "high";
  channelId?: string;
};

export type ExpoPushSendResult =
  | { ok: true; tickets: ExpoPushTicket[] }
  | { ok: false; httpStatus: number; error: string; tickets?: ExpoPushTicket[] };

export type ExpoPushAdapter = {
  send(messages: ExpoPushMessage[]): Promise<ExpoPushSendResult>;
};

export type PushDispatchInput = {
  userId: string;
  token: string;
  title: string;
  body: string;
  /** Non-sensitive deep-link / type data only. */
  data?: Record<string, unknown>;
  eventType: string;
  templateKey: string;
  role: "customer" | "cleaner" | "admin";
  bookingId?: string | null;
  /** Dedup reference (payment ref, booking id + event, etc.). */
  idempotencyKey: string;
  /** Attempts already recorded before this dispatch (0 = first try). */
  priorAttempts?: number;
  app?: "customer" | "cleaner";
};

export type PushDispatchOutcome =
  | { status: "sent"; ticketId?: string; attempt: number }
  | { status: "skipped_duplicate" }
  | {
      status: "retry";
      attempt: number;
      nextAttemptAt: string;
      errorCategory: string;
      error: string;
    }
  | {
      status: "dead_letter";
      attempt: number;
      errorCategory: string;
      error: string;
      tokenRemoved?: boolean;
    };
