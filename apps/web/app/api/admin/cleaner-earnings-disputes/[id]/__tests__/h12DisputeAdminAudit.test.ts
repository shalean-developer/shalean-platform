import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

vi.mock("@/lib/auth/requireAdminApi", () => ({
  requireAdminApi: vi.fn(),
}));
vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: vi.fn(),
}));
vi.mock("@/lib/admin/logAdminEarningsAction", () => ({
  logAdminEarningsAction: vi.fn(async () => undefined),
}));

import { PATCH } from "@/app/api/admin/cleaner-earnings-disputes/[id]/route";
import { logAdminEarningsAction } from "@/lib/admin/logAdminEarningsAction";
import { requireAdminApi } from "@/lib/auth/requireAdminApi";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const ADMIN_ID = "00000000-0000-4000-8000-0000000000aa";
const ADMIN_EMAIL = "ops@shalean.test";
const DISPUTE_ID = "00000000-0000-4000-8000-000000000d11";
const CLEANER_ID = "00000000-0000-4000-8000-000000000c11";
const BOOKING_ID = "00000000-0000-4000-8000-000000000b11";
const OTHER_ADMIN_ID = "00000000-0000-4000-8000-0000000000bb";

type ExistingRow = {
  id?: string;
  cleaner_id?: string;
  booking_id?: string;
  status?: string;
  reviewed_by?: string | null;
  reviewed_by_email?: string | null;
  reviewed_at?: string | null;
};

type Captured = {
  selectedColumns: string[];
  updatePatches: Array<Record<string, unknown>>;
  adjustmentInserts: Array<Record<string, unknown>>;
};

function makeAdmin(existing: ExistingRow | null, overrides: { updateError?: string; insertError?: string } = {}) {
  const captured: Captured = {
    selectedColumns: [],
    updatePatches: [],
    adjustmentInserts: [],
  };

  const admin = {
    from: vi.fn((table: string) => {
      if (table === "cleaner_earnings_disputes") {
        return {
          select: vi.fn((cols: string) => {
            captured.selectedColumns.push(cols);
            return {
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({
                  data: existing,
                  error: null,
                })),
              })),
            };
          }),
          update: vi.fn((patch: Record<string, unknown>) => {
            captured.updatePatches.push({ ...patch });
            return {
              eq: vi.fn(() => ({
                select: vi.fn(() => ({
                  maybeSingle: vi.fn(async () => ({
                    data: overrides.updateError
                      ? null
                      : { id: existing?.id, status: patch.status, ...patch },
                    error: overrides.updateError ? { message: overrides.updateError } : null,
                  })),
                })),
              })),
            };
          }),
        };
      }
      if (table === "cleaner_earnings_adjustments") {
        return {
          insert: vi.fn(async (row: Record<string, unknown>) => {
            captured.adjustmentInserts.push({ ...row });
            return { error: overrides.insertError ? { message: overrides.insertError } : null };
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    }),
  };

  return { admin, captured };
}

