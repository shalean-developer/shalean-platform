import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getEligibleCleaners } from "@/lib/booking/getEligibleCleaners";

const CLEANER_ID = "aaaaaaa1-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const BOOKING_ID = "bbbbbbb1-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const LOC_ID = "ccccccc1-cccc-4ccc-8ccc-cccccccccccc";
const DATE = "2026-06-20";

function buildAdminMock(): SupabaseClient {
  return {
    from(table: string) {
      if (table === "cleaners") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                in: () =>
                  Promise.resolve({
                    data: [
                      {
                        id: CLEANER_ID,
                        full_name: "Test Cleaner",
                        phone: null,
                        email: null,
                        rating: 5,
                        is_active: true,
                        is_available: true,
                        jobs_completed: 10,
                        review_count: 0,
                        location_id: LOC_ID,
                        status: "available",
                        availability_weekdays: [
                          "monday",
                          "tuesday",
                          "wednesday",
                          "thursday",
                          "friday",
                          "saturday",
                          "sunday",
                        ],
                        can_do_deep_cleaning: true,
                        can_do_move_cleaning: true,
                      },
                    ],
                    error: null,
                  }),
              }),
            }),
          }),
        } as unknown as ReturnType<SupabaseClient["from"]>;
      }
      if (table === "cleaner_availability") {
        return {
          select: () => ({
            eq: () => ({
              in: () => Promise.resolve({ data: [], error: null }),
            }),
          }),
        } as unknown as ReturnType<SupabaseClient["from"]>;
      }
      if (table === "cleaner_locations") {
        return {
          select: () => ({
            in: () =>
              Promise.resolve({
                data: [{ cleaner_id: CLEANER_ID, location_id: LOC_ID }],
                error: null,
              }),
          }),
        } as unknown as ReturnType<SupabaseClient["from"]>;
      }
      if (table === "bookings") {
        return {
          select: () => ({
            in: () => ({
              or: () =>
                Promise.resolve({
                  data: [
                    {
                      id: BOOKING_ID,
                      cleaner_id: CLEANER_ID,
                      selected_cleaner_id: CLEANER_ID,
                      status: "pending",
                      date: DATE,
                      time: "10:00",
                      duration_minutes: 120,
                    },
                  ],
                  error: null,
                }),
            }),
          }),
        } as unknown as ReturnType<SupabaseClient["from"]>;
      }
      if (table === "cleaner_preferences") {
        return {
          select: () => ({
            in: () => Promise.resolve({ data: [], error: null }),
          }),
        } as unknown as ReturnType<SupabaseClient["from"]>;
      }
      throw new Error(`unexpected table ${table}`);
    },
  } as unknown as SupabaseClient;
}

describe("getEligibleCleaners excludeBookingId", () => {
  it("ignores overlap from the booking being assigned when excludeBookingId is set", async () => {
    process.env.USE_STRICT_AVAILABILITY = "false";
    const admin = buildAdminMock();
    const params = {
      date: DATE,
      startTime: "10:00",
      durationMinutes: 120,
      locationId: LOC_ID,
      locationExpandedIds: [LOC_ID] as string[],
      cleanerIds: [CLEANER_ID],
      serviceType: "standard",
      limit: 5,
    };

    const withoutExclude = await getEligibleCleaners(admin, params);
    expect(withoutExclude).toHaveLength(0);

    const withExclude = await getEligibleCleaners(admin, { ...params, excludeBookingId: BOOKING_ID });
    expect(withExclude).toHaveLength(1);
    expect(withExclude[0]?.id).toBe(CLEANER_ID);
  });
});
