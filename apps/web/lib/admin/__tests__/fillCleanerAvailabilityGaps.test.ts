import { afterEach, describe, expect, it, vi } from "vitest";

import { fillCleanerAvailabilityGapsFromLegacyColumns } from "@/lib/admin/fillCleanerAvailabilityGaps";

type CleanerRow = {
  id: string;
  availability_start: string;
  availability_end: string;
  availability_weekdays: unknown;
};

function createAdmin(cleaners: CleanerRow[]) {
  const insertedRows: Array<Record<string, unknown>> = [];
  const checkedDates: string[] = [];

  const from = vi.fn((table: string) => {
    if (table === "cleaners") {
      const builder = {
        select: vi.fn(() => builder),
        not: vi.fn(() => builder),
        then: (resolve: (value: unknown) => unknown) => resolve({ data: cleaners, error: null }),
      };
      return builder;
    }

    if (table === "cleaner_availability") {
      return {
        select: vi.fn(() => {
          const filters: Record<string, string> = {};
          const query = {
            eq: vi.fn((column: string, value: string) => {
              filters[column] = value;
              return query;
            }),
            then: (resolve: (value: unknown) => unknown) => {
              checkedDates.push(filters.date);
              return resolve({ count: 0 });
            },
          };
          return query;
        }),
        insert: vi.fn(async (row: Record<string, unknown>) => {
          insertedRows.push(row);
          return { error: null };
        }),
      };
    }

    throw new Error(`Unexpected table: ${table}`);
  });

  return { admin: { from }, checkedDates, insertedRows };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("fillCleanerAvailabilityGapsFromLegacyColumns", () => {
  it("generates rows only on the cleaner's stored weekdays", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-14T08:00:00.000Z")); // Monday
    const { admin, checkedDates, insertedRows } = createAdmin([
      {
        id: "cleaner-1",
        availability_start: "08:00:00",
        availability_end: "17:00:00",
        availability_weekdays: ["mon", "wed"],
      },
    ]);

    const result = await fillCleanerAvailabilityGapsFromLegacyColumns(admin as never, 7);

    expect(checkedDates).toEqual(["2026-09-14", "2026-09-16"]);
    expect(insertedRows.map((row) => row.date)).toEqual(["2026-09-14", "2026-09-16"]);
    expect(result).toEqual({ inserted: 2 });
  });

  it.each([null, [], ["monday"], "mon"])(
    "does not synthesize availability when weekdays are missing or invalid: %j",
    async (availabilityWeekdays) => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-09-14T08:00:00.000Z"));
      const { admin, checkedDates, insertedRows } = createAdmin([
        {
          id: "cleaner-1",
          availability_start: "08:00:00",
          availability_end: "17:00:00",
          availability_weekdays: availabilityWeekdays,
        },
      ]);

      await expect(
        fillCleanerAvailabilityGapsFromLegacyColumns(admin as never, 7),
      ).resolves.toEqual({ inserted: 0 });
      expect(checkedDates).toEqual([]);
      expect(insertedRows).toEqual([]);
    },
  );
});
