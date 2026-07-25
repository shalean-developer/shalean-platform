/**
 * Read-only safety controls for the Office three-layer audit.
 */

export type OfficeAuditSafetyConfig = {
  readOnly: boolean;
  target: string | null;
  allowProduction: boolean;
};

const WRITE_METHOD_RE = /^(POST|PUT|PATCH|DELETE)$/i;
const WRITE_PATH_HINT_RE =
  /(assign|unassign|create|update|delete|approve|payout|notify|sms|whatsapp|email|call|zoho|paystack|charge|refund)/i;

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

export function assertReadOnlyHttpRequest(method: string, url: string): void {
  if (WRITE_METHOD_RE.test(method)) {
    throw new Error(`Blocked non-GET audit HTTP method ${method} for ${url}`);
  }
  // Allow GET even if path contains words like "payment" — only block obvious write endpoints when method is non-GET.
  if (WRITE_METHOD_RE.test(method) && WRITE_PATH_HINT_RE.test(url)) {
    throw new Error(`Blocked write-like audit request ${method} ${url}`);
  }
}

/** Proxy guard used by tests / runners — never issues writes. */
export function createReadOnlyFetch(writeAttempts: { count: number }): typeof fetch {
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const method = String(init?.method ?? "GET").toUpperCase();
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (method !== "GET" && method !== "HEAD") {
      writeAttempts.count += 1;
      throw new Error(`OFFICE_AUDIT_READ_ONLY blocked ${method} ${url}`);
    }
    assertReadOnlyHttpRequest(method, url);
    return fetch(input, { ...init, method });
  };
}

export function isMutatingSupabaseCall(method: string): boolean {
  return ["insert", "update", "upsert", "delete", "rpc"].includes(method.toLowerCase());
}
