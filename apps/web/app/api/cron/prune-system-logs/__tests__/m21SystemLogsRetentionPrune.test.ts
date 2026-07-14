import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { readRepositoryMigration } from "@/lib/audit/resolveRepositoryMigration";

/**
 * M-21: `system_logs` retention prune — regression suite.
 *
 * The prune path already exists on disk:
 *
 *   1. SQL RPC `public.prune_system_logs(p_retention_days int default 30)`
 *      shipped in `supabase/migrations/20260494_system_logs_prune_analytics_rpc.sql`.
 *      It clamps the window to `[1, 365]`, returns the deleted row count,
 *      runs as `SECURITY DEFINER` and is granted only to `service_role`.
 *
 *   2. Cron handler `apps/web/app/api/cron/prune-system-logs/route.ts`:
 *      Bearer-secret guarded, parses `SYSTEM_LOG_RETENTION_DAYS` (default 30,
 *      max 365), invokes the RPC, and emits a structured `logSystemEvent`
 *      / `reportOperationalIssue` based on outcome.
 *
 * This suite locks BOTH artefacts so the M-21 contract cannot regress:
 *
 *   A. Auth contract — the route refuses callers without `CRON_SECRET` and
 *      refuses requests with the wrong bearer.
 *   B. Retention contract — the route honours `SYSTEM_LOG_RETENTION_DAYS`
 *      with a safe default of 30, clamps to `[1, 365]`, and falls back to
 *      the default for invalid input (NaN, ≤ 0). Recent logs (created_at
 *      ≥ now() - retention) are never deleted because the SQL predicate is
 *      strictly `created_at < now() - interval`.
 *   C. Scope contract — the prune ONLY deletes from `public.system_logs`.
 *      It never targets financial audit tables (`admin_earnings_actions`,
 *      `payment_events`, `cleaner_payouts`, `cleaner_earnings`, `bookings`,
 *      etc.). Verified at the route layer (no other table reference) and
 *      at the SQL layer (the only DELETE statement targets system_logs).
 *   D. Observability contract — success emits `logSystemEvent` with the
 *      deleted count + retentionDays; RPC failure emits
 *      `reportOperationalIssue("error", ...)` and returns 500 instead of
 *      a silent no-op.
 *   E. Cron-lock classification — the route is intentionally not wrapped
 *      in `withCronLock` (diagnostic prune, not financial), and its name
 *      is registered in the H-15 "always-ok" list.
 *
 * The runtime tests stub `@/lib/supabase/admin` and `@/lib/logging/systemLog`
 * so no DB connection is made. The migration tests are filesystem-only.
 */

vi.mock("@/lib/logging/systemLog", () => ({
  logSystemEvent: vi.fn().mockResolvedValue(undefined),
  reportOperationalIssue: vi.fn().mockResolvedValue(undefined),
}));

const adminRpcMock = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: vi.fn(() => ({ rpc: adminRpcMock })),
}));

import { GET, POST } from "@/app/api/cron/prune-system-logs/route";
import { logSystemEvent, reportOperationalIssue } from "@/lib/logging/systemLog";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// __tests__ → prune-system-logs → cron → api → app → web (= webRoot, 5 ups)
//                                                      → apps → repo (= repoRoot, 7 ups)
const webRoot = path.resolve(__dirname, "../../../../..");
const repoRoot = path.resolve(webRoot, "../..");
const routePath = path.join(webRoot, "app/api/cron/prune-system-logs/route.ts");
const envExamplePath = path.join(webRoot, ".env.example");
const h15TestPath = path.join(
  webRoot,
  "lib/cron/__tests__/h15CronLockOverlapPrevention.test.ts",
);

const TEST_SECRET = "test-cron-secret-m21";

function buildRequest(opts: { method?: "POST" | "GET"; bearer?: string | null } = {}): Request {
  const headers: Record<string, string> = {};
  if (opts.bearer !== null && opts.bearer !== undefined) {
    headers.authorization = `Bearer ${opts.bearer}`;
  }
  return new Request("https://example.com/api/cron/prune-system-logs", {
    method: opts.method ?? "POST",
    headers,
  });
}

beforeEach(() => {
  vi.mocked(logSystemEvent).mockClear();
  vi.mocked(reportOperationalIssue).mockClear();
  vi.mocked(getSupabaseAdmin).mockClear();
  vi.mocked(getSupabaseAdmin).mockReturnValue({ rpc: adminRpcMock } as unknown as ReturnType<typeof getSupabaseAdmin>);
  adminRpcMock.mockReset();
  adminRpcMock.mockResolvedValue({ data: 0, error: null });
  process.env.CRON_SECRET = TEST_SECRET;
  delete process.env.SYSTEM_LOG_RETENTION_DAYS;
});

