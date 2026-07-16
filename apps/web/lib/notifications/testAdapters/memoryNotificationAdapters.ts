/**
 * Deterministic local notification adapters for Princess PR E UAT.
 * Never contacts Resend / Twilio / Meta / Expo.
 */

export type MemoryEmailSend = {
  to: string | string[];
  subject: string;
  html?: string;
  at: string;
};

export type MemoryEmailResult =
  | { ok: true; id: string }
  | { ok: false; statusCode: number; name: string; message: string };

export function createMemoryEmailAdapter(opts?: {
  responses?: MemoryEmailResult[];
}) {
  const sends: MemoryEmailSend[] = [];
  let callIndex = 0;
  const scripted = [...(opts?.responses ?? [])];
  let next: MemoryEmailResult | null = null;

  return {
    sends,
    setNext(r: MemoryEmailResult | null) {
      next = r;
    },
    reset() {
      sends.length = 0;
      callIndex = 0;
      next = null;
      scripted.length = 0;
    },
    async send(payload: {
      to: string | string[];
      subject: string;
      html?: string;
    }): Promise<MemoryEmailResult> {
      sends.push({
        to: payload.to,
        subject: payload.subject,
        html: payload.html,
        at: new Date().toISOString(),
      });
      if (next) {
        const r = next;
        next = null;
        return r;
      }
      if (scripted.length > 0) {
        const idx = Math.min(callIndex, scripted.length - 1);
        callIndex += 1;
        return scripted[idx]!;
      }
      return { ok: true, id: `mem-email-${sends.length}` };
    },
  };
}

export type MemorySmsSend = { to: string; body: string; at: string };
export type MemoryPhoneResult = { ok: true } | { ok: false; error: string; retryable: boolean };

export function createMemorySmsAdapter() {
  const sends: MemorySmsSend[] = [];
  let next: MemoryPhoneResult | null = null;
  return {
    sends,
    setNext(r: MemoryPhoneResult | null) {
      next = r;
    },
    async send(to: string, body: string): Promise<MemoryPhoneResult> {
      sends.push({ to, body, at: new Date().toISOString() });
      if (next) {
        const r = next;
        next = null;
        return r;
      }
      return { ok: true };
    },
  };
}

export type MemoryWhatsAppSend = {
  phone: string;
  text: string;
  idempotencyKey?: string;
  at: string;
};

export function createMemoryWhatsAppAdapter() {
  const sends: MemoryWhatsAppSend[] = [];
  const keys = new Set<string>();
  let next: MemoryPhoneResult | null = null;
  return {
    sends,
    setNext(r: MemoryPhoneResult | null) {
      next = r;
    },
    async enqueue(params: {
      phone: string;
      text: string;
      idempotencyKey?: string;
    }): Promise<MemoryPhoneResult & { duplicate?: boolean }> {
      if (params.idempotencyKey && keys.has(params.idempotencyKey)) {
        return { ok: true, duplicate: true };
      }
      if (params.idempotencyKey) keys.add(params.idempotencyKey);
      sends.push({
        phone: params.phone,
        text: params.text,
        idempotencyKey: params.idempotencyKey,
        at: new Date().toISOString(),
      });
      if (next) {
        const r = next;
        next = null;
        return r;
      }
      return { ok: true };
    },
  };
}

/** Synthetic fixtures — never real recipients / production tokens. */
export const PRINCESS_PRE_FIXTURES = {
  emailAllowlisted: "princess-uat+notifications@example.test",
  emailInvalid: "not-an-email",
  phoneAllowlisted: "+27000000001",
  expoTokenA: "ExponentPushToken[princessSyntheticTokenAAA]",
  expoTokenB: "ExponentPushToken[princessSyntheticTokenBBB]",
  idempotencyKey: "princess-pre:fixture:booking-1:assigned",
  bookingId: "00000000-0000-4000-8000-0000000000e1",
  userId: "00000000-0000-4000-8000-0000000000u1",
} as const;
