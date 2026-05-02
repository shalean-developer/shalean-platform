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
  const online = opts?.navigatorOnline ?? (typeof navigator === "undefined" ? true : navigator.onLine);
  if (!online) return true;
  if (!res) return true;
  if (res.status === 0) return true;
  if (res.status === 503) return true;
  return false;
}
