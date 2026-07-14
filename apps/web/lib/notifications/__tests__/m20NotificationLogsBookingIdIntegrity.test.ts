import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { readRepositoryMigration } from "@/lib/audit/resolveRepositoryMigration";

/**
 * M-20: `notification_logs.booking_id` integrity hardening — regression suite.
 *
 * On-disk artefacts under guard:
 *   1. Migration `supabase/migrations/20260947_m20_notification_logs_booking_id_uuid_chk.sql`
 *      adds a `NOT VALID` CHECK constraint asserting `booking_id IS NULL OR
 *      booking_id ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-…'`.
 *   2. Writer `apps/web/lib/notifications/notificationLogWrite.ts` proactively
 *      normalises malformed inputs to NULL and warns once per occurrence so
 *      the audit row survives even when an upstream caller passes garbage
 *      (defense in depth — DB rejects the same shape regardless of writer).
 *
 * Contracts under test:
 *
 *   A. Migration content — `NOT VALID` CHECK is added with the documented
 *      regex, idempotently (DROP IF EXISTS), with a comment that explains
 *      audit-history preservation. No DELETEs, no TRUNCATE, no DROP TABLE,
 *      no FK to bookings (would require a UUID column type — see comment in
 *      the migration for why we deferred).
 *
 *   B. Writer normalisation — given any input booking_id, the writer
 *      produces a row whose `booking_id` is either a UUID-shaped string or
 *      NULL. Garbage inputs (non-UUID strings) are normalised to NULL and
 *      reported once via `reportOperationalIssue("warn", …)`. Notification
 *      delivery is never blocked.
 *
 *   C. Writer call-site audit — every `writeNotificationLog({ booking_id: … })`
 *      call site under `apps/web/lib/{email,notifications,templates}/**`
 *      sources `booking_id` from one of:
 *        * a typed `bookingId: string` (notifyBookingEvent payloads, etc.)
 *        * a helper that returns `string | null` and only allows UUID-shape
 *          (`bookingIdForNotificationLog`, `bookingIdFromContext`,
 *          `bookingIdForSmsLog`, etc.)
 *        * a literal `null`
 *      No call site passes a free-form string literal or a recipient email,
 *      template name, or other non-UUID identifier.
 *
 *   D. Audit-history preservation — neither the migration nor the writer
 *      change deletes, truncates, or null-mutates existing rows. Constraint
 *      is `NOT VALID`; writer only normalises NEW writes.
 *
 *   E. Read paths unaffected — admin notification-logs route, retry route,
 *      and the cooldown probe (`notifyCleanerBookingPaid`) still query
 *      `booking_id` as TEXT, which remains the column's storage type.
 *
 * The runtime tests stub `@/lib/supabase/admin` and `@/lib/logging/systemLog`
 * so no DB connection is made. The migration tests are filesystem-only.
 */

const adminInsertMock = vi.fn();
const adminFromMock = vi.fn(() => ({ insert: adminInsertMock }));

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: vi.fn(() => ({ from: adminFromMock })),
}));

vi.mock("@/lib/logging/systemLog", () => ({
  reportOperationalIssue: vi.fn().mockResolvedValue(undefined),
  logSystemEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/notifications/customerContactHealth", () => ({
  scheduleCustomerContactHealthRefresh: vi.fn(),
}));

vi.mock("@/lib/notifications/notificationCostEstimates", () => ({
  estimatedNotificationCostUsd: () => 0.001,
  NOTIFICATION_COST_CURRENCY: "USD",
}));

import { writeNotificationLog } from "@/lib/notifications/notificationLogWrite";
import { reportOperationalIssue } from "@/lib/logging/systemLog";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { scheduleCustomerContactHealthRefresh } from "@/lib/notifications/customerContactHealth";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// __tests__ → notifications → lib → web (= webRoot, 3 ups) → apps → repo (= repoRoot, 5 ups)
const webRoot = path.resolve(__dirname, "..", "..", "..");
const repoRoot = path.resolve(webRoot, "..", "..");
const writerPath = path.join(webRoot, "lib/notifications/notificationLogWrite.ts");

const SAMPLE_UUID = "11111111-2222-4333-8444-555555555555";
const SAMPLE_UUID_UPPER = "AABBCCDD-EEFF-4011-8022-334455667788";

