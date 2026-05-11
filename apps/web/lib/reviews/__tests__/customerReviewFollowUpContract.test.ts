import { describe, expect, it } from "vitest";
import {
  bookingHasReviewAssignee,
  evaluateCustomerReviewPromptEligibility,
  evaluateCustomerReviewSubmissionEligibility,
  listCustomerReviewFollowUpIssues,
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

  it("submission requires cleaner_id even when team_id present", () => {
    const r = evaluateCustomerReviewSubmissionEligibility({
      status: "completed",
      completed_at: null,
      is_team_job: true,
      team_id: "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa",
      cleaner_id: null,
    });
    expect(r.allowed).toBe(false);
    if (!r.allowed) expect(r.skipReason).toBe("review_submit_requires_cleaner_id");
  });

  it("bookingHasReviewAssignee", () => {
    expect(bookingHasReviewAssignee({ cleaner_id: "x" })).toBe(true);
    expect(bookingHasReviewAssignee({ is_team_job: true, team_id: "y" })).toBe(true);
    expect(bookingHasReviewAssignee({ is_team_job: true })).toBe(false);
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
