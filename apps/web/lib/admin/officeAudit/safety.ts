/**
 * Read-only safety controls for the Office three-layer audit.
 *
 * This audit is infrastructure for accuracy verification only.
 * It must never mutate production bookings, payments, cleaners, or notifications.
 */

export type OfficeAuditSafetyConfig = {
  readOnly: boolean;
  target: string | null;
  allowProduction: boolean;
};

const WRITE_METHOD_RE = /^(POST|PUT|PATCH|DELETE)$/i;

/** Auth-only browser POSTs needed to establish an admin session for UI capture. */
const AUTH_PATH_ALLOW_RE =
  /\/(auth\/v1\/(token|logout|user)|api\/auth|login|signin|sign-in|session)(\b|\/|\?|#|$)/i;

export function loadOfficeAuditSafetyFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): OfficeAuditSafetyConfig {
  const readOnly = String(env.OFFICE_AUDIT_READ_ONLY ?? "").trim().toLowerCase() === "true";
  const target = String(env.OFFICE_AUDIT_TARGET ?? "").trim().toLowerCase() || null;
  return {
    readOnly,
    target,
    allowProduction: readOnly && target === "production",
  };
}

export function assertOfficeAuditMayRun(params: {
  safety: OfficeAuditSafetyConfig;
  baseUrl: string;
  targetHint?: string | null;
}): void {
  const host = (() => {
    try {
      return new URL(params.baseUrl).hostname.toLowerCase();
    } catch {
      return "";
    }
  })();
  const looksProduction =
    params.safety.target === "production" ||
    params.targetHint === "production" ||
    host === "shalean.co.za" ||
    host.endsWith(".shalean.co.za");

  if (looksProduction && !params.safety.readOnly) {
    throw new Error(
      "Refusing to run Office audit against production without OFFICE_AUDIT_READ_ONLY=true",
    );
  }
  if (params.safety.target === "production" && !params.safety.readOnly) {
    throw new Error("OFFICE_AUDIT_TARGET=production requires OFFICE_AUDIT_READ_ONLY=true");
  }
}

export function isAuthOnlyWritePath(url: string): boolean {
  try {
    const path = new URL(url).pathname;
    return AUTH_PATH_ALLOW_RE.test(path);
  } catch {
    return AUTH_PATH_ALLOW_RE.test(url);
  }
}

export function assertReadOnlyHttpRequest(method: string, url: string): void {
  const m = method.toUpperCase();
  if (m === "GET" || m === "HEAD") return;
  if (isAuthOnlyWritePath(url)) return;
  throw new Error(`Blocked non-GET audit HTTP method ${m} for ${url}`);
}

/** Proxy guard used by tests / runners — never issues production business writes. */
export function createReadOnlyFetch(writeAttempts: { count: number }): typeof fetch {
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const method = String(init?.method ?? "GET").toUpperCase();
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (method !== "GET" && method !== "HEAD") {
      // Supabase PostgREST mutations and admin APIs use non-GET verbs — always block here.
      // Auth-only browser login is handled separately in Playwright (not via this fetch).
      writeAttempts.count += 1;
      throw new Error(`OFFICE_AUDIT_READ_ONLY blocked ${method} ${url}`);
    }
    assertReadOnlyHttpRequest(method, url);
    return fetch(input, { ...init, method });
  };
}

/**
 * Playwright network guard: abort non-GET/HEAD except auth/session establishment.
 * Counts blocked business-write attempts for the audit safety report.
 */
export function shouldBlockBrowserWrite(method: string, url: string): boolean {
  const m = method.toUpperCase();
  if (m === "GET" || m === "HEAD" || m === "OPTIONS") return false;
  return !isAuthOnlyWritePath(url);
}

export function isMutatingSupabaseCall(method: string): boolean {
  return ["insert", "update", "upsert", "delete", "rpc"].includes(method.toLowerCase());
}

/** Incomplete evidence / non-PASS statuses must fail the process (nonzero exit). */
export function officeAuditShouldFailProcess(counts: {
  FAIL: number;
  BLOCKED: number;
  "NOT AUTHORITATIVE": number;
  "NOT IMPLEMENTED": number;
  "SKIPPED WITH JUSTIFICATION": number;
}, decision: "GO" | "NO-GO"): boolean {
  return (
    decision !== "GO" ||
    counts.FAIL > 0 ||
    counts.BLOCKED > 0 ||
    counts["NOT AUTHORITATIVE"] > 0 ||
    counts["NOT IMPLEMENTED"] > 0 ||
    counts["SKIPPED WITH JUSTIFICATION"] > 0
  );
}
