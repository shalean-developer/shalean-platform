import "server-only";

/** Minimum gap between payment-link notification batches for the same booking (ms). */
export function paymentLinkSendCooldownMs(): number {
  const n = Number(process.env.PAYMENT_LINK_SEND_COOLDOWN_SECONDS ?? "120");
  const sec = Number.isFinite(n) && n > 0 ? Math.min(Math.max(n, 30), 3600) : 120;
  return sec * 1000;
}

type Row = { payment_link_last_sent_at?: string | null };

export function paymentLinkSendAllowed(row: Row | null, nowMs: number = Date.now()): { allowed: true } | { allowed: false; retryAfterSec: number } {
  const raw = row?.payment_link_last_sent_at;
  if (!raw) return { allowed: true };
  const last = new Date(String(raw)).getTime();
  if (!Number.isFinite(last)) return { allowed: true };
  const cooldown = paymentLinkSendCooldownMs();
  const elapsed = nowMs - last;
  if (elapsed >= cooldown) return { allowed: true };
  const retryAfterSec = Math.max(1, Math.ceil((cooldown - elapsed) / 1000));
  return { allowed: false, retryAfterSec };
}
