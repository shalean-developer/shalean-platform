import { describe, expect, it } from "vitest";
import {
  buildCompletionCoherencePatch,
  buildRepairCompletionCoherencePatch,
  listBookingCompletionConsistencyIssues,
  validateAdminMonthlyCompletedAssignee,
} from "@/lib/booking/bookingCompletionIntegrity";

describe("bookingCompletionIntegrity", () => {
  describe("buildCompletionCoherencePatch", () => {
    it("fills completed_at for admin when missing", () => {
      const { patch, dispatchStatusNormalized } = buildCompletionCoherencePatch({
        beforeCompletedAt: null,
        beforeDispatchStatus: "assigned",
        fillCompletedAtIfMissing: true,
        nowIso: "2026-05-10T12:00:00.000Z",
      });
      expect(patch.completed_at).toBe("2026-05-10T12:00:00.000Z");
      expect(dispatchStatusNormalized).toBe(false);
    });

    it("does not overwrite existing completed_at", () => {
      const { patch } = buildCompletionCoherencePatch({
        beforeCompletedAt: "2026-05-01T10:00:00.000Z",
        beforeDispatchStatus: "assigned",
        fillCompletedAtIfMissing: true,
      });
      expect(patch.completed_at).toBeUndefined();
    });

    it("heals searching dispatch to assigned", () => {
      const { patch, dispatchStatusNormalized } = buildCompletionCoherencePatch({
        beforeCompletedAt: null,
        beforeDispatchStatus: "searching",
        fillCompletedAtIfMissing: true,
        nowIso: "2026-05-10T12:00:00.000Z",
      });
      expect(patch.dispatch_status).toBe("assigned");
      expect(dispatchStatusNormalized).toBe(true);
    });

    it("heals offered dispatch", () => {
      const { patch } = buildCompletionCoherencePatch({
        fillCompletedAtIfMissing: false,
        beforeDispatchStatus: "offered",
      });
      expect(patch.dispatch_status).toBe("assigned");
      expect(patch.completed_at).toBeUndefined();
    });

    it("cleaner mode skips completed_at in patch", () => {
      const { patch } = buildCompletionCoherencePatch({
        beforeCompletedAt: null,
        beforeDispatchStatus: "assigned",
        fillCompletedAtIfMissing: false,
      });
      expect(Object.keys(patch)).toHaveLength(0);
    });
  });

  describe("listBookingCompletionConsistencyIssues", () => {
    it("flags completed status without completed_at", () => {
      const issues = listBookingCompletionConsistencyIssues({
        status: "completed",
        completed_at: null,
        cleaner_id: "00000000-0000-4000-8000-000000000001",
      });
      expect(issues.some((i) => i.code === "completed_status_missing_completed_at")).toBe(true);
    });

    it("flags stale dispatch funnel on completed row", () => {
      const issues = listBookingCompletionConsistencyIssues({
        status: "completed",
        completed_at: "2026-05-01T10:00:00Z",
        dispatch_status: "offered",
        cleaner_id: "00000000-0000-4000-8000-000000000001",
      });
      expect(issues.some((i) => i.code === "completed_with_active_dispatch_funnel")).toBe(true);
    });

    /** Invalid legacy/drift row shape (admin monthly no longer inserts this). */
    it("flags completed + searching dispatch as active funnel drift", () => {
      const issues = listBookingCompletionConsistencyIssues({
        status: "completed",
        completed_at: "2026-05-01T10:00:00Z",
        dispatch_status: "searching",
        cleaner_id: "00000000-0000-4000-8000-000000000001",
      });
      expect(issues.some((i) => i.code === "completed_with_active_dispatch_funnel")).toBe(true);
    });

    it("allows completed row with cleaner and dispatch_status assigned (no error-level issues)", () => {
      const issues = listBookingCompletionConsistencyIssues({
        status: "completed",
        completed_at: "2026-05-01T10:00:00Z",
        dispatch_status: "assigned",
        cleaner_id: "00000000-0000-4000-8000-000000000001",
      });
      expect(issues.filter((i) => i.severity === "error")).toEqual([]);
    });

    it("allows completed row with team assignee and dispatch_status assigned", () => {
      const issues = listBookingCompletionConsistencyIssues({
        status: "completed",
        completed_at: "2026-05-01T10:00:00Z",
        dispatch_status: "assigned",
        cleaner_id: null,
        is_team_job: true,
        team_id: "00000000-0000-4000-8000-000000000099",
        payout_owner_cleaner_id: "00000000-0000-4000-8000-000000000001",
      });
      expect(issues.some((i) => i.code === "completed_without_assignee")).toBe(false);
      expect(issues.some((i) => i.code === "completed_with_active_dispatch_funnel")).toBe(false);
      expect(issues.some((i) => i.code === "completed_team_missing_payout_owner")).toBe(false);
    });

    it("flags missing assignee", () => {
      const issues = listBookingCompletionConsistencyIssues({
        status: "completed",
        completed_at: "2026-05-01T10:00:00Z",
        cleaner_id: null,
        is_team_job: false,
      });
      expect(issues.some((i) => i.code === "completed_without_assignee")).toBe(true);
    });

    it("allows team job with team_id", () => {
      const issues = listBookingCompletionConsistencyIssues({
        status: "completed",
        completed_at: "2026-05-01T10:00:00Z",
        cleaner_id: null,
        is_team_job: true,
        team_id: "00000000-0000-4000-8000-000000000099",
        payout_owner_cleaner_id: "00000000-0000-4000-8000-000000000001",
      });
      expect(issues.some((i) => i.code === "completed_without_assignee")).toBe(false);
    });

    it("warns team missing payout owner", () => {
      const issues = listBookingCompletionConsistencyIssues({
        status: "completed",
        completed_at: "2026-05-01T10:00:00Z",
        is_team_job: true,
        team_id: "00000000-0000-4000-8000-000000000099",
        payout_owner_cleaner_id: null,
      });
      expect(issues.some((i) => i.code === "completed_team_missing_payout_owner")).toBe(true);
    });

    it("flags pending_assignment with completed_at", () => {
      const issues = listBookingCompletionConsistencyIssues({
        status: "pending_assignment",
        completed_at: "2026-05-01T10:00:00Z",
        cleaner_id: "00000000-0000-4000-8000-000000000001",
      });
      expect(issues.some((i) => i.code === "completed_timestamp_pending_assignment_status")).toBe(true);
    });
  });

  describe("buildRepairCompletionCoherencePatch", () => {
    it("repairs assigned row with completed_at", () => {
      const patch = buildRepairCompletionCoherencePatch({
        status: "assigned",
        completed_at: "2026-05-01T10:00:00Z",
        dispatch_status: "assigned",
      });
      expect(patch?.status).toBe("completed");
      expect(patch?.cleaner_response_status).toBe("completed");
    });

    it("returns null when already completed", () => {
      expect(
        buildRepairCompletionCoherencePatch({
          status: "completed",
          completed_at: "2026-05-01T10:00:00Z",
        }),
      ).toBeNull();
    });
  });

  describe("validateAdminMonthlyCompletedAssignee", () => {
    it("rejects completed intent without cleaner or team", () => {
      const r = validateAdminMonthlyCompletedAssignee({
        selectedCleanerId: null,
        isTeamJobFlag: false,
        validatedTeamId: null,
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.code).toBe("admin_monthly_completed_requires_assignee");
    });

    it("allows cleaner assignee", () => {
      expect(
        validateAdminMonthlyCompletedAssignee({
          selectedCleanerId: "00000000-0000-4000-8000-000000000001",
          isTeamJobFlag: false,
          validatedTeamId: null,
        }).ok,
      ).toBe(true);
    });

    it("allows team assignee when team id validated", () => {
      expect(
        validateAdminMonthlyCompletedAssignee({
          selectedCleanerId: null,
          isTeamJobFlag: true,
          validatedTeamId: "00000000-0000-4000-8000-000000000099",
        }).ok,
      ).toBe(true);
    });

    it("rejects is_team_job without validated team id", () => {
      const r = validateAdminMonthlyCompletedAssignee({
        selectedCleanerId: null,
        isTeamJobFlag: true,
        validatedTeamId: null,
      });
      expect(r.ok).toBe(false);
    });
  });
});
