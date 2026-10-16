import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/logging/systemLog", () => ({ reportOperationalIssue: vi.fn() }));
import { insertCustomerUserNotification, notifyCustomerBookingPlaced } from "@/lib/notifications/customerUserNotifications";
const userId = "11111111-1111-4111-8111-111111111111";
const bookingId = "22222222-2222-4222-8222-222222222222";
const input = { userId, bookingId, serviceLabel: "Regular Cleaning", dateYmd: "2026-10-18", timeHm: "09:00" };
function admin(error: { code?: string; message: string } | null) {
  return { from: () => ({ insert: async () => ({ error }) }) } as never;
}
describe("customer in-app confirmation persistence", () => {
  it("propagates real Supabase insert failures to confirmation recovery", async () => {
    await expect(notifyCustomerBookingPlaced(admin({ message: "database offline" }), input)).rejects.toThrow("customer_notification_insert_failed");
  });
  it("treats a duplicate persisted confirmation as success", async () => {
    await expect(notifyCustomerBookingPlaced(admin({ code: "23505", message: "already exists" }), input)).resolves.toBeUndefined();
  });
  it("accepts a successfully persisted confirmation", async () => {
    await expect(notifyCustomerBookingPlaced(admin(null), input)).resolves.toBeUndefined();
  });
  it("preserves soft-failure behavior for other notification callers", async () => {
    await expect(insertCustomerUserNotification(admin({ message: "database offline" }), { userId, bookingId, title: "Update", body: "Update" })).resolves.toBeUndefined();
  });
});
