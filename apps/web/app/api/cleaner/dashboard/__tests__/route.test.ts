import { afterEach, describe, expect, it, vi } from "vitest";
import type { CleanerBookingRow } from "@/lib/cleaner/cleanerBookingRow";
import { recurringAssignmentAcceptanceOverdue } from "@/lib/cleaner/cleanerAssignedOfferExpiry";

const fixture = vi.hoisted(() => ({ rows: [] as Record<string, unknown>[] }));
vi.mock("@/lib/cleaner/session", () => ({ resolveCleanerIdFromRequest: async () => ({ cleanerId: "cleaner-fixture" }) }));
vi.mock("@/lib/supabase/admin", () => ({ getSupabaseAdmin: () => ({
  from: () => { const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: { id: "cleaner-fixture" } }) }; return q; },
}) }));
vi.mock("@/lib/cleaner/cleanerBookingAccess", async (original) => ({
  ...await original<object>(), fetchCleanerVisibleBookingsMerged: async (_a: unknown, _c: string, params: {
    perBranchLimit: number; applyEachBranch: (q: unknown) => unknown;
  }) => {
    let fromDate = "";
    const q = { not: () => q, order: () => q, gte: (_column: string, date: string) => { fromDate = date; return q; } };
    params.applyEachBranch(q);
    return { data: fixture.rows.filter((r) => !fromDate || String(r.date) >= fromDate).slice(0, params.perBranchLimit), error: null };
  },
}));
vi.mock("@/lib/cleaner/pairedRosterMemberLifecycle", () => ({ augmentCleanerJobsWithViewerRosterContext: async (_a: unknown, rows: unknown[]) => rows }));
vi.mock("@/lib/cleaner/applyPreviewEarningsToCleanerJobRows", () => ({
  DEFAULT_CLEANER_JOB_EARNINGS_PREVIEW_CAP: 0,
  applyPreviewEarningsToCleanerJobRows: async (_a: unknown, args: { rows: unknown[] }) => args.rows,
}));
vi.mock("@/lib/cleaner/fetchViewerPayoutByBookingIds", () => ({ fetchViewerPayoutByBookingIds: async () => new Map() }));
vi.mock("@/lib/cleaner/cleanerPayoutInvariantLogging", () => ({ maybeLogStuckNullEarnings: vi.fn() }));
import { GET } from "../route";

afterEach(() => vi.useRealTimers());

describe("cleaner dashboard recurring assignment retention", () => {
  it.each([
    { is_recurring_generated: true }, { billing_type: "recurring_invoice" },
    { billing_type: "monthly_contract" }, { monthly_invoice_id: "invoice-fixture" },
  ])("returns an overdue assigned visit with its recurring signal %j", async (signal) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-19T08:45:00Z"));
    const pending = { date: "2026-10-19", time: "09:00", status: "assigned", cleaner_response_status: "pending", accepted_at: null };
    fixture.rows = [{ ...pending, id: "recurring", ...signal }, { ...pending, id: "one-off" }];
    const res = await GET(new Request("http://localhost/api/cleaner/dashboard"));
    expect(res.status).toBe(200);
    const body = await res.json() as { jobs: CleanerBookingRow[] };
    expect(body.jobs.map((j) => j.id)).toEqual(["recurring"]);
    expect(body.jobs[0]).toMatchObject({ ...signal, cleaner_response_status: "pending", accepted_at: null });
    expect(recurringAssignmentAcceptanceOverdue(body.jobs[0])).toBe(true);
    expect(body.jobs[0].acceptance_overdue_message).toContain("Acceptance overdue");
    expect(fixture.rows[0]).toMatchObject({ cleaner_response_status: "pending", accepted_at: null });
  });

  it("keeps today's and next scheduled work when 300 unresolved old assignments fill the history query", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-19T08:45:00Z"));
    const pending = { time: "09:00", status: "assigned", cleaner_response_status: "pending", accepted_at: null, is_recurring_generated: true };
    fixture.rows = [
      ...Array.from({ length: 300 }, (_, i) => ({ ...pending, id: `old-${i}`, date: "2026-10-01" })),
      { ...pending, id: "today", date: "2026-10-19" },
      { ...pending, id: "next", date: "2026-10-22" },
    ];
    const res = await GET(new Request("http://localhost/api/cleaner/dashboard"));
    const body = await res.json() as { jobs: CleanerBookingRow[] };
    expect(body.jobs.map((j) => j.id)).toEqual(expect.arrayContaining(["today", "next"]));
    expect(body.jobs.length).toBeLessThanOrEqual(12);
  });
});
