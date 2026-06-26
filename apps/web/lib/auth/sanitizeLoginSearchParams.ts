const PASSWORD_QUERY_KEYS = new Set(["password", "pwd", "pass"]);
const EMAIL_QUERY_KEYS = new Set(["email", "username", "user"]);

function firstString(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed || null;
}

function isLikelyEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export type ParsedLoginSearchParams = {
  /** Safe query string including leading `?`, or empty when none. */
  safeSearch: string;
  hasPasswordInQuery: boolean;
  shouldStripCredentialsFromUrl: boolean;
  emailPrefill: string | null;
};

/**
 * Removes credential query params from login URLs. Password must never appear in the address bar.
 */
export function parseLoginSearchParams(
  params: Record<string, string | string[] | undefined>,
): ParsedLoginSearchParams {
  const safe = new URLSearchParams();
  let hasPasswordInQuery = false;
  let shouldStripCredentialsFromUrl = false;
  let emailPrefill: string | null = null;

  for (const [key, value] of Object.entries(params)) {
    const v = firstString(value);
    if (!v) continue;
    const k = key.toLowerCase();

    if (PASSWORD_QUERY_KEYS.has(k)) {
      hasPasswordInQuery = true;
      shouldStripCredentialsFromUrl = true;
      continue;
    }

    if (EMAIL_QUERY_KEYS.has(k)) {
      shouldStripCredentialsFromUrl = true;
      if (!emailPrefill && isLikelyEmail(v)) {
        emailPrefill = v.toLowerCase();
      }
      continue;
    }

    safe.set(key, v);
  }

  const qs = safe.toString();
  return {
    safeSearch: qs ? `?${qs}` : "",
    hasPasswordInQuery,
    shouldStripCredentialsFromUrl,
    emailPrefill,
  };
}

/** Client-side: strip any credential keys still present in the current URL. */
export function stripCredentialParamsFromBrowserUrl(): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  let changed = false;
  for (const key of [...url.searchParams.keys()]) {
    const k = key.toLowerCase();
    if (PASSWORD_QUERY_KEYS.has(k) || EMAIL_QUERY_KEYS.has(k)) {
      url.searchParams.delete(key);
      changed = true;
    }
  }
  if (!changed) return;
  const next = `${url.pathname}${url.search}${url.hash}`;
  window.history.replaceState(window.history.state, "", next);
}