function patchRequest(body: unknown) {
  return new Request(`http://localhost/api/admin/cleaner-earnings-disputes/${DISPUTE_ID}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: "Bearer test" },
    body: JSON.stringify(body),
  });
}

function paramsCtx() {
  return { params: Promise.resolve({ id: DISPUTE_ID }) };
}

const baseExisting: ExistingRow = {
  id: DISPUTE_ID,
  cleaner_id: CLEANER_ID,
  booking_id: BOOKING_ID,
  status: "open",
  reviewed_by: null,
  reviewed_by_email: null,
  reviewed_at: null,
};

describe("H-12: dispute PATCH stamps admin identity + audit log", () => {
  beforeEach(() => {
    vi.mocked(requireAdminApi).mockReset();
    vi.mocked(getSupabaseAdmin).mockReset();
    vi.mocked(logAdminEarningsAction).mockReset();
    vi.mocked(logAdminEarningsAction).mockResolvedValue(undefined);
  });

  it("reviewing: stamps reviewed_by/email/at and logs dispute_review", async () => {
    vi.mocked(requireAdminApi).mockResolvedValue({ ok: true, userId: ADMIN_ID, email: ADMIN_EMAIL });
    const { admin, captured } = makeAdmin(baseExisting);
    vi.mocked(getSupabaseAdmin).mockReturnValue(admin as never);

    const res = await PATCH(patchRequest({ status: "reviewing" }), paramsCtx());

    expect(res.status).toBe(200);
    expect(captured.updatePatches).toHaveLength(1);
    const patch = captured.updatePatches[0]!;
    expect(patch.status).toBe("reviewing");
    expect(patch.reviewed_by).toBe(ADMIN_ID);
    expect(patch.reviewed_by_email).toBe(ADMIN_EMAIL);
    expect(typeof patch.reviewed_at).toBe("string");
    // reviewing must NOT close the dispute
    expect(patch.resolved_at).toBeNull();
    expect(patch.resolved_by).toBeUndefined();
    expect(patch.resolved_by_email).toBeUndefined();

    expect(logAdminEarningsAction).toHaveBeenCalledTimes(1);
    expect(logAdminEarningsAction).toHaveBeenCalledWith(
      admin,
      expect.objectContaining({ bookingId: BOOKING_ID, action: "dispute_review", adminUserId: ADMIN_ID }),
    );
  });

  it("resolved: stamps reviewed_*, resolved_*, resolved_at, admin_response, and logs dispute_resolve", async () => {
    vi.mocked(requireAdminApi).mockResolvedValue({ ok: true, userId: ADMIN_ID, email: ADMIN_EMAIL });
    const { admin, captured } = makeAdmin(baseExisting);
    vi.mocked(getSupabaseAdmin).mockReturnValue(admin as never);

    const res = await PATCH(
      patchRequest({ status: "resolved", admin_response: "fixed via shadow rerun" }),
      paramsCtx(),
    );

    expect(res.status).toBe(200);
    const patch = captured.updatePatches[0]!;
    expect(patch.status).toBe("resolved");
    expect(patch.admin_response).toBe("fixed via shadow rerun");
    expect(patch.resolved_by).toBe(ADMIN_ID);
    expect(patch.resolved_by_email).toBe(ADMIN_EMAIL);
    expect(typeof patch.resolved_at).toBe("string");
    // also stamps reviewer (admin skipped reviewing → resolved straight away)
    expect(patch.reviewed_by).toBe(ADMIN_ID);
    expect(patch.reviewed_by_email).toBe(ADMIN_EMAIL);
    expect(typeof patch.reviewed_at).toBe("string");

    expect(logAdminEarningsAction).toHaveBeenCalledWith(
      admin,
      expect.objectContaining({ action: "dispute_resolve" }),
    );
  });

  it("rejected: stamps resolved_* and logs dispute_reject", async () => {
    vi.mocked(requireAdminApi).mockResolvedValue({ ok: true, userId: ADMIN_ID, email: ADMIN_EMAIL });
    const { admin, captured } = makeAdmin(baseExisting);
    vi.mocked(getSupabaseAdmin).mockReturnValue(admin as never);

    const res = await PATCH(
      patchRequest({ status: "rejected", admin_response: "duplicate of #123" }),
      paramsCtx(),
    );

    expect(res.status).toBe(200);
    const patch = captured.updatePatches[0]!;
    expect(patch.status).toBe("rejected");
    expect(patch.resolved_by).toBe(ADMIN_ID);
    expect(typeof patch.resolved_at).toBe("string");

    expect(logAdminEarningsAction).toHaveBeenCalledWith(
      admin,
      expect.objectContaining({ action: "dispute_reject" }),
    );
  });

  it("preserves first-reviewer identity when a different admin closes a dispute already in review", async () => {
    const firstReviewerAt = "2026-05-10T10:00:00.000Z";
    vi.mocked(requireAdminApi).mockResolvedValue({ ok: true, userId: ADMIN_ID, email: ADMIN_EMAIL });
    const existing: ExistingRow = {
      ...baseExisting,
      status: "reviewing",
      reviewed_by: OTHER_ADMIN_ID,
      reviewed_by_email: "first@shalean.test",
      reviewed_at: firstReviewerAt,
    };
    const { admin, captured } = makeAdmin(existing);
    vi.mocked(getSupabaseAdmin).mockReturnValue(admin as never);

    const res = await PATCH(
      patchRequest({ status: "resolved", admin_response: "closed by ops manager" }),
      paramsCtx(),
    );

    expect(res.status).toBe(200);
    const patch = captured.updatePatches[0]!;
    // resolver is the new admin
    expect(patch.resolved_by).toBe(ADMIN_ID);
    // first-reviewer audit MUST NOT be overwritten
    expect(patch.reviewed_by).toBeUndefined();
    expect(patch.reviewed_by_email).toBeUndefined();
    expect(patch.reviewed_at).toBeUndefined();
  });

  it("adjustment insert stamps created_by + created_by_email", async () => {
    vi.mocked(requireAdminApi).mockResolvedValue({ ok: true, userId: ADMIN_ID, email: ADMIN_EMAIL });
    const { admin, captured } = makeAdmin(baseExisting);
    vi.mocked(getSupabaseAdmin).mockReturnValue(admin as never);

    const res = await PATCH(
      patchRequest({
        status: "resolved",
        admin_response: "approved partial credit",
        adjustment_amount_cents: 5000,
        adjustment_reason: "Goodwill credit for late assignment",
      }),
      paramsCtx(),
    );

    expect(res.status).toBe(200);
    expect(captured.adjustmentInserts).toHaveLength(1);
    const insert = captured.adjustmentInserts[0]!;
    expect(insert.cleaner_id).toBe(CLEANER_ID);
    expect(insert.booking_id).toBe(BOOKING_ID);
    expect(insert.amount_cents).toBe(5000);
    expect(insert.dispute_id).toBe(DISPUTE_ID);
    expect(insert.created_by).toBe(ADMIN_ID);
    expect(insert.created_by_email).toBe(ADMIN_EMAIL);
  });

  it("anonymous request never reaches PATCH update + never writes audit fields", async () => {
    vi.mocked(requireAdminApi).mockResolvedValue({ ok: false, status: 401, error: "Missing authorization." });
    const { admin, captured } = makeAdmin(baseExisting);
    vi.mocked(getSupabaseAdmin).mockReturnValue(admin as never);

    const res = await PATCH(patchRequest({ status: "reviewing" }), paramsCtx());

    expect(res.status).toBe(401);
    expect(captured.updatePatches).toHaveLength(0);
    expect(captured.adjustmentInserts).toHaveLength(0);
    expect(logAdminEarningsAction).not.toHaveBeenCalled();
  });

  it("non-admin (403) does not write audit fields", async () => {
    vi.mocked(requireAdminApi).mockResolvedValue({ ok: false, status: 403, error: "Forbidden." });
    const { admin, captured } = makeAdmin(baseExisting);
    vi.mocked(getSupabaseAdmin).mockReturnValue(admin as never);

    const res = await PATCH(patchRequest({ status: "resolved", admin_response: "x" }), paramsCtx());

    expect(res.status).toBe(403);
    expect(captured.updatePatches).toHaveLength(0);
    expect(logAdminEarningsAction).not.toHaveBeenCalled();
  });

  it("does not log when booking_id on existing row is invalid (best-effort, never blocks success)", async () => {
    vi.mocked(requireAdminApi).mockResolvedValue({ ok: true, userId: ADMIN_ID, email: ADMIN_EMAIL });
    const existing: ExistingRow = { ...baseExisting, booking_id: "not-a-uuid" };
    const { admin, captured } = makeAdmin(existing);
    vi.mocked(getSupabaseAdmin).mockReturnValue(admin as never);

    const res = await PATCH(patchRequest({ status: "reviewing" }), paramsCtx());

    expect(res.status).toBe(200);
    // PATCH still succeeded
    expect(captured.updatePatches).toHaveLength(1);
    expect(logAdminEarningsAction).not.toHaveBeenCalled();
  });

  it("preserves existing dispute closure semantics: closed disputes return 409 and skip all audit writes", async () => {
    vi.mocked(requireAdminApi).mockResolvedValue({ ok: true, userId: ADMIN_ID, email: ADMIN_EMAIL });
    const existing: ExistingRow = { ...baseExisting, status: "resolved" };
    const { admin, captured } = makeAdmin(existing);
    vi.mocked(getSupabaseAdmin).mockReturnValue(admin as never);

    const res = await PATCH(patchRequest({ status: "rejected", admin_response: "x" }), paramsCtx());

    expect(res.status).toBe(409);
    expect(captured.updatePatches).toHaveLength(0);
    expect(logAdminEarningsAction).not.toHaveBeenCalled();
  });

  it("preserves existing 400 validation: missing admin_response on resolve still rejects (audit untouched)", async () => {
    vi.mocked(requireAdminApi).mockResolvedValue({ ok: true, userId: ADMIN_ID, email: ADMIN_EMAIL });
    const { admin, captured } = makeAdmin(baseExisting);
    vi.mocked(getSupabaseAdmin).mockReturnValue(admin as never);

    const res = await PATCH(patchRequest({ status: "resolved" }), paramsCtx());

    expect(res.status).toBe(400);
    expect(captured.updatePatches).toHaveLength(0);
    expect(logAdminEarningsAction).not.toHaveBeenCalled();
  });

  it("SELECT of existing dispute requests reviewed_by/email/at columns (so first-reviewer preservation can work)", async () => {
    vi.mocked(requireAdminApi).mockResolvedValue({ ok: true, userId: ADMIN_ID, email: ADMIN_EMAIL });
    const { admin, captured } = makeAdmin(baseExisting);
    vi.mocked(getSupabaseAdmin).mockReturnValue(admin as never);

    await PATCH(patchRequest({ status: "reviewing" }), paramsCtx());

    expect(captured.selectedColumns[0]).toContain("reviewed_by");
    expect(captured.selectedColumns[0]).toContain("reviewed_by_email");
    expect(captured.selectedColumns[0]).toContain("reviewed_at");
  });
});

describe("H-12: source content guards", () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  // here = apps/web/app/api/admin/cleaner-earnings-disputes/[id]/__tests__ → 8 levels up to repo root.
  const repoRoot = path.resolve(here, "..", "..", "..", "..", "..", "..", "..", "..");

  function readFile(rel: string): string {
    return readFileSync(path.join(repoRoot, rel), "utf8");
  }

  it("migration 20260940 adds the expected admin audit columns + extends action CHECK", () => {
    const sql = readFile("supabase/migrations/20260940_h12_dispute_admin_audit_fields.sql");
    // disputes columns
    expect(sql).toMatch(/cleaner_earnings_disputes[\s\S]*add column if not exists reviewed_by uuid references auth\.users/i);
    expect(sql).toMatch(/cleaner_earnings_disputes[\s\S]*add column if not exists reviewed_by_email text/i);
    expect(sql).toMatch(/cleaner_earnings_disputes[\s\S]*add column if not exists reviewed_at timestamptz/i);
    expect(sql).toMatch(/cleaner_earnings_disputes[\s\S]*add column if not exists resolved_by uuid references auth\.users/i);
    expect(sql).toMatch(/cleaner_earnings_disputes[\s\S]*add column if not exists resolved_by_email text/i);
    // adjustments columns
    expect(sql).toMatch(/cleaner_earnings_adjustments[\s\S]*add column if not exists created_by uuid references auth\.users/i);
    expect(sql).toMatch(/cleaner_earnings_adjustments[\s\S]*add column if not exists created_by_email text/i);
    // CHECK extension
    expect(sql).toMatch(/drop constraint if exists admin_earnings_actions_action_check/i);
    expect(sql).toMatch(/check\s*\(action in \('fix', 'reset', 'dispute_review', 'dispute_resolve', 'dispute_reject'\)\)/i);
    // FK ON DELETE SET NULL on every new uuid audit column (so audit survives admin auth.user deletion)
    const onDeleteSetNullCount = (sql.match(/on delete set null/gi) ?? []).length;
    expect(onDeleteSetNullCount).toBeGreaterThanOrEqual(3);
  });

  it("migration is idempotent (uses ADD COLUMN IF NOT EXISTS + DROP CONSTRAINT IF EXISTS)", () => {
    const sql = readFile("supabase/migrations/20260940_h12_dispute_admin_audit_fields.sql");
    const ifNotExistsCount = (sql.match(/add column if not exists/gi) ?? []).length;
    expect(ifNotExistsCount).toBeGreaterThanOrEqual(7);
    expect(sql).toMatch(/drop constraint if exists/i);
  });

  it("migration does not modify payout formulas or cleaner-visible behavior", () => {
    const stripComments = (s: string) => s.replace(/--[^\n]*/g, "").replace(/\/\*[^]*?\*\//g, "");
    const sql = stripComments(readFile("supabase/migrations/20260940_h12_dispute_admin_audit_fields.sql"));
    expect(/\bcleaner_payout_cents\b/i.test(sql)).toBe(false);
    expect(/\bdisplay_earnings_cents\b/i.test(sql)).toBe(false);
    expect(/\bamount_paid_cents\b/i.test(sql)).toBe(false);
    expect(/\bcleaner_earnings\b(?!_disputes|_adjustments|_disbursements|_idx|_uidx|_actions)/i.test(sql)).toBe(false);
    expect(/drop policy/i.test(sql)).toBe(false);
    expect(/alter\s+table[^;]*disable\s+row\s+level\s+security/i.test(sql)).toBe(false);
    // does not change the dispute status CHECK (open/reviewing/resolved/rejected)
    expect(/cleaner_earnings_disputes_status_check/i.test(sql)).toBe(false);
  });

  it("logAdminEarningsAction kind type covers the dispute lifecycle actions", () => {
    const src = readFile("apps/web/lib/admin/logAdminEarningsAction.ts");
    expect(src).toMatch(/"dispute_review"/);
    expect(src).toMatch(/"dispute_resolve"/);
    expect(src).toMatch(/"dispute_reject"/);
  });

  it("dispute PATCH route imports logAdminEarningsAction and uses requireAdminApi-supplied identity", () => {
    const src = readFile("apps/web/app/api/admin/cleaner-earnings-disputes/[id]/route.ts");
    expect(src).toMatch(/from\s+"@\/lib\/admin\/logAdminEarningsAction"/);
    expect(src).toMatch(/auth\.userId/);
    expect(src).toMatch(/auth\.email/);
    expect(src).toMatch(/logAdminEarningsAction\(/);
    // does not silently overwrite first-reviewer
    expect(src).toMatch(/!row\.reviewed_by/);
  });
});
