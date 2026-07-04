import { describe, expect, it } from "vitest";
import {
  parseRecurringGeneratorRunMessage,
  recurringGeneratorCronStatus,
  recurringGeneratorCronWarning,
  recurringGeneratorRunHasHardFailure,
} from "@/lib/recurring/recurringGeneratorRunSummary";

describe("recurringGeneratorRunHasHardFailure", () => {
  it("treats insert failures and skipped plans as hard failures", () => {
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
    ).toBe(true);
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

  it("surfaces insert failures on the latest error run", () => {
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
});
