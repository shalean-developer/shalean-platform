import { cleanerAuthenticatedFetch } from "@/lib/cleaner/cleanerAuthenticatedFetch";

const BACKOFF_MS = [1_000, 2_000, 4_000];

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function isRetryableStatus(status: number): boolean {
  return status >= 500 && status <= 599;
}

export type LifecyclePostResult = {
  ok: boolean;
  duplicate?: boolean;
  error?: string;
  status: number;
};

/**
 * POST lifecycle with small backoff retries (network errors + 5xx only).
 * Caller supplies a stable `idempotencyKey` per user gesture (and retries reuse it).
 */
export async function postCleanerLifecycleWithRetry(params: {
  bookingId: string;
  action: string;
  idempotencyKey: string;
  getHeaders: () => Promise<Record<string, string> | null>;
  /** Cleared after a definitive lifecycle HTTP outcome (`2xx` or `409` idempotent hit), including flush throttle. */
  onPostSuccess?: () => void;
}): Promise<LifecyclePostResult> {
  const { bookingId, action, idempotencyKey, getHeaders, onPostSuccess } = params;
  const url = `/api/cleaner/jobs/${encodeURIComponent(bookingId)}`;

  for (let attempt = 0; attempt < BACKOFF_MS.length + 1; attempt++) {
    const headers = await getHeaders();
    if (!headers) {
      return { ok: false, error: "Not signed in.", status: 401 };
    }
    try {
      const res = await cleanerAuthenticatedFetch(url, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ action, idempotency_key: idempotencyKey }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string; ok?: boolean; duplicate?: boolean };

      if (isRetryableStatus(res.status) && attempt < BACKOFF_MS.length) {
        await sleep(BACKOFF_MS[attempt] ?? 1_000);
        continue;
      }

      if (res.ok || res.status === 409) {
        onPostSuccess?.();
      }

      if (res.status === 409) {
        return { ok: true, duplicate: true, status: res.status };
      }

      if (res.ok) {
        return { ok: true, duplicate: j.duplicate === true, status: res.status };
      }

      return { ok: false, error: j.error ?? "Action failed.", status: res.status };
    } catch {
      if (attempt < BACKOFF_MS.length) {
        await sleep(BACKOFF_MS[attempt] ?? 1_000);
        continue;
      }
      return { ok: false, error: "Network error.", status: 0 };
    }
  }

  return { ok: false, error: "Network error.", status: 0 };
}