function buildInsertSpy(): { insertedRow: Record<string, unknown> | null } {
  const ref: { insertedRow: Record<string, unknown> | null } = { insertedRow: null };
  adminInsertMock.mockImplementation(async (row: Record<string, unknown>) => {
    ref.insertedRow = row;
    return { error: null };
  });
  return ref;
}

beforeEach(() => {
  vi.mocked(reportOperationalIssue).mockClear();
  vi.mocked(scheduleCustomerContactHealthRefresh).mockClear();
  vi.mocked(getSupabaseAdmin).mockClear();
  vi.mocked(getSupabaseAdmin).mockReturnValue({ from: adminFromMock } as unknown as ReturnType<typeof getSupabaseAdmin>);
  adminFromMock.mockClear();
  adminInsertMock.mockReset();
  adminInsertMock.mockResolvedValue({ error: null });
});

afterEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Contract B — Writer normalisation
// ---------------------------------------------------------------------------
describe("M-20 writeNotificationLog: booking_id normalisation", () => {
  it("preserves a valid lowercase UUID booking_id verbatim", async () => {
    const spy = buildInsertSpy();
    await writeNotificationLog({
      booking_id: SAMPLE_UUID,
      channel: "email",
      template_key: "booking_confirmed",
      recipient: "customer@example.com",
      status: "sent",
      provider: "resend",
    });
    expect(spy.insertedRow).not.toBeNull();
    expect(spy.insertedRow?.booking_id).toBe(SAMPLE_UUID);
    expect(reportOperationalIssue).not.toHaveBeenCalled();
  });

  it("preserves a valid uppercase UUID booking_id verbatim (regex is case-insensitive)", async () => {
    const spy = buildInsertSpy();
    await writeNotificationLog({
      booking_id: SAMPLE_UUID_UPPER,
      channel: "email",
      template_key: "booking_confirmed",
      recipient: "customer@example.com",
      status: "sent",
      provider: "resend",
    });
    expect(spy.insertedRow?.booking_id).toBe(SAMPLE_UUID_UPPER);
    expect(reportOperationalIssue).not.toHaveBeenCalled();
  });

  it("trims surrounding whitespace before validating (matches existing trim contract)", async () => {
    const spy = buildInsertSpy();
    await writeNotificationLog({
      booking_id: `   ${SAMPLE_UUID}   `,
      channel: "email",
      template_key: "booking_confirmed",
      recipient: "customer@example.com",
      status: "sent",
      provider: "resend",
    });
    expect(spy.insertedRow?.booking_id).toBe(SAMPLE_UUID);
    expect(reportOperationalIssue).not.toHaveBeenCalled();
  });

  it("preserves null booking_id (admin / pre-booking notifications)", async () => {
    const spy = buildInsertSpy();
    await writeNotificationLog({
      booking_id: null,
      channel: "email",
      template_key: "booking_payment_processing",
      recipient: "customer@example.com",
      status: "sent",
      provider: "resend",
    });
    expect(spy.insertedRow?.booking_id).toBeNull();
    expect(reportOperationalIssue).not.toHaveBeenCalled();
  });

  it("treats undefined booking_id as null (no warn, no normalisation needed)", async () => {
    const spy = buildInsertSpy();
    await writeNotificationLog({
      channel: "email",
      template_key: "booking_payment_processing",
      recipient: "customer@example.com",
      status: "sent",
      provider: "resend",
    });
    expect(spy.insertedRow?.booking_id).toBeNull();
    expect(reportOperationalIssue).not.toHaveBeenCalled();
  });

  it("treats whitespace-only booking_id as null (no warn — it was effectively unset)", async () => {
    const spy = buildInsertSpy();
    await writeNotificationLog({
      booking_id: "   ",
      channel: "email",
      template_key: "booking_confirmed",
      recipient: "customer@example.com",
      status: "sent",
      provider: "resend",
    });
    expect(spy.insertedRow?.booking_id).toBeNull();
    expect(reportOperationalIssue).not.toHaveBeenCalled();
  });

  it("normalises a non-UUID booking_id to NULL and reports a warn-level operational issue", async () => {
    const spy = buildInsertSpy();
    await writeNotificationLog({
      booking_id: "not-a-uuid",
      channel: "sms",
      template_key: "review_prompt",
      recipient: "+27821234567",
      status: "sent",
      provider: "twilio",
    });
    expect(spy.insertedRow?.booking_id).toBeNull();
    expect(reportOperationalIssue).toHaveBeenCalledTimes(1);
    const call = vi.mocked(reportOperationalIssue).mock.calls[0]!;
    expect(call[0]).toBe("warn");
    expect(call[1]).toBe("writeNotificationLog");
    expect(call[2]).toBe("non_uuid_booking_id_normalized_to_null");
    expect(call[3]).toMatchObject({
      channel: "sms",
      template_key: "review_prompt",
      sample: "not-a-uuid",
    });
  });

  it("normalises a near-UUID with bad segment lengths to NULL", async () => {
    const spy = buildInsertSpy();
    await writeNotificationLog({
      booking_id: "1234-5678-9abc-def0",
      channel: "email",
      template_key: "x",
      recipient: "x@example.com",
      status: "failed",
      provider: "resend",
    });
    expect(spy.insertedRow?.booking_id).toBeNull();
    expect(reportOperationalIssue).toHaveBeenCalledOnce();
  });

  it("normalises a UUID with non-hex characters to NULL (e.g. 'g' is not hex)", async () => {
    const spy = buildInsertSpy();
    await writeNotificationLog({
      booking_id: "gggggggg-2222-4333-8444-555555555555",
      channel: "email",
      template_key: "x",
      recipient: "x@example.com",
      status: "sent",
      provider: "resend",
    });
    expect(spy.insertedRow?.booking_id).toBeNull();
    expect(reportOperationalIssue).toHaveBeenCalledOnce();
  });

  it("warning sample is truncated at 32 chars (PII-safe diagnostic budget)", async () => {
    const spy = buildInsertSpy();
    const longGarbage = "x".repeat(120);
    await writeNotificationLog({
      booking_id: longGarbage,
      channel: "email",
      template_key: "x",
      recipient: "x@example.com",
      status: "sent",
      provider: "resend",
    });
    expect(spy.insertedRow?.booking_id).toBeNull();
    const call = vi.mocked(reportOperationalIssue).mock.calls[0]!;
    expect((call[3] as { sample: string }).sample.length).toBeLessThanOrEqual(32);
  });

  it("notification delivery is never blocked: insert is still attempted with null booking_id when garbage is normalised away", async () => {
    const spy = buildInsertSpy();
    await writeNotificationLog({
      booking_id: "garbage",
      channel: "email",
      template_key: "test_send",
      recipient: "ops@example.com",
      status: "sent",
      provider: "resend",
    });
    expect(adminInsertMock).toHaveBeenCalledTimes(1);
    expect(spy.insertedRow).not.toBeNull();
    expect(spy.insertedRow?.status).toBe("sent");
    expect(spy.insertedRow?.recipient).toBe("ops@example.com");
  });

  it("on insert error: writer warns and returns without throwing (notification flow proceeds)", async () => {
    adminInsertMock.mockResolvedValueOnce({
      error: { message: "permission denied for table notification_logs" },
    });
    await expect(
      writeNotificationLog({
        booking_id: SAMPLE_UUID,
        channel: "email",
        template_key: "booking_confirmed",
        recipient: "customer@example.com",
        status: "sent",
        provider: "resend",
      }),
    ).resolves.toBeUndefined();
    expect(reportOperationalIssue).toHaveBeenCalledTimes(1);
    expect(vi.mocked(reportOperationalIssue).mock.calls[0]![0]).toBe("warn");
  });
});

