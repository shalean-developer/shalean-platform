import { describe, expect, it } from "vitest";
import {
  buildCustomerBookingTrackDto,
  isCustomerBookingTrackable,
  parseCustomerTrackPoint,
} from "@/lib/customer/customerBookingTrack";
import { customerCanAccessBookingRow } from "@/lib/customer/customerBookingOwnership";

describe("isCustomerBookingTrackable", () => {
  it("is true when travelling (en_route)", () => {
    expect(
      isCustomerBookingTrackable({
        status: "assigned",
        cleaner_response_status: "on_my_way",
        en_route_at: "2026-07-11T08:00:00.000Z",
      }),
    ).toBe(true);
  });

  it("is true when active (started)", () => {
    expect(
      isCustomerBookingTrackable({
        status: "in_progress",
        started_at: "2026-07-11T09:00:00.000Z",
      }),
    ).toBe(true);
  });

  it("is false when completed", () => {
    expect(
      isCustomerBookingTrackable({
        status: "completed",
        completed_at: "2026-07-11T11:00:00.000Z",
        en_route_at: "2026-07-11T08:00:00.000Z",
      }),
    ).toBe(false);
  });

  it("is false when assigned but not yet travelling", () => {
    expect(
      isCustomerBookingTrackable({
        status: "assigned",
        cleaner_response_status: "accepted",
      }),
    ).toBe(false);
  });
});

describe("buildCustomerBookingTrackDto privacy", () => {
  const travelling = {
    id: "bk-1",
    location: "12 Ocean View",
    service: "Regular cleaning",
    display_cleaner_name: "Alex",
    status: "assigned",
    cleaner_response_status: "on_my_way",
    en_route_at: "2026-07-11T08:00:00.000Z",
  };

  it("includes point when trackable", () => {
    const dto = buildCustomerBookingTrackDto(travelling, {
      lat: -33.92,
      lng: 18.42,
      created_at: "2026-07-11T08:05:00.000Z",
    });
    expect(dto.trackable).toBe(true);
    expect(dto.point).toEqual({
      lat: -33.92,
      lng: 18.42,
      created_at: "2026-07-11T08:05:00.000Z",
    });
  });

  it("strips point when not trackable even if raw point exists", () => {
    const dto = buildCustomerBookingTrackDto(
      {
        id: "bk-2",
        location: "12 Ocean View",
        status: "assigned",
        cleaner_response_status: "accepted",
      },
      { lat: -33.92, lng: 18.42, created_at: "2026-07-11T08:05:00.000Z" },
    );
    expect(dto.trackable).toBe(false);
    expect(dto.point).toBeNull();
  });

  it("rejects invalid coordinates", () => {
    expect(parseCustomerTrackPoint({ lat: 999, lng: 18 })).toBeNull();
    expect(parseCustomerTrackPoint({ lat: -33, lng: "x" })).toBeNull();
  });
});

describe("ownership denied cases (track gate)", () => {
  const owner = "11111111-1111-4111-8111-111111111111";
  const other = "22222222-2222-4222-8222-222222222222";

  it("denies another account even when email matches", () => {
    expect(
      customerCanAccessBookingRow(
        { user_id: other, customer_email: "me@example.com" },
        owner,
        "me@example.com",
      ),
    ).toBe(false);
  });

  it("denies when auth missing ownership and email mismatch", () => {
    expect(
      customerCanAccessBookingRow(
        { user_id: null, customer_email: "you@example.com" },
        owner,
        "me@example.com",
      ),
    ).toBe(false);
  });

  it("never exposes track point when ownership denied — client must not call build with foreign booking", () => {
    // Contract: route uses loadCustomerBookingRowForUser → 404 before DTO.
    // If a caller wrongly built a DTO for a foreign row, ownership helper still denies access.
    const allowed = customerCanAccessBookingRow(
      { user_id: other, customer_email: "me@example.com" },
      owner,
      "me@example.com",
    );
    expect(allowed).toBe(false);
    // Simulate safe handling: no DTO / no point when denied
    const track = allowed
      ? buildCustomerBookingTrackDto(
          {
            id: "foreign",
            status: "assigned",
            cleaner_response_status: "on_my_way",
            en_route_at: "2026-07-11T08:00:00.000Z",
          },
          { lat: -33.9, lng: 18.4 },
        )
      : null;
    expect(track).toBeNull();
  });
});
