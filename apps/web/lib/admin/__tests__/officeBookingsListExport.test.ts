import { describe, expect, it } from "vitest";
import { buildOfficeBookingsListCsv } from "@/lib/admin/officeBookingsListExport";

describe("buildOfficeBookingsListCsv", () => {
  it("includes assignment and amount columns", () => {
    const csv = buildOfficeBookingsListCsv([
      {
        id: "abc-123",
        customer_name: "Jane Doe",
        customer_email: "jane@example.com",
        service: "Standard Cleaning",
        service_slug: "standard",
        date: "2026-07-04",
        time: "09:00:00",
        location: "Cape Town",
        total_paid_zar: 475,
        amount_paid_cents: null,
        status: "assigned",
        booking_cleaners: [{ cleaner_id: "c1", full_name: "Alex Cleaner", role: "primary" }],
      },
    ]);

    expect(csv).toContain("id,customer_name,customer_email,service,date,time,location,assignment,amount_zar,status");
    expect(csv).toContain("abc-123");
    expect(csv).toContain("Alex Cleaner");
    expect(csv).toContain("475");
    expect(csv).toContain("assigned");
  });
});
