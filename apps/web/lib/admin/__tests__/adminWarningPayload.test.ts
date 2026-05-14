import { describe, expect, it } from "vitest";

import {
  appendAdminWarningPayload,
  buildAdminWarning,
  buildAdminWarningPayload,
  normalizeAdminWarningAction,
  normalizeAdminWarningSeverity,
} from "@/lib/admin/adminWarningPayload";

describe("adminWarningPayload", () => {
  it("builds a canonical warning shape", () => {
    expect(
      buildAdminWarning({
        code: "admin.assignment.force_8h_workload_requires_confirmation",
        domain: "assignment",
        severity: "high",
        action: "requires_confirmation",
        blocking: true,
        message: "Cleaner would exceed the 8-hour daily workload policy.",
        fields: ["cleaner_id", "duration_minutes"],
        diagnostics: { projectedMinutes: 540 },
        requiredConfirmation: { token: "force_8h_workload", reasonRequired: true },
      }),
    ).toEqual({
      code: "admin.assignment.force_8h_workload_requires_confirmation",
      domain: "assignment",
      severity: "high",
      action: "requires_confirmation",
      blocking: true,
      message: "Cleaner would exceed the 8-hour daily workload policy.",
      fields: ["cleaner_id", "duration_minutes"],
      diagnostics: { projectedMinutes: 540 },
      requiredConfirmation: { token: "force_8h_workload", reasonRequired: true },
    });
  });

  it("normalizes unknown severity and action values to safe defaults", () => {
    expect(normalizeAdminWarningSeverity("CRITICAL")).toBe("critical");
    expect(normalizeAdminWarningSeverity("not-real")).toBe("medium");
    expect(normalizeAdminWarningAction("BLOCKED")).toBe("blocked");
    expect(normalizeAdminWarningAction("not-real")).toBe("diagnostic_only");

    expect(
      buildAdminWarning({
        code: "admin.system.unknown",
        domain: "system",
        severity: "not-real",
        action: "not-real",
        message: "Unknown warning.",
      }),
    ).toMatchObject({
      severity: "medium",
      action: "diagnostic_only",
      blocking: false,
    });
  });

  it("preserves compatibility fields while adding canonical warning metadata", () => {
    const payload = buildAdminWarningPayload({
      ok: false,
      code: "admin_booking_delete_payout_linked",
      error: "Payout-linked bookings cannot be hard-deleted.",
      blocks: [{ code: "admin_booking_delete_payout_linked" }],
      warning: {
        code: "admin.delete.payout_linked_blocked",
        domain: "delete",
        severity: "critical",
        action: "blocked",
        message: "Payout-linked bookings cannot be hard-deleted.",
      },
    });

    expect(payload).toMatchObject({
      ok: false,
      code: "admin_booking_delete_payout_linked",
      error: "Payout-linked bookings cannot be hard-deleted.",
      blocks: [{ code: "admin_booking_delete_payout_linked" }],
      domain: "delete",
      severity: "critical",
      action: "blocked",
      blocking: true,
      warnings: [
        {
          code: "admin.delete.payout_linked_blocked",
          domain: "delete",
          severity: "critical",
          action: "blocked",
          blocking: true,
        },
      ],
    });
  });

  it("aggregates warnings and promotes blocking when any warning blocks", () => {
    const payload = buildAdminWarningPayload({
      warnings: [
        {
          code: "admin.recurring.stale_duration_snapshot_warning",
          domain: "recurring",
          severity: "medium",
          action: "manual_review_required",
          message: "Recurring child duration differs from the current canonical duration.",
        },
        {
          code: "admin.payment.monthly_child_mark_paid_blocked",
          domain: "payment",
          severity: "critical",
          action: "blocked",
          message: "Monthly invoice child must be settled through the invoice flow.",
        },
      ],
    });

    expect(payload.ok).toBe(false);
    expect(payload.blocking).toBe(true);
    expect(payload.warnings).toHaveLength(2);
    expect(payload.code).toBe("admin.recurring.stale_duration_snapshot_warning");
  });

  it("appends warnings without dropping compatibility fields", () => {
    const first = buildAdminWarningPayload({
      ok: true,
      reason: "already_checked",
      indicators: ["payment_status_pending_monthly"],
      warning: {
        code: "admin.monthly_invoice.paid_child_unsettled_repair_available",
        domain: "monthly_invoice",
        severity: "high",
        action: "repair_available",
        message: "Paid invoice has an unsettled child booking.",
      },
    });

    const next = appendAdminWarningPayload(first, {
      code: "admin.payout.eligibility_manual_review_required",
      domain: "payout",
      severity: "medium",
      action: "manual_review_required",
      message: "Payout eligibility should be reviewed before repair.",
    });

    expect(next.reason).toBe("already_checked");
    expect(next.indicators).toEqual(["payment_status_pending_monthly"]);
    expect(next.warnings.map((w) => w.code)).toEqual([
      "admin.monthly_invoice.paid_child_unsettled_repair_available",
      "admin.payout.eligibility_manual_review_required",
    ]);
  });

  it("matches the snapshot-style canonical payload contract", () => {
    expect(
      buildAdminWarningPayload({
        warning: {
          code: "admin.assignment.force_8h_workload_requires_confirmation",
          domain: "assignment",
          severity: "high",
          action: "requires_confirmation",
          blocking: true,
          message: "Cleaner would exceed the 8-hour daily workload policy.",
          fields: ["cleaner_id", "duration_minutes"],
          diagnostics: { cleanerId: "cleaner-1", projectedMinutes: 540 },
          requiredConfirmation: { token: "force_8h_workload", reasonRequired: true },
        },
      }),
    ).toMatchInlineSnapshot(`
      {
        "action": "requires_confirmation",
        "blocking": true,
        "code": "admin.assignment.force_8h_workload_requires_confirmation",
        "domain": "assignment",
        "error": "Cleaner would exceed the 8-hour daily workload policy.",
        "fields": [
          "cleaner_id",
          "duration_minutes",
        ],
        "message": "Cleaner would exceed the 8-hour daily workload policy.",
        "ok": false,
        "requiredConfirmation": {
          "reasonRequired": true,
          "token": "force_8h_workload",
        },
        "severity": "high",
        "warnings": [
          {
            "action": "requires_confirmation",
            "blocking": true,
            "code": "admin.assignment.force_8h_workload_requires_confirmation",
            "diagnostics": {
              "cleanerId": "cleaner-1",
              "projectedMinutes": 540,
            },
            "domain": "assignment",
            "fields": [
              "cleaner_id",
              "duration_minutes",
            ],
            "message": "Cleaner would exceed the 8-hour daily workload policy.",
            "requiredConfirmation": {
              "reasonRequired": true,
              "token": "force_8h_workload",
            },
            "severity": "high",
          },
        ],
      }
    `);
  });
});
