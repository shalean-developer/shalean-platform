import { beforeEach, describe, expect, it, vi } from "vitest";
import { CLEANER_RESPONSE } from "@/lib/dispatch/cleanerResponseStatus";
import { performAdminDirectAssignToCleaner } from "@/lib/admin/performAdminDirectAssignToCleaner";

vi.mock("@/lib/logging/systemLog", () => ({
  logSystemEvent: vi.fn(),
}));

vi.mock("@/lib/booking/verifyBookingAssignment", () => ({
  logAssignmentSuccess: vi.fn(),
}));

vi.mock("@/lib/cleaner/syncCleanerStatus", () => ({
  syncCleanerBusyFromBookings: vi.fn(async () => undefined),
}));

vi.mock("@/lib/admin/triggerAssignmentEarningsSnapshot", () => ({
  triggerAssignmentEarningsSnapshotForBooking: vi.fn(async () => undefined),
}));

vi.mock("@/lib/dispatch/notifyCleanerAssigned", () => ({
  notifyCleanerAssignedBooking: vi.fn(async () => undefined),
}));

vi.mock("@/lib/marketplace-intelligence/marketplaceBookingMeta", () => ({
  marketplaceBookingPatchOnAssign: vi.fn(async () => ({
    marketplace_cluster_id: null,
    marketplace_forecast_demand: null,
  })),
}));

const bookingId = "cc194491-5e9f-47d8-bab1-7b0b9a68394d";
const cleanerId = "04d5ae12-5f78-464b-92c8-46d61df5b5cd";

function createMockAdmin(booking: Record<string, unknown>) {
  const bookingUpdates: unknown[] = [];
  const offerUpdates: unknown[] = [];

  const admin = {
    from: vi.fn((table: string) => {
      if (table === "bookings") {
        let mode: "read" | "workload" | "meta" | "update" = "read";
        const chain: Record<string, unknown> = {};
        const self = () => chain;
        chain.select = (...args: unknown[]) => {
          const fields = String(args[0] ?? "");
          if (fields.includes("payout_owner_cleaner_id")) mode = "workload";
          else if (fields.includes("assignment_type")) mode = "meta";
          else mode = "read";
          return chain;
        };
        chain.eq = self;
        chain.neq = () => Promise.resolve({ data: [], error: null });
        chain.maybeSingle = () => {
          if (mode === "meta") {
            return Promise.resolve({
              data: {
                date: booking.date,
                time: booking.time,
                location_id: booking.location_id,
                city_id: booking.city_id,
                assignment_type: booking.assignment_type,
                selected_cleaner_id: booking.selected_cleaner_id,
              },
              error: null,
            });
          }
          return Promise.resolve({ data: booking, error: null });
        };
        chain.update = (patch: unknown) => {
          bookingUpdates.push(patch);
          return { eq: () => Promise.resolve({ error: null }) };
        };
        return chain;
      }
      if (table === "cleaners") {
        const chain: Record<string, unknown> = {};
        const self = () => chain;
        chain.select = self;
        chain.eq = self;
        chain.maybeSingle = () =>
          Promise.resolve({
            data: { id: cleanerId, status: "available", city_id: booking.city_id, is_available: true },
            error: null,
          });
        return chain;
      }
      if (table === "dispatch_offers") {
        const chain: Record<string, unknown> = {};
        chain.update = (patch: unknown) => {
          offerUpdates.push(patch);
          return {
            eq: () => ({
              eq: () => Promise.resolve({ error: null }),
            }),
          };
        };
        return chain;
      }
      throw new Error(`unexpected table ${table}`);
    }),
  };

  return { admin, bookingUpdates, offerUpdates };
}

vi.mock("@/lib/booking/getEligibleCleaners", () => ({
  getEligibleCleaners: vi.fn(async () => [{ id: cleanerId }]),
}));

describe("performAdminDirectAssignToCleaner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns alreadyAssigned when same cleaner is assigned and acceptance is complete", async () => {
    const { admin } = createMockAdmin({
      id: bookingId,
      date: "2026-07-06",
      time: "07:30",
      status: "assigned",
      cleaner_id: cleanerId,
      city_id: "city-1",
      dispatch_status: "assigned",
      duration_minutes: 180,
      location_id: "loc-1",
      service_slug: "standard",
      service: "Standard Cleaning",
      cleaner_response_status: CLEANER_RESPONSE.ACCEPTED,
      accepted_at: "2026-07-05T19:05:46.701+00:00",
    });

    const result = await performAdminDirectAssignToCleaner(admin as never, {
      bookingId,
      cleanerId,
      force: false,
    });

    expect(result).toMatchObject({ ok: true, cleanerId, alreadyAssigned: true });
  });

  it("confirms acceptance when same cleaner is assigned but never accepted (offer expired)", async () => {
    const { admin, bookingUpdates } = createMockAdmin({
      id: bookingId,
      date: "2026-07-06",
      time: "07:30",
      status: "assigned",
      cleaner_id: cleanerId,
      city_id: "city-1",
      dispatch_status: "assigned",
      duration_minutes: 180,
      location_id: "loc-1",
      service_slug: "standard",
      service: "Standard Cleaning",
      assignment_type: "user_selected",
      selected_cleaner_id: cleanerId,
      cleaner_response_status: CLEANER_RESPONSE.PENDING,
      accepted_at: null,
    });

    const result = await performAdminDirectAssignToCleaner(admin as never, {
      bookingId,
      cleanerId,
      force: false,
    });

    expect(result).toMatchObject({ ok: true, cleanerId });
    expect(result.ok && "alreadyAssigned" in result ? result.alreadyAssigned : undefined).toBeUndefined();
    expect(bookingUpdates.length).toBeGreaterThan(0);
    expect(bookingUpdates[0]).toMatchObject({
      cleaner_id: cleanerId,
      cleaner_response_status: CLEANER_RESPONSE.ACCEPTED,
      status: "assigned",
    });
  });
});
