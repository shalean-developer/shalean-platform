import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: vi.fn(),
}));

vi.mock("@/lib/cleaner/session", () => ({
  resolveCleanerIdFromRequest: vi.fn(),
}));

vi.mock("@/lib/cleaner/syncCleanerStatus", () => ({
  syncCleanerBusyFromBookings: vi.fn(async () => {}),
}));

vi.mock("@/lib/logging/systemLog", () => ({
  logSystemEvent: vi.fn(async () => {}),
  reportOperationalIssue: vi.fn(async () => {}),
}));

import { POST } from "../[id]/route";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { resolveCleanerIdFromRequest } from "@/lib/cleaner/session";
import { syncCleanerBusyFromBookings } from "@/lib/cleaner/syncCleanerStatus";

function adminForTeamAccept() {
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
                    cleaner_id: null,
                    team_id: "team-a",
                    is_team_job: true,
                    status: "assigned",
                    assignment_attempts: 0,
                    cleaner_response_status: null,
                    en_route_at: null,
                  },
                  error: null,
                }),
            }),
          }),
          update: () => ({
            eq: () => ({
              in: () => ({
                select: () => Promise.resolve({ data: [{ id: "b1" }], error: null }),
              }),
            }),
          }),
        };
      }
      if (table === "team_members") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: () => Promise.resolve({ data: { team_id: "team-a" }, error: null }),
              }),
            }),
          }),
        };
      }
      if (table === "booking_cleaners") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: () => Promise.resolve({ data: { id: "bc-1" }, error: null }),
              }),
            }),
          }),
        };
      }
      if (table === "cleaner_job_lifecycle_idempotency") {
        return {
          insert: () => Promise.resolve({ error: null }),
          delete: () => ({
            eq: () => Promise.resolve({ error: null }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
}

function adminForConfirmedSoloAccept() {
  return {
    from(table: string) {
      if (table === "bookings") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () =>
                Promise.resolve({
                  data: {
                    id: "b2",
                    cleaner_id: "c-solo",
                    team_id: null,
                    is_team_job: false,
                    status: "confirmed",
                    assignment_attempts: 0,
                    cleaner_response_status: "pending",
                    accepted_at: null,
                    dispatch_status: "assigned",
                    en_route_at: null,
                  },
                  error: null,
                }),
            }),
          }),
          update: () => ({
            eq: () => ({
              in: () => ({
                select: () => Promise.resolve({ data: [{ id: "b2" }], error: null }),
              }),
            }),
          }),
        };
      }
      if (table === "cleaner_job_lifecycle_idempotency") {
        return {
          insert: () => Promise.resolve({ error: null }),
          delete: () => ({
            eq: () => Promise.resolve({ error: null }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
}

describe("POST /api/cleaner/jobs/[id] — team job Confirm availability (accept)", () => {
  beforeEach(() => {
    vi.mocked(getSupabaseAdmin).mockReturnValue(adminForTeamAccept() as never);
    vi.mocked(resolveCleanerIdFromRequest).mockResolvedValue({
      cleanerId: "cleaner-1",
      status: 200,
    } as never);
    vi.mocked(syncCleanerBusyFromBookings).mockClear();
  });

  it("returns 200 and syncs busy when assigned team job accepts", async () => {
    const res = await POST(
      new Request("http://localhost/api/cleaner/jobs/b1", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-cleaner-id": "cleaner-1" },
        body: JSON.stringify({ action: "accept", idempotency_key: "test-key-accept-b1-1" }),
      }),
      { params: Promise.resolve({ id: "b1" }) },
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok?: boolean; status?: string; cleaner_response_status?: string };
    expect(json).toMatchObject({ ok: true, status: "assigned", cleaner_response_status: "accepted" });
    expect(syncCleanerBusyFromBookings).toHaveBeenCalledWith(expect.anything(), "cleaner-1");
  });

  it("returns 200 when legacy status is confirmed (solo) — accept lock matches confirmed rows", async () => {
    vi.mocked(getSupabaseAdmin).mockReturnValue(adminForConfirmedSoloAccept() as never);
    vi.mocked(resolveCleanerIdFromRequest).mockResolvedValue({
      cleanerId: "c-solo",
      status: 200,
    } as never);
    const res = await POST(
      new Request("http://localhost/api/cleaner/jobs/b2", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-cleaner-id": "c-solo" },
        body: JSON.stringify({ action: "accept", idempotency_key: "test-key-accept-confirmed-b2-1" }),
      }),
      { params: Promise.resolve({ id: "b2" }) },
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok?: boolean; cleaner_response_status?: string };
    expect(json).toMatchObject({ ok: true, cleaner_response_status: "accepted" });
  });
});
