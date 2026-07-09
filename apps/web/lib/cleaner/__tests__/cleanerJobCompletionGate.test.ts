import { describe, expect, it } from "vitest";
import {
  CLEANER_COMPLETION_MIN_ELAPSED_RATIO,
  evaluateCleanerJobCompletionGate,
} from "@/lib/cleaner/cleanerJobCompletionGate";
import { formatCleanerJobElapsedLabel } from "@/lib/cleaner/cleanerJobElapsedTimer";

describe("cleanerJobCompletionGate (Phase 6)", () => {
  const startedAt = "2026-06-19T08:00:00.000Z";
  const durationMinutes = 120;

  it("blocks when persisted duration is missing", () => {
    const result = evaluateCleanerJobCompletionGate(
      { started_at: startedAt },
      Date.parse(startedAt) + 3 * 60 * 60_000,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("missing_persisted_duration");
  });

  it("blocks when minimum quoted on-site time has not elapsed", () => {
    const elapsedMs = durationMinutes * CLEANER_COMPLETION_MIN_ELAPSED_RATIO * 60_000 - 5 * 60_000;
    const result = evaluateCleanerJobCompletionGate(
      { started_at: startedAt, duration_minutes: durationMinutes },
      Date.parse(startedAt) + elapsedMs,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("minimum_duration_not_elapsed");
      expect(result.remainingMinutes).toBeGreaterThan(0);
    }
  });

  it("allows complete after 90% of quoted duration", () => {
    const elapsedMs = durationMinutes * CLEANER_COMPLETION_MIN_ELAPSED_RATIO * 60_000 + 60_000;
    const result = evaluateCleanerJobCompletionGate(
      { started_at: startedAt, duration_minutes: durationMinutes },
      Date.parse(startedAt) + elapsedMs,
    );
    expect(result.ok).toBe(true);
  });

  it("blocks V2 rows missing quote_signature", () => {
    const result = evaluateCleanerJobCompletionGate(
      {
        started_at: startedAt,
        duration_minutes: durationMinutes,
        pricing_summary: { estimated_total: 500, base_service_price: 400, estimated_duration_minutes: durationMinutes },
      },
      Date.parse(startedAt) + durationMinutes * 60_000,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("quote_signature_missing");
  });

  it("formatCleanerJobElapsedLabel renders on-site elapsed time", () => {
    expect(formatCleanerJobElapsedLabel(startedAt, Date.parse(startedAt) + 75 * 60_000)).toBe("1h 15m on site");
  });
});
