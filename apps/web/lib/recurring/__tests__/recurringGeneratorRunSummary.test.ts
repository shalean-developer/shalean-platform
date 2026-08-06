import { describe, expect, it } from "vitest";
import {
  parseRecurringGeneratorRunMessage,
  recurringGeneratorCronStatus,
  recurringGeneratorCronWarning,
  recurringGeneratorRunHasHardFailure,
} from "@/lib/recurring/recurringGeneratorRunSummary";

describe("recurringGeneratorRunHasHardFailure", () => {
  it("treats insert failures as hard failures but not plan skips or duplicates", () => {
    expect(
      recurringGeneratorRunHasHardFailure({
        scanned: 1,
        generated: 0,
        skipped_duplicate: 0,
        failed: 1,
        skipped_plans: 0,
      }),
    ).toBe(true);
    expect(
      recurringGeneratorRunHasHardFailure({
        scanned: 1,
        generated: 0,
        skipped_duplicate: 0,
        failed: 0,
        skipped_plans: 1,
      }),
    ).toBe(false);
    expect(
      recurringGeneratorRunHasHardFailure({
        scanned: 1,
        generated: 0,
        skipped_duplicate: 5,
        failed: 0,
        skipped_plans: 0,
      }),
    ).toBe(false);
  });
});

describe("recurringGeneratorCronStatus", () => {
  it("returns error when failed > 0", () => {
    expect(
      recurringGeneratorCronStatus({
        scanned: 13,
        generated: 0,
        skipped_duplicate: 95,
        failed: 3,
        skipped_plans: 0,
      }),
    ).toBe("error");
  });

  it("returns success when only plans were skipped (cron still healthy)", () => {
    expect(
      recurringGeneratorCronStatus({
        scanned: 4,
        generated: 0,
        skipped_duplicate: 10,
        failed: 0,
        skipped_plans: 2,
      }),
    ).toBe("success");
  });
});

describe("parseRecurringGeneratorRunMessage", () => {
  it("parses new payload shape", () => {
    expect(
      parseRecurringGeneratorRunMessage(
        JSON.stringify({
          scanned: 13,
          generated: 0,
          skipped_duplicate: 95,
          failed: 0,
          skipped_plans: 0,
        }),
      ),
    ).toEqual({
      scanned: 13,
      generated: 0,
      skipped_duplicate: 95,
      failed: 0,
      skipped_plans: 0,
    });
  });

  it("maps legacy skipped-only payloads to skipped_duplicate", () => {
    expect(parseRecurringGeneratorRunMessage(JSON.stringify({ scanned: 13, generated: 0, skipped: 95 }))).toEqual({
      scanned: 13,
      generated: 0,
      skipped_duplicate: 95,
      failed: 0,
    });
  });
});

describe("recurringGeneratorCronWarning", () => {
  const fmt = (iso: string | null) => iso ?? "never";

  it("surfaces insert failures on the latest run as red", () => {
    const w = recurringGeneratorCronWarning(
      {
        job_name: "generate-recurring-bookings",
        last_success_at: new Date(Date.now() - 5 * 60_000).toISOString(),
        last_run_at: new Date().toISOString(),
        last_run_status: "error",
        last_run_message: JSON.stringify({ failed: 12, skipped_plans: 0, skipped_duplicate: 80 }),
        errors_last_24h: 1,
      },
      fmt,
    );
    expect(w?.severity).toBe("red");
    expect(w?.message).toContain("12 occurrence insert(s) failed");
  });

  it("surfaces plan skips as amber without claiming the cron is down", () => {
    const lastSuccess = new Date(Date.now() - 5 * 60_000).toISOString();
    const w = recurringGeneratorCronWarning(
      {
        job_name: "generate-recurring-bookings",
        last_success_at: lastSuccess,
        last_run_at: new Date().toISOString(),
        last_run_status: "success",
        last_run_message: JSON.stringify({ failed: 0, skipped_plans: 2, skipped_duplicate: 80 }),
        errors_last_24h: 0,
      },
      fmt,
    );
    expect(w?.severity).toBe("amber");
    expect(w?.message).toContain("skipped 2 plan(s)");
    expect(w?.message).toContain("not a cron outage");
  });

  it("does not treat a healthy empty scan as down", () => {
    const w = recurringGeneratorCronWarning(
      {
        job_name: "generate-recurring-bookings",
        last_success_at: new Date(Date.now() - 5 * 60_000).toISOString(),
        last_run_at: new Date().toISOString(),
        last_run_status: "success",
        last_run_message: JSON.stringify({
          scanned: 0,
          generated: 0,
          skipped_duplicate: 0,
          failed: 0,
          skipped_plans: 0,
        }),
        errors_last_24h: 0,
      },
      fmt,
    );
    expect(w).toBeNull();
  });

  it("clears the outage warning after a fresh successful run even when older failures remain in 24h history", () => {
    const w = recurringGeneratorCronWarning(
      {
        job_name: "generate-recurring-bookings",
        last_success_at: new Date(Date.now() - 5 * 60_000).toISOString(),
        last_run_at: new Date().toISOString(),
        last_run_status: "success",
        last_run_message: JSON.stringify({
          scanned: 15,
          generated: 0,
          skipped_duplicate: 103,
          failed: 0,
          skipped_plans: 0,
        }),
        errors_last_24h: 60,
      },
      fmt,
    );
    expect(w).toBeNull();
  });
});
