import { describe, expect, it } from "vitest";

import {
  adminAssignmentWarningFromWorkloadWarning,
  buildAdminAssignmentEligibilityWarnings,
  type AssignEligibilityRow,
} from "@/lib/admin/adminAssignEligibility";

function row(overrides: Partial<AssignEligibilityRow> = {}): AssignEligibilityRow {
  return {
    cleanerId: "cleaner-1",
    weekdayOk: true,
    calendarWindowOk: true,
    slotCalendarOk: true,
    locationOk: true,
    overlapBlocked: false,
    busyUntilMin: null,
    overlapJobRangeLabel: null,
    nextAvailableStartHm: null,
    offline: false,
    accountIneligible: false,
    serviceCapabilityOk: true,
    workloadWarning: null,
    canAssignWithoutForce: true,
    ...overrides,
  };
}

describe("admin assignment canonical warnings", () => {
  it("maps eligibility risks to canonical assignment warnings", () => {
    const warnings = buildAdminAssignmentEligibilityWarnings(
      row({
        weekdayOk: false,
        calendarWindowOk: false,
        locationOk: false,
        overlapBlocked: true,
        busyUntilMin: 780,
        overlapJobRangeLabel: "10:00-13:00",
        offline: true,
        accountIneligible: true,
        serviceCapabilityOk: false,
      }),
    );

    expect(warnings.map((w) => w.code)).toEqual([
      "admin.assignment.offline_cleaner_force_override_available",
      "admin.assignment.account_ineligible_force_override_available",
      "admin.assignment.overlap_force_override_available",
      "admin.assignment.weekday_unavailable_force_override_available",
      "admin.assignment.availability_window_force_override_available",
      "admin.assignment.location_mismatch_force_override_available",
      "admin.assignment.service_capability_force_override_available",
    ]);
    expect(warnings.every((w) => w.domain === "assignment")).toBe(true);
    expect(warnings.every((w) => w.action === "force_override_available")).toBe(true);
    expect(warnings.every((w) => w.blocking === true)).toBe(true);
  });

  it("maps 8h workload over limit to a confirmation warning", () => {
    expect(
      adminAssignmentWarningFromWorkloadWarning({
        code: "daily_workload_over_limit",
        riskBand: "over_8h",
        jobKind: "solo",
        totalScheduledMinutes: 540,
        maxPolicyMinutes: 480,
        riskyPolicyMinutes: 420,
        fallbackCount: 0,
        fallbackBookingIds: [],
      }),
    ).toMatchObject({
      code: "admin.assignment.daily_workload_over_limit_requires_confirmation",
      domain: "assignment",
      severity: "high",
      action: "requires_confirmation",
      blocking: true,
      requiredConfirmation: { token: "force_8h_workload", reasonRequired: true },
    });
  });

  it("maps duration fallback to a diagnostic warning", () => {
    expect(
      adminAssignmentWarningFromWorkloadWarning({
        code: "duration_fallback_used",
        riskBand: "normal",
        jobKind: "solo",
        totalScheduledMinutes: 480,
        maxPolicyMinutes: 480,
        riskyPolicyMinutes: 420,
        fallbackCount: 1,
        fallbackBookingIds: ["b1"],
      }),
    ).toMatchObject({
      code: "admin.assignment.duration_fallback_used",
      domain: "assignment",
      severity: "medium",
      action: "diagnostic_only",
      blocking: false,
    });
  });
});
