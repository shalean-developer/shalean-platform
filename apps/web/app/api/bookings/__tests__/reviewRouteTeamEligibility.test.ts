import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: vi.fn(),
}));

vi.mock("@/lib/reviews/reviewKpiServer", () => ({
  logReviewKpiEvent: vi.fn(),
}));

import { POST } from "@/app/api/bookings/review/route";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { logReviewKpiEvent } from "@/lib/reviews/reviewKpiServer";

/**
 * Production Readiness Audit H-8.
 *
 * Pre-fix `POST /api/bookings/review`:
 *   - Selected only `cleaner_id` (not `payout_owner_cleaner_id`).
 *   - Hard-rejected when `cleaner_id` was null, even on team-assigned
 *     bookings whose lead cleaner sat in `payout_owner_cleaner_id`.
 *   → Team-completed bookings were silently unreviewable forever.
 *
 * Post-fix contracts owned by this file:
 *   1. Single-cleaner submission still inserts with `cleaner_id` from
 *      `bookings.cleaner_id` (no behaviour change).
 *   2. Team-job submission (`is_team_job=true`, `cleaner_id=null`,
 *      `payout_owner_cleaner_id=<uuid>`) is accepted and writes
 *      `reviews.cleaner_id = payout_owner_cleaner_id` (lead cleaner).
 *   3. Bookings with neither id remain blocked (400, code
 *      `review_submit_requires_cleaner_id`).
 *   4. Anti-duplicate guard via DB unique `(booking_id)` returns 409 to
 *      the customer (`reviews_one_per_booking` constraint).
 *   5. Ownership: a different signed-in user attempting to review
 *      someone else's booking gets 403.
 *   6. The SELECT now includes `payout_owner_cleaner_id` so the
 *      eligibility evaluator can see it (regression guard against a
 *      future select-list regression that would silently drop the
 *      column and re-strand team-completed bookings).
 *   7. `reviews.cleaner_id` is NEVER null — DB has NOT NULL on that
 *      column; the route must hand it a UUID.
 */

const USER_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_USER_ID = "22222222-2222-4222-8222-222222222222";
const BOOKING_ID = "33333333-3333-4333-8333-333333333333";
const SOLO_CLEANER = "44444444-4444-4444-8444-444444444444";
const TEAM_LEAD = "55555555-5555-4555-8555-555555555555";

type MockBookingRow = {
  id: string;
  user_id: string | null;
  cleaner_id: string | null;
  payout_owner_cleaner_id: string | null;
  status: string;
  completed_at: string | null;
  is_team_job: boolean;
  team_id: string | null;
};

type CapturedReviewInsert = Record<string, unknown>;

