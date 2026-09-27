import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

vi.mock("@/lib/logging/systemLog", () => ({
  reportOperationalIssue: vi.fn().mockResolvedValue(undefined),
}));

import { ensureReviewFollowUpForCompletedBooking } from "@/lib/reviews/ensureReviewFollowUp";

const CLEANER_ID = "44444444-4444-4444-8444-444444444444";

function makeSupabase(opts?: { reviewExists?: boolean; insertError?: { code?: string; message: string } | null }) {
  const state = { inserted: null as Record<string, unknown> | null };

  const supabase = {
    from(table: string) {
      if (table === "reviews") {
        return {
          select() {
            return {
              eq() {
                return {
                  async maybeSingle() {
                    return { data: opts?.reviewExists ? { id: "review-1" } : null, error: null };
                  },
                };
              },
            };
          },
        };
      }
      if (table === "booking_lifecycle_jobs") {
        return {
          async insert(payload: Record<string, unknown>) {
            state.inserted = payload;
            return { error: opts?.insertError ?? null };
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  } as unknown as SupabaseClient;

  return { supabase, state };
}

function completedBooking(overrides?: Record<string, unknown>) {
  return {
    id: "33333333-3333-4333-8333-333333333333",
    customer_email: "customer@example.com",
    status: "completed",
    completed_at: "2026-09-27T12:00:00Z",
    cleaner_id: CLEANER_ID,
    is_team_job: false,
    ...overrides,
  };
}

describe("ensureReviewFollowUpForCompletedBooking", () => {
  it("creates one pending review_request for an eligible completed booking", async () => {
    const { supabase, state } = makeSupabase();
    const result = await ensureReviewFollowUpForCompletedBooking(supabase, completedBooking());

    expect(result).toMatchObject({ ok: true, created: true, reason: "created" });
    expect(state.inserted).toMatchObject({
      booking_id: "33333333-3333-4333-8333-333333333333",
      customer_email: "customer@example.com",
      job_type: "review_request",
      status: "pending",
      attempts: 0,
    });
  });

  it("does not create a follow-up when a review already exists", async () => {
    const { supabase, state } = makeSupabase({ reviewExists: true });
    const result = await ensureReviewFollowUpForCompletedBooking(supabase, completedBooking());

    expect(result).toMatchObject({ ok: true, created: false, reason: "existing_review" });
    expect(state.inserted).toBeNull();
  });

  it("does not prompt a team booking without a resolvable lead cleaner", async () => {
    const { supabase, state } = makeSupabase();
    const result = await ensureReviewFollowUpForCompletedBooking(
      supabase,
      completedBooking({
        cleaner_id: null,
        is_team_job: true,
        team_id: "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa",
        payout_owner_cleaner_id: null,
      }),
    );

    expect(result).toMatchObject({ ok: true, created: false, reason: "ineligible" });
    expect(state.inserted).toBeNull();
  });

  it("treats unique job conflicts as an idempotent duplicate", async () => {
    const { supabase } = makeSupabase({ insertError: { code: "23505", message: "duplicate" } });
    const result = await ensureReviewFollowUpForCompletedBooking(supabase, completedBooking());

    expect(result).toMatchObject({ ok: true, created: false, reason: "duplicate_job" });
  });
});
