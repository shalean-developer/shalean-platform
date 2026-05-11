import { describe, expect, it } from "vitest";
import {
  bookingHasEffectiveAssignee,
  deriveAssignmentSemanticPhase,
  listBookingAssignmentConsistencyIssues,
} from "@/lib/dispatch/assignmentLifecycleContract";

describe("assignmentLifecycleContract", () => {
  describe("bookingHasEffectiveAssignee", () => {
    it("true when cleaner_id set", () => {
      expect(bookingHasEffectiveAssignee({ cleaner_id: "x", team_id: null, is_team_job: false })).toBe(true);
    });
    it("true when team job with team_id", () => {
      expect(bookingHasEffectiveAssignee({ cleaner_id: null, team_id: "t1", is_team_job: true })).toBe(true);
    });
    it("false when team_id without is_team_job", () => {
      expect(bookingHasEffectiveAssignee({ cleaner_id: null, team_id: "t1", is_team_job: false })).toBe(false);
    });
  });

  describe("listBookingAssignmentConsistencyIssues", () => {
    it("flags assigned without cleaner or team", () => {
      const issues = listBookingAssignmentConsistencyIssues({
        status: "assigned",
        dispatch_status: "assigned",
        cleaner_id: null,
        team_id: null,
        is_team_job: false,
      });
      expect(issues.some((i) => i.code === "ACTIVE_OR_DONE_WITHOUT_ASSIGNEE")).toBe(true);
    });

    it("flags cleaner_id with dispatch searching", () => {
      const issues = listBookingAssignmentConsistencyIssues({
        status: "pending",
        dispatch_status: "searching",
        cleaner_id: "aaa",
        team_id: null,
        is_team_job: false,
      });
      expect(issues.some((i) => i.code === "CLEANER_ID_WITH_ACTIVE_DISPATCH_FUNNEL")).toBe(true);
    });

    it("flags dispatch assigned while booking still pending_assignment", () => {
      const issues = listBookingAssignmentConsistencyIssues({
        status: "pending_assignment",
        dispatch_status: "assigned",
        cleaner_id: null,
        team_id: null,
        is_team_job: false,
      });
      expect(issues.some((i) => i.code === "DISPATCH_POST_ASSIGN_BOOKING_STILL_PRE_ASSIGN")).toBe(true);
    });

    it("allows completed with cleaner", () => {
      expect(
        listBookingAssignmentConsistencyIssues({
          status: "completed",
          dispatch_status: "assigned",
          cleaner_id: "c1",
          team_id: null,
          is_team_job: false,
        }),
      ).toEqual([]);
    });

    it("flags dispatch offered with zero pending offers when ctx provided", () => {
      const issues = listBookingAssignmentConsistencyIssues(
        {
          status: "pending_assignment",
          dispatch_status: "offered",
          cleaner_id: null,
          team_id: null,
          is_team_job: false,
        },
        { pendingDispatchOfferCount: 0 },
      );
      expect(issues.some((i) => i.code === "DISPATCH_OFFERED_FLAG_WITHOUT_PENDING_OFFER_ROWS")).toBe(true);
    });

    it("does not flag cancelled without assignee", () => {
      expect(
        listBookingAssignmentConsistencyIssues({
          status: "cancelled",
          dispatch_status: "failed",
          cleaner_id: null,
          team_id: null,
          is_team_job: false,
        }).some((i) => i.code === "ACTIVE_OR_DONE_WITHOUT_ASSIGNEE"),
      ).toBe(false);
    });
  });

  describe("deriveAssignmentSemanticPhase", () => {
    it("returns searching when dispatch_status searching", () => {
      expect(
        deriveAssignmentSemanticPhase({
          status: "pending",
          dispatch_status: "searching",
          cleaner_id: null,
          team_id: null,
          is_team_job: false,
        }),
      ).toBe("searching");
    });

    it("returns offered when pending offers in ctx", () => {
      expect(
        deriveAssignmentSemanticPhase(
          {
            status: "pending_assignment",
            dispatch_status: "searching",
            cleaner_id: null,
            team_id: null,
            is_team_job: false,
          },
          { pendingDispatchOfferCount: 2 },
        ),
      ).toBe("pending_assignment_offered");
    });
  });
});