function buildAdmin(opts: {
  bookingRow: MockBookingRow | null;
  insertError?: { code?: string; message: string } | null;
}): {
  admin: SupabaseClient;
  state: {
    bookingSelect: string | null;
    reviewInsert: CapturedReviewInsert | null;
  };
} {
  const state: { bookingSelect: string | null; reviewInsert: CapturedReviewInsert | null } = {
    bookingSelect: null,
    reviewInsert: null,
  };
  const admin = {
    from(table: string) {
      if (table === "bookings") {
        return {
          select(select: string) {
            state.bookingSelect = select;
            return {
              eq() {
                return {
                  async maybeSingle() {
                    return { data: opts.bookingRow, error: null };
                  },
                };
              },
            };
          },
        };
      }
      if (table === "reviews") {
        return {
          async insert(payload: CapturedReviewInsert) {
            state.reviewInsert = payload;
            if (opts.insertError) return { error: opts.insertError };
            return { error: null };
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  } as unknown as SupabaseClient;
  return { admin, state };
}

function buildPubAuth(userId: string | null) {
  return {
    auth: {
      async getUser() {
        if (!userId) return { data: { user: null }, error: { message: "invalid token" } };
        return { data: { user: { id: userId, email: "u@x.co" } }, error: null };
      },
    },
  } as unknown as SupabaseClient;
}

const createClientMock = vi.mocked(createClient);
const getSupabaseAdminMock = vi.mocked(getSupabaseAdmin);
const logReviewKpiMock = vi.mocked(logReviewKpiEvent);

function makeRequest(body: Record<string, unknown>, opts?: { token?: string }): Request {
  return new Request("http://test/api/bookings/review", {
    method: "POST",
    headers: {
      authorization: `Bearer ${opts?.token ?? "tok"}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/bookings/review (H-8 team-job reviewability)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://stub");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("(1) single-cleaner submission still inserts with bookings.cleaner_id (no behaviour change)", async () => {
    createClientMock.mockReturnValueOnce(buildPubAuth(USER_ID) as never);
    const { admin, state } = buildAdmin({
      bookingRow: {
        id: BOOKING_ID,
        user_id: USER_ID,
        cleaner_id: SOLO_CLEANER,
        payout_owner_cleaner_id: null,
        status: "completed",
        completed_at: "2026-04-01T10:00:00Z",
        is_team_job: false,
        team_id: null,
      },
    });
    getSupabaseAdminMock.mockReturnValue(admin as unknown as ReturnType<typeof getSupabaseAdmin>);

    const res = await POST(makeRequest({ bookingId: BOOKING_ID, rating: 5, comment: "great" }));
    expect(res.status).toBe(200);
    expect(state.reviewInsert).not.toBeNull();
    expect(state.reviewInsert).toMatchObject({
      booking_id: BOOKING_ID,
      user_id: USER_ID,
      cleaner_id: SOLO_CLEANER,
      rating: 5,
      comment: "great",
    });
    expect(logReviewKpiMock).toHaveBeenCalledWith(
      "review_submitted",
      expect.objectContaining({ booking_id: BOOKING_ID, rating: 5, source: "api_post" }),
    );
  });

  it("(2) team submission with cleaner_id=null + payout_owner_cleaner_id=<uuid> is accepted and writes the lead", async () => {
    createClientMock.mockReturnValueOnce(buildPubAuth(USER_ID) as never);
    const { admin, state } = buildAdmin({
      bookingRow: {
        id: BOOKING_ID,
        user_id: USER_ID,
        cleaner_id: null,
        payout_owner_cleaner_id: TEAM_LEAD,
        status: "completed",
        completed_at: "2026-04-01T10:00:00Z",
        is_team_job: true,
        team_id: "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa",
      },
    });
    getSupabaseAdminMock.mockReturnValue(admin as unknown as ReturnType<typeof getSupabaseAdmin>);

    const res = await POST(makeRequest({ bookingId: BOOKING_ID, rating: 4, comment: "team did well" }));
    expect(res.status).toBe(200);
    expect(state.reviewInsert).toMatchObject({
      booking_id: BOOKING_ID,
      cleaner_id: TEAM_LEAD,
      rating: 4,
    });
    expect(state.reviewInsert!.cleaner_id).not.toBeNull();
  });

  it("(3) bookings with neither cleaner_id nor payout_owner_cleaner_id stay blocked (400)", async () => {
    createClientMock.mockReturnValueOnce(buildPubAuth(USER_ID) as never);
    const { admin, state } = buildAdmin({
      bookingRow: {
        id: BOOKING_ID,
        user_id: USER_ID,
        cleaner_id: null,
        payout_owner_cleaner_id: null,
        status: "completed",
        completed_at: "2026-04-01T10:00:00Z",
        is_team_job: true,
        team_id: "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa",
      },
    });
    getSupabaseAdminMock.mockReturnValue(admin as unknown as ReturnType<typeof getSupabaseAdmin>);

    const res = await POST(makeRequest({ bookingId: BOOKING_ID, rating: 5 }));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error?: string; code?: string };
    expect(body.code).toBe("review_submit_requires_cleaner_id");
    expect(state.reviewInsert).toBeNull();
  });

  it("(4) duplicate review (DB 23505) surfaces 409 to the customer — anti-duplicate guard intact", async () => {
    createClientMock.mockReturnValueOnce(buildPubAuth(USER_ID) as never);
    const { admin } = buildAdmin({
      bookingRow: {
        id: BOOKING_ID,
        user_id: USER_ID,
        cleaner_id: SOLO_CLEANER,
        payout_owner_cleaner_id: null,
        status: "completed",
        completed_at: "2026-04-01T10:00:00Z",
        is_team_job: false,
        team_id: null,
      },
      insertError: { code: "23505", message: "duplicate" },
    });
    getSupabaseAdminMock.mockReturnValue(admin as unknown as ReturnType<typeof getSupabaseAdmin>);

    const res = await POST(makeRequest({ bookingId: BOOKING_ID, rating: 5 }));
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toMatch(/already reviewed/i);
  });

  it("(4b) team-job duplicate review also surfaces 409 (anti-duplicate guard works on the new path)", async () => {
    createClientMock.mockReturnValueOnce(buildPubAuth(USER_ID) as never);
    const { admin } = buildAdmin({
      bookingRow: {
        id: BOOKING_ID,
        user_id: USER_ID,
        cleaner_id: null,
        payout_owner_cleaner_id: TEAM_LEAD,
        status: "completed",
        completed_at: "2026-04-01T10:00:00Z",
        is_team_job: true,
        team_id: "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa",
      },
      insertError: { code: "23505", message: "duplicate" },
    });
    getSupabaseAdminMock.mockReturnValue(admin as unknown as ReturnType<typeof getSupabaseAdmin>);

    const res = await POST(makeRequest({ bookingId: BOOKING_ID, rating: 5 }));
    expect(res.status).toBe(409);
  });

  it("(5) ownership: another user gets 403 — review security intact for solo bookings", async () => {
    createClientMock.mockReturnValueOnce(buildPubAuth(OTHER_USER_ID) as never);
    const { admin, state } = buildAdmin({
      bookingRow: {
        id: BOOKING_ID,
        user_id: USER_ID,
        cleaner_id: SOLO_CLEANER,
        payout_owner_cleaner_id: null,
        status: "completed",
        completed_at: "2026-04-01T10:00:00Z",
        is_team_job: false,
        team_id: null,
      },
    });
    getSupabaseAdminMock.mockReturnValue(admin as unknown as ReturnType<typeof getSupabaseAdmin>);

    const res = await POST(makeRequest({ bookingId: BOOKING_ID, rating: 5 }));
    expect(res.status).toBe(403);
    expect(state.reviewInsert).toBeNull();
  });

  it("(5b) ownership: another user CANNOT review someone else's team-completed booking either", async () => {
    createClientMock.mockReturnValueOnce(buildPubAuth(OTHER_USER_ID) as never);
    const { admin, state } = buildAdmin({
      bookingRow: {
        id: BOOKING_ID,
        user_id: USER_ID,
        cleaner_id: null,
        payout_owner_cleaner_id: TEAM_LEAD,
        status: "completed",
        completed_at: "2026-04-01T10:00:00Z",
        is_team_job: true,
        team_id: "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa",
      },
    });
    getSupabaseAdminMock.mockReturnValue(admin as unknown as ReturnType<typeof getSupabaseAdmin>);

    const res = await POST(makeRequest({ bookingId: BOOKING_ID, rating: 5 }));
    expect(res.status).toBe(403);
    expect(state.reviewInsert).toBeNull();
  });

  it("(6) SELECT list includes payout_owner_cleaner_id so the team-job path can ever be taken", async () => {
    createClientMock.mockReturnValueOnce(buildPubAuth(USER_ID) as never);
    const { admin, state } = buildAdmin({
      bookingRow: {
        id: BOOKING_ID,
        user_id: USER_ID,
        cleaner_id: SOLO_CLEANER,
        payout_owner_cleaner_id: null,
        status: "completed",
        completed_at: "2026-04-01T10:00:00Z",
        is_team_job: false,
        team_id: null,
      },
    });
    getSupabaseAdminMock.mockReturnValue(admin as unknown as ReturnType<typeof getSupabaseAdmin>);

    await POST(makeRequest({ bookingId: BOOKING_ID, rating: 5 }));
    expect(state.bookingSelect).toBeTruthy();
    expect(state.bookingSelect).toContain("payout_owner_cleaner_id");
    // Sanity: existing columns preserved.
    expect(state.bookingSelect).toContain("cleaner_id");
    expect(state.bookingSelect).toContain("is_team_job");
    expect(state.bookingSelect).toContain("status");
    expect(state.bookingSelect).toContain("completed_at");
  });

  it("(7) eligibility blocks non-completed bookings (400 + completed_at gate)", async () => {
    createClientMock.mockReturnValueOnce(buildPubAuth(USER_ID) as never);
    const { admin, state } = buildAdmin({
      bookingRow: {
        id: BOOKING_ID,
        user_id: USER_ID,
        cleaner_id: SOLO_CLEANER,
        payout_owner_cleaner_id: null,
        status: "assigned",
        completed_at: null,
        is_team_job: false,
        team_id: null,
      },
    });
    getSupabaseAdminMock.mockReturnValue(admin as unknown as ReturnType<typeof getSupabaseAdmin>);

    const res = await POST(makeRequest({ bookingId: BOOKING_ID, rating: 5 }));
    expect(res.status).toBe(400);
    expect(state.reviewInsert).toBeNull();
  });

  it("(7b) eligibility blocks cancelled bookings even when payout_owner_cleaner_id is present", async () => {
    createClientMock.mockReturnValueOnce(buildPubAuth(USER_ID) as never);
    const { admin, state } = buildAdmin({
      bookingRow: {
        id: BOOKING_ID,
        user_id: USER_ID,
        cleaner_id: null,
        payout_owner_cleaner_id: TEAM_LEAD,
        status: "cancelled",
        completed_at: null,
        is_team_job: true,
        team_id: "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa",
      },
    });
    getSupabaseAdminMock.mockReturnValue(admin as unknown as ReturnType<typeof getSupabaseAdmin>);

    const res = await POST(makeRequest({ bookingId: BOOKING_ID, rating: 5 }));
    expect(res.status).toBe(400);
    expect(state.reviewInsert).toBeNull();
  });

  it("(8) team submission inserts a non-null cleaner_id (NOT NULL DB constraint compliance)", async () => {
    createClientMock.mockReturnValueOnce(buildPubAuth(USER_ID) as never);
    const { admin, state } = buildAdmin({
      bookingRow: {
        id: BOOKING_ID,
        user_id: USER_ID,
        cleaner_id: null,
        payout_owner_cleaner_id: TEAM_LEAD,
        status: "completed",
        completed_at: "2026-04-01T10:00:00Z",
        is_team_job: true,
        team_id: "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa",
      },
    });
    getSupabaseAdminMock.mockReturnValue(admin as unknown as ReturnType<typeof getSupabaseAdmin>);

    await POST(makeRequest({ bookingId: BOOKING_ID, rating: 5 }));
    expect(state.reviewInsert).not.toBeNull();
    const cleanerId = state.reviewInsert!.cleaner_id;
    expect(cleanerId).not.toBeNull();
    expect(typeof cleanerId).toBe("string");
    expect((cleanerId as string).length).toBe(36);
  });
});