// ---------------------------------------------------------------------------
// Contract C — Writer call-site audit (static)
// ---------------------------------------------------------------------------
describe("M-20 writer call-site audit: every writeNotificationLog passes a UUID-or-null booking_id", () => {
  /**
   * The set of allowed RHS expressions for `booking_id:` arguments. Any new
   * call site that wants a different shape MUST update this allow-list (and
   * justify why the new shape always resolves to a UUID-shaped string or
   * null). Free-form string literals, recipient strings, template names, or
   * other arbitrary identifiers MUST NOT be passed here.
   */
  const ALLOWED_BOOKING_ID_EXPRESSIONS = [
    "bid",
    "legacyBid",
    "bookingId",
    "bookingId ?? null",
    "input.booking_id",
    "params.bookingId",
    "params.bookingId ?? null",
    "event.bookingId",
    "row.booking_id",
    "ev.bookingId",
    "ev.bookingId ?? null",
    "ctx.bookingId",
    "null",
    /** Per-call expressions used in current code; review on add. */
    "bookingIdForSmsLog(params.deliveryLog, params.context)",
  ];

  function listFiles(dir: string, acc: string[] = []): string[] {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "__tests__" || entry.name === "node_modules" || entry.name.startsWith(".")) continue;
        listFiles(full, acc);
      } else if (entry.isFile() && (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx"))) {
        acc.push(full);
      }
    }
    return acc;
  }

  const scanRoots = [
    path.join(webRoot, "lib/email"),
    path.join(webRoot, "lib/notifications"),
    path.join(webRoot, "lib/templates"),
  ];
  const allFiles = scanRoots.flatMap((d) => listFiles(d));

  /**
   * Walk each `writeNotificationLog({` opening, find the `booking_id:` key,
   * then read the value expression up to the next top-level comma — treating
   * `(...)`, `[...]`, and `{...}` groups as opaque so calls like
   * `bookingIdForSmsLog(a, b)` are kept intact instead of being split at
   * their internal comma.
   */
  function extractBookingIdExprs(src: string): string[] {
    const out: string[] = [];
    const opener = /writeNotificationLog\s*\(\s*\{/g;
    let m: RegExpExecArray | null;
    while ((m = opener.exec(src))) {
      const startIdx = m.index + m[0].length;
      const keyRe = /\bbooking_id\s*:\s*/g;
      keyRe.lastIndex = startIdx;
      const km = keyRe.exec(src);
      if (!km) continue;
      let i = km.index + km[0].length;
      let depth = 0;
      const valueStart = i;
      while (i < src.length) {
        const c = src[i]!;
        if (depth === 0 && (c === "," || c === "\n" && src.slice(valueStart, i).trim().endsWith("}"))) {
          // Top-level value terminator: comma OR newline that closes the
          // object (e.g. `booking_id: null }` on its own line).
          if (c === ",") break;
        }
        if (c === "(" || c === "[" || c === "{") depth += 1;
        else if (c === ")" || c === "]" || c === "}") {
          if (depth === 0) break; // closing the object literal
          depth -= 1;
        }
        i += 1;
      }
      const expr = src.slice(valueStart, i).trim().replace(/,$/, "").trim();
      if (expr.length > 0) out.push(expr);
    }
    return out;
  }

  const collected: { file: string; expr: string }[] = [];
  for (const file of allFiles) {
    const src = readFileSync(file, "utf8");
    for (const expr of extractBookingIdExprs(src)) {
      collected.push({ file: path.relative(webRoot, file), expr });
    }
  }

  it("at least one writer call site exists (sanity — the audit is meaningful)", () => {
    expect(collected.length).toBeGreaterThan(0);
  });

  it("every booking_id: <expr> resolves from an approved UUID-or-null source", () => {
    const violations: string[] = [];
    for (const c of collected) {
      if (!ALLOWED_BOOKING_ID_EXPRESSIONS.includes(c.expr)) {
        violations.push(`${c.file} :: booking_id: ${c.expr}`);
      }
    }
    expect(
      violations,
      `Unrecognised booking_id expressions found. Either rename the local to one of [${ALLOWED_BOOKING_ID_EXPRESSIONS.join(", ")}] or update ALLOWED_BOOKING_ID_EXPRESSIONS in this test with a justification of why the new expression always yields a UUID-shaped string or null.`,
    ).toEqual([]);
  });

  it("no caller passes the recipient or a template_key in place of booking_id (common bug shape)", () => {
    const suspicious = collected.filter(
      (c) => /recipient/i.test(c.expr) || /template/i.test(c.expr) || /email/i.test(c.expr),
    );
    expect(suspicious, "booking_id should never be a recipient / template / email reference").toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Contract A — Migration content
// ---------------------------------------------------------------------------
describe("M-20 supabase/migrations/20260947 — content invariants", () => {
  const { sql, resolved } = readRepositoryMigration(
    "20260947_m20_notification_logs_booking_id_uuid_chk.sql",
  );
  const sqlCode = sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");
  const sqlCodeLower = sqlCode.toLowerCase();

  it("migration file exists and is non-empty", () => {
    expect(sql.length).toBeGreaterThan(0);
    expect(resolved.absolutePath).toBeTruthy();
    expect(["active", "legacy"]).toContain(resolved.kind);
  });

  it("DROPs the constraint IF EXISTS first so the migration is idempotent", () => {
    expect(sqlCode).toMatch(
      /alter\s+table\s+public\.notification_logs\s+drop\s+constraint\s+if\s+exists\s+notification_logs_booking_id_uuid_or_null_chk\s*;/i,
    );
  });

  it("ADDs the CHECK constraint with the canonical UUID regex AND `NOT VALID` (audit-history preserved)", () => {
    expect(sqlCode).toMatch(
      /alter\s+table\s+public\.notification_logs\s+add\s+constraint\s+notification_logs_booking_id_uuid_or_null_chk\s+check\s*\(\s*booking_id\s+is\s+null\s+or\s+booking_id\s*~\s*'\^\[0-9a-fA-F\]\{8\}-\[0-9a-fA-F\]\{4\}-\[0-9a-fA-F\]\{4\}-\[0-9a-fA-F\]\{4\}-\[0-9a-fA-F\]\{12\}\$'\s*\)\s+not\s+valid\s*;/i,
    );
  });

  it("DROP appears before ADD (idempotent re-run pattern, mirrors bookingsPaymentMethodChkConstraint precedent)", () => {
    const dropIdx = sqlCodeLower.indexOf("drop constraint if exists notification_logs_booking_id_uuid_or_null_chk");
    const addIdx = sqlCodeLower.indexOf("add constraint notification_logs_booking_id_uuid_or_null_chk");
    expect(dropIdx).toBeGreaterThan(-1);
    expect(addIdx).toBeGreaterThan(dropIdx);
  });

  it("documents the M-20 contract via COMMENT ON CONSTRAINT", () => {
    expect(sqlCode).toMatch(
      /comment\s+on\s+constraint\s+notification_logs_booking_id_uuid_or_null_chk\s+on\s+public\.notification_logs\s+is/i,
    );
  });

  it("touches ONLY public.notification_logs (no scope creep into bookings, payouts, or other audit tables)", () => {
    const touched = Array.from(
      sqlCodeLower.matchAll(
        /\b(?:alter\s+table|insert\s+into|update|delete\s+from|truncate(?:\s+table)?)\s+(public\.[a-z_][a-z0-9_]*)/g,
      ),
    ).map((m) => m[1]);
    expect(touched.length).toBeGreaterThan(0);
    for (const t of touched) {
      expect(t).toBe("public.notification_logs");
    }
  });

  it("does NOT delete, truncate, or drop any data (audit history preservation)", () => {
    expect(sqlCodeLower).not.toMatch(/\bdelete\s+from\b/);
    expect(sqlCodeLower).not.toMatch(/\btruncate\b/);
    expect(sqlCodeLower).not.toMatch(/\bdrop\s+table\b/);
    expect(sqlCodeLower).not.toMatch(/\bdrop\s+column\b/);
    // The only DROP allowed is the constraint DROP IF EXISTS for idempotency.
    const drops = Array.from(sqlCodeLower.matchAll(/\bdrop\s+(?:table|column|function|trigger|policy|index|constraint)[^;]*?;/g));
    for (const m of drops) {
      expect(m[0]).toMatch(/drop\s+constraint\s+if\s+exists\s+notification_logs_booking_id_uuid_or_null_chk/);
    }
  });

  it("does NOT add a foreign key (FK requires UUID column type — see migration prose for why this is deferred)", () => {
    expect(sqlCodeLower).not.toMatch(/\bforeign\s+key\b/);
    expect(sqlCodeLower).not.toMatch(/\breferences\s+public\.bookings\b/);
    expect(sqlCodeLower).not.toMatch(/\bon\s+delete\s+(?:cascade|set\s+null|set\s+default|restrict|no\s+action)\b/);
  });

  it("does NOT change booking_id's column type (existing TEXT readers remain valid)", () => {
    expect(sqlCodeLower).not.toMatch(/\balter\s+column\s+booking_id\s+type\b/);
    expect(sqlCodeLower).not.toMatch(/\busing\s+booking_id::uuid\b/);
  });

  it("does NOT introduce any UPDATE that mutates existing booking_id values (audit trace preserved)", () => {
    expect(sqlCodeLower).not.toMatch(/\bupdate\s+public\.notification_logs\s+set\s+booking_id\b/);
  });

  it("does NOT introduce functions, triggers, policies, indexes, grants, or RLS toggles", () => {
    expect(sqlCodeLower).not.toMatch(/\bcreate\s+(or\s+replace\s+)?function\b/);
    expect(sqlCodeLower).not.toMatch(/\bcreate\s+trigger\b/);
    expect(sqlCodeLower).not.toMatch(/\bcreate\s+policy\b/);
    expect(sqlCodeLower).not.toMatch(/\bcreate\s+index\b/);
    expect(sqlCodeLower).not.toMatch(/\bgrant\b/);
    expect(sqlCodeLower).not.toMatch(/\brevoke\b/);
    expect(sqlCodeLower).not.toMatch(/\benable\s+row\s+level\s+security\b/);
  });
});

// ---------------------------------------------------------------------------
// Contract D — Writer source pins the regex + warn channel
// ---------------------------------------------------------------------------
describe("M-20 writer source contract: notificationLogWrite.ts mirrors the SQL constraint", () => {
  const writerSrc = readFileSync(writerPath, "utf8");

  it("declares the canonical UUID regex constant (mirrors the SQL CHECK predicate)", () => {
    expect(writerSrc).toMatch(/M20_BOOKING_ID_UUID_RE/);
    expect(writerSrc).toMatch(
      /\/\^\[0-9a-fA-F\]\{8\}-\[0-9a-fA-F\]\{4\}-\[0-9a-fA-F\]\{4\}-\[0-9a-fA-F\]\{4\}-\[0-9a-fA-F\]\{12\}\$\//,
    );
  });

  it("emits warn-level reportOperationalIssue with a stable sentinel when normalising garbage", () => {
    expect(writerSrc).toMatch(/non_uuid_booking_id_normalized_to_null/);
    expect(writerSrc).toMatch(/reportOperationalIssue\s*\(\s*[\s\S]*?["']warn["']/);
  });

  it("INSERT row uses the normalised booking_id (not the raw input) — DB sees only UUID-or-null", () => {
    expect(writerSrc).toMatch(/booking_id:\s*normalizedBookingId/);
  });

  it("normalisation is best-effort and DOES NOT throw (insert proceeds with null booking_id when garbage is rejected)", () => {
    // The fact that the writer body has no `throw` for the normalisation
    // branch is enough; the runtime tests above cover the resolved-without-
    // throwing behaviour. This test is the static guard so the future
    // refactor cannot quietly add a `throw` here.
    const normalisationBlock = writerSrc.match(
      /M-20: normalise[\s\S]*?const row = \{/,
    );
    expect(normalisationBlock, "M-20 normalisation block must exist contiguously above the row build").not.toBeNull();
    if (normalisationBlock) {
      expect(normalisationBlock[0]).not.toMatch(/\bthrow\b/);
    }
  });
});

// ---------------------------------------------------------------------------
// Contract E — Read paths still treat booking_id as TEXT-comparable
// ---------------------------------------------------------------------------
describe("M-20 read paths still query notification_logs.booking_id as TEXT", () => {
  it("admin notification-logs route still selects booking_id and routes booking_id filtering through the shared helper", () => {
    const src = readFileSync(path.join(webRoot, "app/api/admin/notification-logs/route.ts"), "utf8");
    expect(src).toMatch(/from\(\s*["']notification_logs["']\s*\)/);
    expect(src).toMatch(/booking_id/);
    expect(src).toMatch(/applyOfficeNotificationLogFilters/);
  });

  it("notifyCleanerBookingPaid cooldown probe still keys on (booking_id, template_key, channel, status, created_at)", () => {
    const src = readFileSync(path.join(webRoot, "lib/notifications/notifyCleanerBookingPaid.ts"), "utf8");
    expect(src).toMatch(/from\(\s*["']notification_logs["']\s*\)/);
    expect(src).toMatch(/\.eq\(\s*["']booking_id["']/);
    expect(src).toMatch(/\.eq\(\s*["']template_key["']/);
    expect(src).toMatch(/\.eq\(\s*["']channel["']/);
    expect(src).toMatch(/\.eq\(\s*["']status["']/);
  });

  it("admin retry route still SELECTs booking_id from notification_logs by id", () => {
    const src = readFileSync(path.join(webRoot, "app/api/admin/notifications/retry/route.ts"), "utf8");
    expect(src).toMatch(/from\(\s*["']notification_logs["']\s*\)/);
    expect(src).toMatch(/booking_id/);
  });
});
