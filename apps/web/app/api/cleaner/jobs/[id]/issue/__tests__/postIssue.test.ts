import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: vi.fn(),
}));

vi.mock("@/lib/cleaner/session", () => ({
  resolveCleanerFromRequest: vi.fn(),
}));

vi.mock("@/lib/cleaner/cleanerBookingAccess", () => ({
  cleanerHasBookingAccess: vi.fn(),
}));

vi.mock("@/lib/logging/systemLog", () => ({
  logSystemEvent: vi.fn(async () => {}),
}));

vi.mock("@/lib/cleaner/notifyOpsCleanerIssueReport", () => ({
  notifyOpsOfCleanerIssueReport: vi.fn(async () => {}),
}));

import { POST } from "../route";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { resolveCleanerFromRequest } from "@/lib/cleaner/session";
import { cleanerHasBookingAccess } from "@/lib/cleaner/cleanerBookingAccess";
import { logSystemEvent } from "@/lib/logging/systemLog";

class IssueReportsSelectBuilder {
  private eqCalls = 0;
  select(_cols?: string) {
    return this;
  }
  eq(_col?: string, _val?: string) {
    this.eqCalls++;
    return this;
  }
  gte(_col?: string, _val?: string) {
    return this;
  }
  order(_col?: string, _opts?: { ascending?: boolean }) {
    return this;
  }
  limit(n: number) {
    if (n === 1 && this.eqCalls === 3) {
      return {
        maybeSingle: () => Promise.resolve({ data: null, error: null }),
      };
    }
    if (n === 5 && this.eqCalls === 2) {
      return Promise.resolve({ data: [], error: null });
    }
    throw new Error(`unexpected issue report select limit=${n} eqCalls=${this.eqCalls}`);
  }
}

function adminChain() {
  return {
    from(table: string) {
      if (table === "bookings") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () =>
                Promise.resolve({
                  data: {
                    id: "b1",
                    cleaner_id: "c1",
                    team_id: null,
                    is_team_job: false,
                  },
                  error: null,
                }),
            }),
          }),
        };
      }
      if (table === "cleaner_job_issue_report_idempotency") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                eq: () => ({
                  gte: () => ({
                    maybeSingle: () => Promise.resolve({ data: null, error: null }),
                  }),
                }),
              }),
            }),
          }),
          insert: () => Promise.resolve({ error: null }),
        };
      }
      if (table === "cleaner_job_issue_reports") {
        return {
          select: () => new IssueReportsSelectBuilder(),
          insert: () => ({
            select: () => ({
              maybeSingle: () =>
                Promise.resolve({
                  data: { id: "rep-1" },
                  error: null,
                }),
            }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
}

describe("POST /api/cleaner/jobs/[id]/issue", () => {
  beforeEach(() => {
    vi.mocked(getSupabaseAdmin).mockReturnValue(adminChain() as never);
    vi.mocked(resolveCleanerFromRequest).mockResolvedValue({
      ok: true,
      cleaner: { id: "c1" },
      authUserId: "u1",
      authUser: null,
    });
    vi.mocked(cleanerHasBookingAccess).mockResolvedValue(true);
    vi.mocked(logSystemEvent).mockClear();
  });

  it("returns 400 for invalid reason_key", async () => {
    const res = await POST(
      new Request("http://localhost/api/cleaner/jobs/b1/issue", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer t" },
        body: JSON.stringify({ reason_key: "nope" }),
      }),
      { params: Promise.resolve({ id: "b1" }) },
    );
    expect(res.status).toBe(400);
  });

  it("returns 403 when cleaner cannot access booking", async () => {
    vi.mocked(cleanerHasBookingAccess).mockResolvedValue(false);
    const res = await POST(
      new Request("http://localhost/api/cleaner/jobs/b1/issue", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer t" },
        body: JSON.stringify({ reason_key: "gate_access" }),
      }),
      { params: Promise.resolve({ id: "b1" }) },
    );
    expect(res.status).toBe(403);
  });

  it("inserts report and returns ok", async () => {
    const res = await POST(
      new Request("http://localhost/api/cleaner/jobs/b1/issue", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer t" },
        body: JSON.stringify({ reason_key: "gate_access", detail: "  Gate code wrong  " }),
      }),
      { params: Promise.resolve({ id: "b1" }) },
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok?: boolean; reportId?: string };
    expect(json.ok).toBe(true);
    expect(json.reportId).toBe("rep-1");
    expect(vi.mocked(logSystemEvent)).toHaveBeenCalled();
  });
});
