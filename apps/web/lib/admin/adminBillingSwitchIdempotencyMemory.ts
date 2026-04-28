import "server-only";

/**
 * In-process replay cache for successful admin billing PATCH responses (double-submit / retry).
 * Same Vercel instance only; sufficient for rapid double-clicks. TTL 8 minutes.
 */
const TTL_MS = 8 * 60 * 1000;
const MAX_ENTRIES = 200;

type Entry = { expiresAt: number; status: number; body: Record<string, unknown> };

const store = new Map<string, Entry>();

function prune(now: number): void {
  for (const [k, v] of store) {
    if (v.expiresAt < now) store.delete(k);
  }
  if (store.size <= MAX_ENTRIES) return;
  const sorted = [...store.entries()].sort((a, b) => a[1].expiresAt - b[1].expiresAt);
  while (sorted.length > MAX_ENTRIES) {
    const drop = sorted.shift();
    if (drop) store.delete(drop[0]);
  }
}

export function readBillingSwitchIdempotencyKey(request: Request): string | null {
  const raw = request.headers.get("Idempotency-Key")?.trim();
  if (!raw || raw.length > 256) return null;
  return raw;
}

export function tryReplayBillingSwitchSuccess(
  customerId: string,
  idempotencyKey: string,
): { status: number; body: Record<string, unknown> } | null {
  const now = Date.now();
  prune(now);
  const k = `${customerId}:${idempotencyKey}`;
  const e = store.get(k);
  if (!e || e.expiresAt < now) {
    if (e) store.delete(k);
    return null;
  }
  return { status: e.status, body: e.body };
}

/** Only cache final successful updates (not intermediate requires_confirmation responses). */
export function rememberBillingSwitchSuccess(
  customerId: string,
  idempotencyKey: string,
  status: number,
  body: Record<string, unknown>,
): void {
  const now = Date.now();
  prune(now);
  store.set(`${customerId}:${idempotencyKey}`, { expiresAt: now + TTL_MS, status, body });
}
