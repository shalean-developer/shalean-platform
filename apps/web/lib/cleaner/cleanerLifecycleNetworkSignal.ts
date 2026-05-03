/** Unified offline / flaky-network signal for lifecycle POSTs and GETs. */

export function isNetworkError(e: unknown): boolean {
  if (e instanceof TypeError) return true;
  const name = typeof e === "object" && e !== null && "name" in e ? String((e as { name?: unknown }).name) : "";
  if (name === "AbortError") return true;
  return false;
}

export function isOfflineSignal(
  res: Response | null | undefined,
  opts?: { navigatorOnline?: boolean; error?: unknown },
): boolean {
  if (opts?.error != null && isNetworkError(opts.error)) return true;
  const navOnline = opts?.navigatorOnline ?? (typeof navigator === "undefined" ? true : navigator.onLine);
  if (!navOnline) return true;
  /** No `Response` yet — caller is only asking about navigator / opts.error; do not treat as offline. */
  if (res == null) return false;
  if (res.status === 0) return true;
  if (res.status === 503) return true;
  return false;
}
