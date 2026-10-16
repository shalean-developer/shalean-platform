import { beforeEach, describe, expect, it, vi } from "vitest";
const { send } = vi.hoisted(() => ({ send: vi.fn() }));
vi.mock("@/lib/logging/systemLog", () => ({ logSystemEvent: vi.fn(), reportOperationalIssue: vi.fn() }));
vi.mock("@/lib/referrals/creditReservations", () => ({ releaseCleaningCreditForBooking: vi.fn(async () => ({ ok: true })) }));
vi.mock("@/lib/pay/paymentLinkEligibility", () => ({ checkPaymentLinkEligibility: vi.fn(async () => ({ allowed: true })),
  claimAutomaticPaymentReminder: vi.fn(), releaseAutomaticPaymentReminder: vi.fn() }));
vi.mock("@/lib/email/paymentRecoveryEmails", () => ({ sendPaymentRecoveryEmail: send,
  buildPaymentRecoveryEmailContext: () => ({ bookingId: "booking-1", to: "customer@example.com", serviceLabel: "Regular Cleaning" }) }));
import { processPaymentRecoveryJob } from "@/lib/booking/processPaymentRecoveryJob";
import { expirePendingPaymentTerminal } from "@/lib/booking/expirePendingPaymentTerminal";

function fixture() {
  type Row = Record<string, unknown>;
  const booking: Row = { id: "booking-1", status: "pending_payment", payment_status: "pending", payment_completed_at: null, paystack_reference: "bps_expiry" };
  const jobs: Row[] = [
    { id: "expiry", booking_id: "booking-1", job_type: "booking_payment_expired", customer_email: "customer@example.com", status: "pending", attempts: 0, sent_at: null },
    { id: "reminder", booking_id: "booking-1", job_type: "payment_reminder_1h", status: "pending", sent_at: null },
    { id: "other-booking", booking_id: "booking-2", status: "pending", sent_at: null },
  ];
  const admin = { from: (table: string) => {
    const filters: ((row: Row) => boolean)[] = []; let patch: Row | null = null;
    const apply = () => {
      const rows = (table === "bookings" ? [booking] : jobs).filter(row => filters.every(test => test(row)));
      if (patch) rows.forEach(row => Object.assign(row, patch));
      return rows.map(row => ({ ...row }));
    };
    const chain = { select: () => chain, update: (value: Row) => { patch = value; return chain; },
      eq: (key: string, value: unknown) => { filters.push(row => row[key] === value); return chain; },
      neq: (key: string, value: unknown) => { filters.push(row => row[key] !== value); return chain; },
      is: (key: string, value: unknown) => { filters.push(row => row[key] === value); return chain; },
      in: (key: string, values: unknown[]) => { filters.push(row => values.includes(row[key])); return chain; },
      maybeSingle: async () => ({ data: apply()[0] ?? null, error: null }),
      then: (resolve: (value: unknown) => unknown) => resolve({ data: apply(), error: null }),
    }; return chain;
  } } as never;
  return { admin, booking, jobs };
}
beforeEach(() => { send.mockReset(); send.mockResolvedValue({ sent: true }); });
describe("real expiry transition and recovery cancellation", () => {
  it("preserves the active expiry job through transition, checkpoints, and sends once", async () => {
    const { admin, booking, jobs } = fixture();
    send.mockImplementationOnce(async () => {
      expect(jobs[0]).toMatchObject({ status: "processing", last_error: "expiry_delivery_in_progress" });
      return { sent: true };
    });
    expect(await processPaymentRecoveryJob(admin, { id: "expiry", booking_id: "booking-1", job_type: "booking_payment_expired",
      customer_email: "customer@example.com", attempts: 0 })).toBe("sent");
    expect(booking.status).toBe("payment_expired");
    expect(jobs.map(job => job.status)).toEqual(["sent", "cancelled", "pending"]);
    expect(send).toHaveBeenCalledOnce();
    expect(await processPaymentRecoveryJob(admin, { id: "expiry", booking_id: "booking-1", job_type: "booking_payment_expired",
      customer_email: "customer@example.com", attempts: 0 })).toBe("skipped");
    expect(send).toHaveBeenCalledOnce();
  });
  it("preserves normal cancel-all behavior when no active recovery job is supplied", async () => {
    const { admin, jobs } = fixture();
    expect(await expirePendingPaymentTerminal(admin, { bookingId: "booking-1", reason: "expired" })).toMatchObject({ ok: true, transitioned: true });
    expect(jobs.map(job => job.status)).toEqual(["cancelled", "cancelled", "pending"]);
    expect(send).not.toHaveBeenCalled();
  });
});