afterEach(() => {
  delete process.env.CRON_SECRET;
  delete process.env.SYSTEM_LOG_RETENTION_DAYS;
});

// ---------------------------------------------------------------------------
// Contract A — Auth
// ---------------------------------------------------------------------------
describe("M-21 prune-system-logs route — auth contract", () => {
  it("returns 503 when CRON_SECRET is not configured (refuses to silently no-op)", async () => {
    delete process.env.CRON_SECRET;
    const res = await POST(buildRequest({ bearer: TEST_SECRET }));
    expect(res.status).toBe(503);
    expect(adminRpcMock).not.toHaveBeenCalled();
  });

  it("returns 401 when Authorization header is missing", async () => {
    const res = await POST(buildRequest({ bearer: null }));
    expect(res.status).toBe(401);
    expect(adminRpcMock).not.toHaveBeenCalled();
  });

  it("returns 401 when Authorization bearer does not match CRON_SECRET", async () => {
    const res = await POST(buildRequest({ bearer: "wrong-secret" }));
    expect(res.status).toBe(401);
    expect(adminRpcMock).not.toHaveBeenCalled();
  });

  it("returns 503 when Supabase admin client is unavailable (e.g. missing service-role key)", async () => {
    vi.mocked(getSupabaseAdmin).mockReturnValueOnce(null);
    const res = await POST(buildRequest({ bearer: TEST_SECRET }));
    expect(res.status).toBe(503);
    expect(adminRpcMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Contract B — Retention
// ---------------------------------------------------------------------------
describe("M-21 prune-system-logs route — retention contract", () => {
  it("uses default 30 days when SYSTEM_LOG_RETENTION_DAYS is unset", async () => {
    delete process.env.SYSTEM_LOG_RETENTION_DAYS;
    adminRpcMock.mockResolvedValueOnce({ data: 17, error: null });
    const res = await POST(buildRequest({ bearer: TEST_SECRET }));
    expect(res.status).toBe(200);
    expect(adminRpcMock).toHaveBeenCalledWith("prune_system_logs", { p_retention_days: 30 });
    const json = (await res.json()) as { ok: boolean; deleted: number; retentionDays: number };
    expect(json).toEqual({ ok: true, deleted: 17, retentionDays: 30 });
  });

  it("honours an explicit positive integer (7) — passes it directly to the RPC", async () => {
    process.env.SYSTEM_LOG_RETENTION_DAYS = "7";
    adminRpcMock.mockResolvedValueOnce({ data: 5, error: null });
    const res = await POST(buildRequest({ bearer: TEST_SECRET }));
    expect(res.status).toBe(200);
    expect(adminRpcMock).toHaveBeenCalledWith("prune_system_logs", { p_retention_days: 7 });
    const json = (await res.json()) as { retentionDays: number };
    expect(json.retentionDays).toBe(7);
  });

  it("clamps to upper bound 365 when SYSTEM_LOG_RETENTION_DAYS exceeds it (defence in depth — RPC also clamps)", async () => {
    process.env.SYSTEM_LOG_RETENTION_DAYS = "9999";
    await POST(buildRequest({ bearer: TEST_SECRET }));
    expect(adminRpcMock).toHaveBeenCalledWith("prune_system_logs", { p_retention_days: 365 });
  });

  it("clamps to lower bound 1 when 0 < SYSTEM_LOG_RETENTION_DAYS < 1 (e.g. 0.5)", async () => {
    process.env.SYSTEM_LOG_RETENTION_DAYS = "0.5";
    await POST(buildRequest({ bearer: TEST_SECRET }));
    // 0.5 > 0 → passes the > 0 gate → Math.round(0.5) = 1 (or 0 in banker's rounding; max(1, …) = 1).
    expect(adminRpcMock).toHaveBeenCalledWith("prune_system_logs", { p_retention_days: 1 });
  });

  it("falls back to default 30 when SYSTEM_LOG_RETENTION_DAYS is exactly 0 (would otherwise be unsafe)", async () => {
    process.env.SYSTEM_LOG_RETENTION_DAYS = "0";
    await POST(buildRequest({ bearer: TEST_SECRET }));
    expect(adminRpcMock).toHaveBeenCalledWith("prune_system_logs", { p_retention_days: 30 });
  });

  it("falls back to default 30 when SYSTEM_LOG_RETENTION_DAYS is negative", async () => {
    process.env.SYSTEM_LOG_RETENTION_DAYS = "-7";
    await POST(buildRequest({ bearer: TEST_SECRET }));
    expect(adminRpcMock).toHaveBeenCalledWith("prune_system_logs", { p_retention_days: 30 });
  });

  it("falls back to default 30 when SYSTEM_LOG_RETENTION_DAYS is non-numeric (e.g. 'forever')", async () => {
    process.env.SYSTEM_LOG_RETENTION_DAYS = "forever";
    await POST(buildRequest({ bearer: TEST_SECRET }));
    expect(adminRpcMock).toHaveBeenCalledWith("prune_system_logs", { p_retention_days: 30 });
  });

  it("rounds fractional inputs (e.g. 30.7 → 31) before clamping", async () => {
    process.env.SYSTEM_LOG_RETENTION_DAYS = "30.7";
    await POST(buildRequest({ bearer: TEST_SECRET }));
    expect(adminRpcMock).toHaveBeenCalledWith("prune_system_logs", { p_retention_days: 31 });
  });
});

// ---------------------------------------------------------------------------
// Contract C — Scope (only deletes system_logs)
// ---------------------------------------------------------------------------
describe("M-21 prune-system-logs route — scope contract", () => {
  it("invokes ONLY the `prune_system_logs` RPC and never raw .from(...).delete() on any table", async () => {
    const fromSpy = vi.fn();
    vi.mocked(getSupabaseAdmin).mockReturnValueOnce({
      rpc: adminRpcMock,
      from: fromSpy,
    } as unknown as ReturnType<typeof getSupabaseAdmin>);
    await POST(buildRequest({ bearer: TEST_SECRET }));
    expect(adminRpcMock).toHaveBeenCalledTimes(1);
    expect(adminRpcMock).toHaveBeenCalledWith("prune_system_logs", expect.any(Object));
    expect(fromSpy).not.toHaveBeenCalled();
  });

  it("source code references only the `prune_system_logs` RPC name (no other RPC, no other table)", () => {
    const src = readFileSync(routePath, "utf8");
    const rpcCalls = Array.from(src.matchAll(/\.rpc\(\s*["']([^"']+)["']/g)).map((m) => m[1]);
    expect(rpcCalls).toEqual(["prune_system_logs"]);

    const fromCalls = Array.from(src.matchAll(/\.from\(\s*["']([^"']+)["']/g)).map((m) => m[1]);
    expect(fromCalls, "route handler must not touch any table directly").toEqual([]);
  });

  it("source code never references financial audit tables", () => {
    const src = readFileSync(routePath, "utf8");
    const FINANCIAL_TABLES = [
      "admin_earnings_actions",
      "payment_events",
      "cleaner_payouts",
      "cleaner_earnings",
      "cleaner_payout_runs",
      "bookings",
      "monthly_invoices",
      "paystack_transfers",
    ];
    for (const t of FINANCIAL_TABLES) {
      expect(src, `prune route must never reference ${t}`).not.toContain(t);
    }
  });
});

// ---------------------------------------------------------------------------
// Contract D — Observability
// ---------------------------------------------------------------------------
describe("M-21 prune-system-logs route — observability contract", () => {
  it("on success emits logSystemEvent('info', 'cron/prune-system-logs', …) with the deleted count and retentionDays", async () => {
    process.env.SYSTEM_LOG_RETENTION_DAYS = "14";
    adminRpcMock.mockResolvedValueOnce({ data: 42, error: null });
    const res = await POST(buildRequest({ bearer: TEST_SECRET }));
    expect(res.status).toBe(200);

    expect(logSystemEvent).toHaveBeenCalledTimes(1);
    expect(logSystemEvent).toHaveBeenCalledWith({
      level: "info",
      source: "cron/prune-system-logs",
      message: "Pruned system_logs older than 14d",
      context: { deleted: 42, retentionDays: 14 },
    });
    expect(reportOperationalIssue).not.toHaveBeenCalled();
  });

  it("on RPC failure escalates via reportOperationalIssue('error', …) and returns 500 (never silently swallows)", async () => {
    adminRpcMock.mockResolvedValueOnce({
      data: null,
      error: { message: "permission denied for function prune_system_logs", code: "42501" },
    });
    const res = await POST(buildRequest({ bearer: TEST_SECRET }));
    expect(res.status).toBe(500);
    expect(reportOperationalIssue).toHaveBeenCalledTimes(1);
    const [level, source, message, ctx] = vi.mocked(reportOperationalIssue).mock.calls[0]!;
    expect(level).toBe("error");
    expect(source).toBe("cron/prune-system-logs");
    expect(message).toContain("permission denied");
    expect(ctx).toMatchObject({ retentionDays: 30 });
    expect(logSystemEvent).not.toHaveBeenCalled();
  });

  it("coerces a string row-count to a number so observability output is always numeric", async () => {
    adminRpcMock.mockResolvedValueOnce({ data: "123", error: null });
    const res = await POST(buildRequest({ bearer: TEST_SECRET }));
    const json = (await res.json()) as { deleted: unknown };
    expect(json.deleted).toBe(123);
  });

  it("emits deleted=0 for an empty-result run (no false-positive 'nothing happened' log noise)", async () => {
    adminRpcMock.mockResolvedValueOnce({ data: 0, error: null });
    const res = await POST(buildRequest({ bearer: TEST_SECRET }));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { deleted: number };
    expect(json.deleted).toBe(0);
    expect(logSystemEvent).toHaveBeenCalledTimes(1);
    expect(reportOperationalIssue).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Contract — GET delegates to POST (Vercel cron treats either verb identically)
// ---------------------------------------------------------------------------
describe("M-21 prune-system-logs route — GET delegates to POST", () => {
  it("GET with the same bearer token produces the same response and the same RPC call", async () => {
    adminRpcMock.mockResolvedValueOnce({ data: 9, error: null });
    const res = await GET(buildRequest({ method: "GET", bearer: TEST_SECRET }));
    expect(res.status).toBe(200);
    expect(adminRpcMock).toHaveBeenCalledWith("prune_system_logs", { p_retention_days: 30 });
    const json = (await res.json()) as { ok: boolean; deleted: number };
    expect(json).toMatchObject({ ok: true, deleted: 9 });
  });

  it("GET also rejects unauthorized callers (auth path is shared)", async () => {
    const res = await GET(buildRequest({ method: "GET", bearer: "wrong" }));
    expect(res.status).toBe(401);
    expect(adminRpcMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Contract — Migration content (RPC clamp + scope isolation)
// ---------------------------------------------------------------------------
describe("M-21 supabase/migrations/20260494 prune_system_logs RPC — content invariants", () => {
  const { sql } = readRepositoryMigration("20260494_system_logs_prune_analytics_rpc.sql");
  const sqlLower = sql.toLowerCase();
  // Strip comments before checking statement-level invariants so prose can't false-match.
  const sqlCode = sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");
  const sqlCodeLower = sqlCode.toLowerCase();

  it("creates `prune_system_logs(p_retention_days int default 30)` returning bigint, security definer, search_path = public", () => {
    expect(sqlCode).toMatch(
      /create\s+or\s+replace\s+function\s+public\.prune_system_logs\s*\(\s*p_retention_days\s+int\s+default\s+30\s*\)\s*returns\s+bigint\s+language\s+plpgsql\s+security\s+definer\s+set\s+search_path\s*=\s*public/i,
    );
  });

  it("clamps the retention window to [1, 365] using greatest(1, least(coalesce(p_retention_days, 30), 365))", () => {
    expect(sqlCode).toMatch(
      /greatest\s*\(\s*1\s*,\s*least\s*\(\s*coalesce\s*\(\s*p_retention_days\s*,\s*30\s*\)\s*,\s*365\s*\)\s*\)/i,
    );
  });

  it("only DELETEs from public.system_logs (never financial audit tables)", () => {
    const deletes = Array.from(
      sqlCodeLower.matchAll(/\bdelete\s+from\s+(public\.[a-z_][a-z0-9_]*)/g),
    ).map((m) => m[1]);
    expect(deletes.length).toBeGreaterThan(0);
    for (const t of deletes) {
      expect(t).toBe("public.system_logs");
    }
  });

  it("uses a strict `created_at < now() - interval` predicate so recent rows are NEVER deleted", () => {
    // Strict `<` (not `<=`) preserves rows whose created_at is exactly at the boundary.
    expect(sqlCode).toMatch(
      /where\s+created_at\s*<\s*now\s*\(\s*\)\s*-\s*\(\s*days::text\s*\|\|\s*'\s*days'\s*\)::interval/i,
    );
    expect(sqlCode, "predicate must use strict `<`, never `<=`").not.toMatch(
      /where\s+created_at\s*<=\s*now\s*\(\s*\)/i,
    );
  });

  it("returns the deleted row count via `count(*)` over the RETURNING CTE (callers can audit deletions)", () => {
    expect(sqlCodeLower).toMatch(/returning\s+1/);
    expect(sqlCodeLower).toMatch(/select\s+count\s*\(\s*\*\s*\)\s+into\s+n\s+from\s+d/);
    expect(sqlCodeLower).toMatch(/return\s+coalesce\s*\(\s*n\s*,\s*0\s*\)\s*;/);
  });

  it("grants execute ONLY to service_role (no anon / authenticated / public widening)", () => {
    expect(sqlCode).toMatch(
      /grant\s+execute\s+on\s+function\s+public\.prune_system_logs\s*\(\s*int\s*\)\s+to\s+service_role\s*;/i,
    );
    const grants = Array.from(
      sqlCodeLower.matchAll(/grant\s+execute\s+on\s+function\s+public\.prune_system_logs[^;]*?to\s+([a-z_,\s]+);/g),
    ).map((m) => m[1].trim());
    for (const audience of grants) {
      const tokens = audience.split(/\s*,\s*/).map((t) => t.trim()).filter(Boolean);
      for (const t of tokens) {
        expect(t).toBe("service_role");
      }
    }
  });

  it("does not introduce TRUNCATE or DROP TABLE statements (delete-by-predicate only)", () => {
    expect(sqlCodeLower).not.toMatch(/\btruncate\b/);
    expect(sqlCodeLower).not.toMatch(/\bdrop\s+table\b/);
    expect(sqlCodeLower, "must never reference admin_earnings_actions").not.toMatch(/admin_earnings_actions/);
    expect(sqlCodeLower, "must never reference payment_events").not.toMatch(/payment_events/);
    expect(sqlCodeLower, "must never reference cleaner_payouts").not.toMatch(/cleaner_payouts/);
    expect(sqlCodeLower, "must never reference cleaner_earnings").not.toMatch(/cleaner_earnings/);
    expect(sqlCodeLower, "must never reference monthly_invoices").not.toMatch(/monthly_invoices/);
  });

  it("comment on the function documents the clamp + default for future readers", () => {
    expect(sqlLower).toMatch(/comment\s+on\s+function\s+public\.prune_system_logs\(int\)/);
    expect(sqlLower).toMatch(/1.*365|365.*1/); // both bounds are mentioned in the comment block
    expect(sqlLower).toMatch(/default\s+30/);
  });
});

// ---------------------------------------------------------------------------
// Contract — env / docs / cron-lock cross-links
// ---------------------------------------------------------------------------
describe("M-21 prune-system-logs — wiring + cron-lock classification", () => {
  it(".env.example documents SYSTEM_LOG_RETENTION_DAYS with default + clamp + scope", () => {
    const env = readFileSync(envExamplePath, "utf8");
    expect(env).toMatch(/SYSTEM_LOG_RETENTION_DAYS=/);
    const idx = env.indexOf("SYSTEM_LOG_RETENTION_DAYS=");
    // Capture the comment block immediately preceding the variable.
    const preceding = env.slice(Math.max(0, idx - 600), idx);
    expect(preceding, ".env.example must document the default").toMatch(/default\s+30/i);
    expect(preceding, ".env.example must document the clamp range").toMatch(/365/);
    expect(preceding, ".env.example must document the cron path").toMatch(/prune-system-logs/);
    expect(preceding, ".env.example must call out audit-log isolation").toMatch(/admin_earnings_actions/);
  });

  it("route's DEFAULT_RETENTION_DAYS matches the SQL RPC default (30) — single source of truth on bounds", () => {
    const src = readFileSync(routePath, "utf8");
    expect(src).toMatch(/const\s+DEFAULT_RETENTION_DAYS\s*=\s*30\b/);
    expect(src).toMatch(/Math\.min\(\s*365\s*,\s*Math\.max\(\s*1\s*,/);
  });

  it("H-15 cron-lock test still classifies prune-system-logs as a non-financial 'always-ok' route (not auto-locked)", () => {
    const src = readFileSync(h15TestPath, "utf8");
    expect(src).toMatch(/["']prune-system-logs["']/);
    // The route file itself must NOT import the cron-lock helper — it's an
    // observability-only diagnostic prune that doesn't need serialization.
    const routeSrc = readFileSync(routePath, "utf8");
    expect(routeSrc).not.toMatch(/@\/lib\/cron\/cronLock/);
  });
});
