import { describe, expect, it } from "vitest";
import {
  bookingHasReviewAssignee,
  bookingIsReviewSubmissionEligibleAssignee,
  evaluateCustomerReviewPromptEligibility,
  evaluateCustomerReviewSubmissionEligibility,
  listCustomerReviewFollowUpIssues,
  resolveReviewCleanerIdForSubmission,
} from "@/lib/reviews/customerReviewFollowUpContract";

describe("customerReviewFollowUpContract", () => {
  it("prompt allows authoritative completion via completed_at alone", () => {
    expect(
      evaluateCustomerReviewPromptEligibility({
        status: "in_progress",
        completed_at: "2026-06-01T14:00:00Z",
        cleaner_id: "00000000-0000-4000-8000-000000000001",
      }).allowed,
    ).toBe(true);
  });

  it("prompt allows status completed without completed_at", () => {
    expect(
      evaluateCustomerReviewPromptEligibility({
        status: "completed",
        completed_at: null,
        cleaner_id: "00000000-0000-4000-8000-000000000001",
      }).allowed,
    ).toBe(true);
  });

  it("prompt blocks cancelled", () => {
    const r = evaluateCustomerReviewPromptEligibility({ status: "cancelled", cleaner_id: "c1" });
    expect(r.allowed).toBe(false);
    if (!r.allowed) expect(r.skipReason).toBe("review_prompt_terminal_booking");
  });

  it("prompt blocks pending_payment", () => {
    const r = evaluateCustomerReviewPromptEligibility({
      status: "pending_payment",
      cleaner_id: "c1",
      completed_at: null,
    });
    expect(r.allowed).toBe(false);
  });

  it("prompt blocks without completion", () => {
    const r = evaluateCustomerReviewPromptEligibility({
      status: "assigned",
      completed_at: null,
      cleaner_id: "c1",
    });
    expect(r.allowed).toBe(false);
    if (!r.allowed) expect(r.skipReason).toBe("review_prompt_booking_not_completed");
  });

  it("prompt allows team job with team_id and no cleaner_id", () => {
    expect(
      evaluateCustomerReviewPromptEligibility({
        status: "completed",
        completed_at: null,
        is_team_job: true,
        team_id: "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa",
        cleaner_id: null,
      }).allowed,
    ).toBe(true);
  });

  it("H-8: submission allows team job with payout_owner_cleaner_id even when cleaner_id is null", () => {
    const r = evaluateCustomerReviewSubmissionEligibility({
      status: "completed",
      completed_at: null,
      is_team_job: true,
      team_id: "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa",
      cleaner_id: null,
      payout_owner_cleaner_id: "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb",
    });
    expect(r.allowed).toBe(true);
  });

  it("submission still blocks team job when neither cleaner_id nor payout_owner_cleaner_id is set", () => {
    const r = evaluateCustomerReviewSubmissionEligibility({
      status: "completed",
      completed_at: null,
      is_team_job: true,
      team_id: "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa",
      cleaner_id: null,
      payout_owner_cleaner_id: null,
    });
    expect(r.allowed).toBe(false);
    if (!r.allowed) expect(r.skipReason).toBe("review_submit_requires_cleaner_id");
  });

  it("submission rejects payout_owner_cleaner_id on a NON-team booking (don't broaden semantics)", () => {
    /*
     * H-8 narrowness contract: payout_owner_cleaner_id can ONLY make a
     * row reviewable on a team job. A non-team booking with no
     * cleaner_id is blocked one layer up at the prompt-eligibility
     * stage (`bookingHasReviewAssignee` returns false → skipReason
     * `review_prompt_no_assignee`) and the submit-layer cleaner_id
     * resolver is never consulted. Either skip reason is acceptable
     * here — the invariant is `allowed === false`.
     */
    const r = evaluateCustomerReviewSubmissionEligibility({
      status: "completed",
      completed_at: null,
      is_team_job: false,
      cleaner_id: null,
      payout_owner_cleaner_id: "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb",
    });
    expect(r.allowed).toBe(false);
    if (!r.allowed) {
      expect([
        "review_prompt_no_assignee",
        "review_submit_requires_cleaner_id",
      ]).toContain(r.skipReason);
    }
  });

  it("bookingHasReviewAssignee", () => {
    expect(bookingHasReviewAssignee({ cleaner_id: "x" })).toBe(true);
    expect(bookingHasReviewAssignee({ is_team_job: true, team_id: "y" })).toBe(true);
    expect(bookingHasReviewAssignee({ is_team_job: true })).toBe(false);
  });

  it("resolveReviewCleanerIdForSubmission: returns cleaner_id when set (single-cleaner path unchanged)", () => {
    const id = "cccccccc-cccc-4ccc-cccc-cccccccccccc";
    expect(
      resolveReviewCleanerIdForSubmission({
        cleaner_id: id,
        is_team_job: false,
      }),
    ).toBe(id);
  });

  it("resolveReviewCleanerIdForSubmission: cleaner_id wins over payout_owner_cleaner_id even on team jobs", () => {
    const cleaner = "cccccccc-cccc-4ccc-cccc-cccccccccccc";
    const owner = "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb";
    expect(
      resolveReviewCleanerIdForSubmission({
        cleaner_id: cleaner,
        is_team_job: true,
        payout_owner_cleaner_id: owner,
      }),
    ).toBe(cleaner);
  });

  it("resolveReviewCleanerIdForSubmission: falls back to payout_owner_cleaner_id only when team job + cleaner_id null", () => {
    const owner = "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb";
    expect(
      resolveReviewCleanerIdForSubmission({
        cleaner_id: null,
        is_team_job: true,
        payout_owner_cleaner_id: owner,
      }),
    ).toBe(owner);
  });

  it("resolveReviewCleanerIdForSubmission: rejects malformed UUIDs (defence in depth)", () => {
    expect(
      resolveReviewCleanerIdForSubmission({
        cleaner_id: "not-a-uuid",
        is_team_job: true,
        payout_owner_cleaner_id: "also-bad",
      }),
    ).toBeNull();
  });

  it("resolveReviewCleanerIdForSubmission: never falls back when is_team_job is not strictly true", () => {
    const owner = "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb";
    expect(
      resolveReviewCleanerIdForSubmission({
        cleaner_id: null,
        is_team_job: false,
        payout_owner_cleaner_id: owner,
      }),
    ).toBeNull();
    expect(
      resolveReviewCleanerIdForSubmission({
        cleaner_id: null,
        // is_team_job omitted entirely
        payout_owner_cleaner_id: owner,
      }),
    ).toBeNull();
  });

  it("bookingIsReviewSubmissionEligibleAssignee mirrors the resolver (client/server lockstep)", () => {
    const cleaner = "cccccccc-cccc-4ccc-cccc-cccccccccccc";
    const owner = "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb";
    expect(bookingIsReviewSubmissionEligibleAssignee({ cleaner_id: cleaner })).toBe(true);
    expect(
      bookingIsReviewSubmissionEligibleAssignee({
        cleaner_id: null,
        is_team_job: true,
        payout_owner_cleaner_id: owner,
      }),
    ).toBe(true);
    expect(
      bookingIsReviewSubmissionEligibleAssignee({
        cleaner_id: null,
        is_team_job: false,
        payout_owner_cleaner_id: owner,
      }),
    ).toBe(false);
    expect(
      bookingIsReviewSubmissionEligibleAssignee({
        cleaner_id: null,
        is_team_job: true,
        payout_owner_cleaner_id: null,
      }),
    ).toBe(false);
  });

  it("listCustomerReviewFollowUpIssues empty when allowed", () => {
    expect(
      listCustomerReviewFollowUpIssues({
        status: "completed",
        cleaner_id: "c1",
      }).length,
    ).toBe(0);
  });
});
