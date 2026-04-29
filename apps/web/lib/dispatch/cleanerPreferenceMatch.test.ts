import { describe, expect, it } from "vitest";
import {
  cleanerPreferenceStrictExcludesJob,
  computePreferenceScore01,
  hasConfiguredPreferences,
  jobMatchesPreferredTimeBlocks,
  weekdayUtcFromDateYmd,
} from "@/lib/dispatch/cleanerPreferenceMatch";

const job = (over: Partial<{ jobLocationId: string; jobServiceSlug: string | null; jobDateYmd: string; jobTimeHm: string }> = {}) => ({
  jobLocationId: "loc-1",
  jobServiceSlug: "standard" as string | null,
  jobDateYmd: "2026-06-01",
  jobTimeHm: "10:00",
  ...over,
});

describe("weekdayUtcFromDateYmd", () => {
  it("2026-06-01 is Monday (UTC)", () => {
    expect(weekdayUtcFromDateYmd("2026-06-01")).toBe(1);
  });
});

describe("jobMatchesPreferredTimeBlocks", () => {
  it("matches inclusive window on correct weekday", () => {
    const ok = jobMatchesPreferredTimeBlocks([{ day: 1, start: "09:00", end: "12:00" }], "2026-06-01", "10:00");
    expect(ok).toBe(true);
  });

  it("rejects wrong weekday", () => {
    const ok = jobMatchesPreferredTimeBlocks([{ day: 0, start: "09:00", end: "12:00" }], "2026-06-01", "10:00");
    expect(ok).toBe(false);
  });
});

describe("computePreferenceScore01", () => {
  it("returns 1 when all configured dimensions match", () => {
    const s = computePreferenceScore01(
      {
        preferred_areas: ["loc-1"],
        preferred_services: ["standard"],
        preferred_time_blocks: [{ day: 1, start: "09:00", end: "12:00" }],
        is_strict: false,
      },
      job(),
    );
    expect(s).toBe(1);
  });

  it("uses neutral 0.5 for empty dimension lists", () => {
    const s = computePreferenceScore01(
      {
        preferred_areas: ["loc-1"],
        preferred_services: [],
        preferred_time_blocks: [],
        is_strict: false,
      },
      job(),
    );
    expect(s).toBeCloseTo(0.4 * 1 + 0.3 * 0.5 + 0.3 * 0.5, 5);
  });
});

describe("cleanerPreferenceStrictExcludesJob", () => {
  it("strict ignores preferred_areas (eligibility uses cleaner_locations)", () => {
    expect(
      cleanerPreferenceStrictExcludesJob(
        {
          preferred_areas: ["other"],
          preferred_services: [],
          preferred_time_blocks: [],
          is_strict: true,
        },
        job(),
      ),
    ).toBe(false);
  });

  it("excludes when service mismatch in strict mode", () => {
    const x = cleanerPreferenceStrictExcludesJob(
      {
        preferred_areas: [],
        preferred_services: ["deep"],
        preferred_time_blocks: [],
        is_strict: true,
      },
      job({ jobServiceSlug: "standard" }),
    );
    expect(x).toBe(true);
  });

  it("does not exclude when strict but no preferences configured", () => {
    expect(
      cleanerPreferenceStrictExcludesJob(
        {
          preferred_areas: [],
          preferred_services: [],
          preferred_time_blocks: [],
          is_strict: true,
        },
        job(),
      ),
    ).toBe(false);
  });
});

describe("hasConfiguredPreferences", () => {
  it("false for empty row", () => {
    expect(hasConfiguredPreferences(null)).toBe(false);
    expect(
      hasConfiguredPreferences({
        preferred_areas: [],
        preferred_services: [],
        preferred_time_blocks: [],
        is_strict: false,
      }),
    ).toBe(false);
  });
});
