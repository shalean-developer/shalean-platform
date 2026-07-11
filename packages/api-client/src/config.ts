import type { ApiClientConfig, RetryPolicy } from "./types";

export const DEFAULT_TIMEOUT_MS = 30_000;

/** Documented default — not applied until retry is implemented. */
export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxAttempts: 1,
  retryStatuses: [502, 503, 504],
  baseDelayMs: 400,
};

export function resolveTimeoutMs(config: ApiClientConfig, override?: number): number {
  if (typeof override === "number") return override;
  if (typeof config.timeoutMs === "number") return config.timeoutMs;
  return DEFAULT_TIMEOUT_MS;
}

/**
 * Join base URL with a path.
 * Absolute `http(s):` paths ignore baseUrl.
 * Relative paths get a single slash join.
 */
export function resolveRequestUrl(baseUrl: string | undefined, path: string): string {
  const trimmedPath = path.trim();
  if (/^https?:\/\//i.test(trimmedPath)) return trimmedPath;

  const base = (baseUrl ?? "").replace(/\/+$/, "");
  const normalizedPath = trimmedPath.startsWith("/") ? trimmedPath : `/${trimmedPath}`;
  if (!base) return normalizedPath;
  return `${base}${normalizedPath}`;
}
