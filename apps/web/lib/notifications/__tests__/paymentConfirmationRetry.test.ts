import { beforeEach, describe, expect, it, vi } from "vitest";
const { notify } = vi.hoisted(() => ({ notify: vi.fn() }));
vi.mock("@/lib/notifications/notifyBookingEvent", () => ({ notifyBookingEvent: notify }));
vi.mock("@/lib/logging/systemLog", () => ({ logSystemEvent: vi.fn(), reportOperationalIssue: vi.fn() }));
import { processPaymentConfirmationRetries } from "@/lib/notifications/paymentConfirmationRetry";

const payload = { bookingId: "11111111-1111-4111-8111-111111111111", paymentReference: "bps_paid", amountCents: 45800,
  customerEmail: "customer@example.com", snapshot: null };
function setup(options?: { readError?: boolean; invalid?: boolean; paid?: boolean }) {
  const updates: Record<string, unknown>[] = []; const deleted: string[] = [];
  const admin = { from: (table: string) => {
    const chain = { select: () => chain, eq: () => chain, order: () => chain,
      limit: async () => ({ data: [{ id: "job-1", attempts: 2, payload: options?.invalid ? {} : payload }], error: null }),
      maybeSingle: async () => ({ data: { status: "pending", payment_status: options?.paid === false ? "pending" : "success", paystack_reference: "bps_paid" },
        error: options?.readError ? { message: "database unavailable" } : null }),
      update: (patch: Record<string, unknown>) => { updates.push(patch); return chain; },
      delete: () => { deleted.push(table); return chain; },
      then: (resolve: (value: unknown) => unknown) => resolve({ error: null }),
    }; return chain;
  } } as never;
  return { admin, updates, deleted };
}
beforeEach(() => { vi.clearAllMocks(); notify.mockResolvedValue({ failed: false, customerEmailSent: true, dedupeSkipped: false }); });
describe("durable payment confirmation recovery", () => {
  it("replays only notification work and completes the job after delivery", async () => {
    const { admin, deleted } = setup();
    expect(await processPaymentConfirmationRetries(admin)).toMatchObject({ completed: 1, retained: 0 });
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ ...payload, type: "payment_confirmed", confirmationRetry: true, supabase: admin }));
    expect(deleted).toEqual(["failed_jobs"]);
  });
  it("retains failed enrichment and delivery jobs for later recovery", async () => {
    const offline = setup({ readError: true });
    expect(await processPaymentConfirmationRetries(offline.admin)).toMatchObject({ retained: 1, completed: 0 });
    expect(notify).not.toHaveBeenCalled(); expect(offline.deleted).toEqual([]);
    expect(offline.updates).toContainEqual(expect.objectContaining({ attempts: 3 }));
    notify.mockResolvedValueOnce({ failed: true, error: "provider unavailable" });
    expect(await processPaymentConfirmationRetries(setup().admin)).toMatchObject({ retained: 1, completed: 0 });
  });
  it("retires stale payment confirmations without contacting a provider", async () => {
    const { admin, deleted } = setup({ paid: false });
    expect(await processPaymentConfirmationRetries(admin)).toMatchObject({ completed: 1 });
    expect(notify).not.toHaveBeenCalled(); expect(deleted).toEqual(["failed_jobs"]);
  });
  it("quarantines malformed work rather than replaying it", async () => {
    const { admin, updates } = setup({ invalid: true });
    expect(await processPaymentConfirmationRetries(admin)).toMatchObject({ errors: 1 });
    expect(updates).toContainEqual({ type: "payment_confirmation_notification_invalid_payload" });
    expect(notify).not.toHaveBeenCalled();
  });
});
