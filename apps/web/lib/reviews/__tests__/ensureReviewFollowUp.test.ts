import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

vi.mock("@/lib/logging/systemLog", () => ({
  reportOperationalIssue: vi.fn().mockResolvedValue(undefined),
}));

import { ensureReviewFollowUpForCompletedBooking } from "@/lib/reviews/ensureReviewFollowUp";

const CLEANER_ID = "44444444-4444-4444-8444-444444444444";

function makeSupabase(opts?: {
  reviewExists?: boolean;
  existingJob?: { id: string; status: string; sent_at: string | null; processed_at?: string | null } | null;
  insertError?: { code?: string; message: string } | null;
}) {
  const state = {
    inserted: null as Record<string, unknown> | null,
    revived: null as Record<string, unknown> | null,
  };

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
          select() {
            const chain: any = {};
            chain.eq = () => chain;
            chain.maybeSingle = async () => ({ data: opts?.existingJob ?? null, error: null });
            return chain;
          },
          update(payload: Record<string, unknown>) {
            state.revived = payload;
            const chain: any = {};
            chain.eq = () => chain;
            chain.is = () => chain;
            chain.select = () => chain;
            chain.maybeSingle = async () => ({
              data: { id: opts?.existingJob?.id ?? "job-updated" },
              error: null,
            });
            return chain;
          },
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
    expect(state.revived).toBeNull();
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
    expect(state.revived).toBeNull();
  });

  it("revives a failed terminal review job instead of being blocked by the unique constraint", async () => {
    const { supabase, state } = makeSupabase({
      existingJob: { id: "job-1", status: "failed_terminal", sent_at: null },
    });
    const result = await ensureReviewFollowUpForCompletedBooking(supabase, completedBooking());

    expect(result).toMatchObject({ ok: true, created: false, reason: "revived_existing_job" });
    expect(state.revived).toMatchObject({
      status: "pending",
      attempts: 0,
      last_error: null,
      skipped_reason: null,
      processed_at: null,
    });
    expect(state.inserted).toBeNull();
  });

  it("revives a stale processing review job after the worker lease expires", async () => {
    const staleProcessedAt = new Date(Date.now() - 11 * 60 * 1000).toISOString();
    const { supabase, state } = makeSupabase({
      existingJob: {
        id: "job-stale-processing",
        status: "processing",
        sent_at: null,
        processed_at: staleProcessedAt,
      },
    });
    const result = await ensureReviewFollowUpForCompletedBooking(supabase, completedBooking());

    expect(result).toMatchObject({ ok: true, created: false, reason: "revived_existing_job" });
    expect(state.revived).toMatchObject({ status: "pending", processed_at: null, attempts: 0 });
  });

  it("leaves a fresh processing review job alone", async () => {
    const { supabase, state } = makeSupabase({
      existingJob: {
        id: "job-fresh-processing",
        status: "processing",
        sent_at: null,
        processed_at: new Date().toISOString(),
      },
    });
    const result = await ensureReviewFollowUpForCompletedBooking(supabase, completedBooking());

    expect(result).toMatchObject({ ok: true, created: false, reason: "existing_active_job" });
    expect(state.revived).toBeNull();
  });

  it("leaves an already active review job alone", async () => {
    const { supabase, state } = makeSupabase({
      existingJob: { id: "job-2", status: "pending", sent_at: null },
    });
    const result = await ensureReviewFollowUpForCompletedBooking(supabase, completedBooking());

    expect(result).toMatchObject({ ok: true, created: false, reason: "existing_active_job" });
    expect(state.revived).toBeNull();
    expect(state.inserted).toBeNull();
  });

  it("treats unique job conflicts as an idempotent duplicate", async () => {
    const { supabase } = makeSupabase({
      existingJob: null,
      insertError: { code: "23505", message: "duplicate" },
    });
    const result = await ensureReviewFollowUpForCompletedBooking(supabase, completedBooking());

    expect(result).toMatchObject({ ok: true, created: false, reason: "duplicate_job" });
  });
});
