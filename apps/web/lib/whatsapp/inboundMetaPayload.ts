export type InboundTextMessage = {
  from: string;
  body: string;
  /** Meta inbound message id (`messages[].id`, wamid) for this bubble. */
  messageId?: string;
  /** Meta `wamid` of the message being replied to (reply threading), when present. */
  contextMessageId?: string;
};

/**
 * Collects inbound WhatsApp text messages from a Meta Cloud webhook JSON body.
 * Path: `entry[].changes[].value.messages[]` (type `text`).
 */
export function extractInboundWhatsAppTextMessages(payload: unknown): InboundTextMessage[] {
  const out: InboundTextMessage[] = [];
  const p = payload as { entry?: unknown[] };
  for (const entry of p?.entry ?? []) {
    const changes =
      entry && typeof entry === "object" ? (entry as { changes?: unknown[] }).changes : undefined;
    for (const change of changes ?? []) {
      const value =
        change && typeof change === "object"
          ? (change as { value?: Record<string, unknown> }).value
          : undefined;
      const messages = Array.isArray(value?.messages) ? value!.messages : [];
      for (const msg of messages) {
        if (!msg || typeof msg !== "object") continue;
        const m = msg as Record<string, unknown>;
        if (String(m.type ?? "") !== "text") continue;
        const from = String(m.from ?? "");
        const body = String((m.text as { body?: string } | undefined)?.body ?? "");
        const mid = m.id;
        const messageId = typeof mid === "string" && mid.trim() ? mid.trim() : undefined;
        const ctx = m.context;
        let contextMessageId: string | undefined;
        if (ctx && typeof ctx === "object") {
          const cid = (ctx as { id?: unknown }).id;
          if (typeof cid === "string" && cid.trim()) contextMessageId = cid.trim();
        }
        if (from || body) out.push({ from, body, messageId, contextMessageId });
      }
    }
  }
  return out;
}

/** Uses the last inbound text bubble when multiple exist; otherwise legacy top-level / first-change shape. */
export function extractPrimaryInboundWhatsAppMessage(payload: unknown): InboundTextMessage {
  const list = extractInboundWhatsAppTextMessages(payload);
  if (list.length > 0) return list[list.length - 1]!;
  return extractFromAndBodyLegacy(payload);
}

function extractFromAndBodyLegacy(payload: unknown): InboundTextMessage {
  const p = (payload ?? {}) as Record<string, unknown>;
  const fromTop = String(p.from ?? "");
  const bodyTop = String(p.body ?? p.message ?? "");
  if (fromTop || bodyTop) return { from: fromTop, body: bodyTop, messageId: undefined };

  const entry = Array.isArray((p as { entry?: unknown[] }).entry) ? (p as { entry: unknown[] }).entry[0] : undefined;
  const changes = entry && typeof entry === "object" ? (entry as { changes?: unknown[] }).changes : undefined;
  const change0 = Array.isArray(changes) ? changes[0] : undefined;
  const value =
    change0 && typeof change0 === "object" ? (change0 as { value?: Record<string, unknown> }).value : undefined;
  const msg0 = Array.isArray(value?.messages) ? (value?.messages?.[0] as Record<string, unknown> | undefined) : undefined;
  const from = String(msg0?.from ?? "");
  const body = String(((msg0?.text as { body?: string } | undefined)?.body ?? ""));
  const mid0 = msg0?.id;
  const messageId = typeof mid0 === "string" && mid0.trim() ? mid0.trim() : undefined;
  const ctx = msg0?.context;
  let contextMessageId: string | undefined;
  if (ctx && typeof ctx === "object") {
    const cid = (ctx as { id?: unknown }).id;
    if (typeof cid === "string" && cid.trim()) contextMessageId = cid.trim();
  }
  return { from, body, messageId, contextMessageId };
}
