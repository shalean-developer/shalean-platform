import { beforeEach, describe, expect, it, vi } from "vitest";
const { notify, issue } = vi.hoisted(() => ({ notify: vi.fn(), issue: vi.fn() }));
vi.mock("@/lib/notifications/notifyBookingEvent", () => ({ notifyBookingEvent: notify }));
vi.mock("@/lib/logging/systemLog", () => ({ logSystemEvent: vi.fn(), reportOperationalIssue: issue }));
import { processPaymentConfirmationRetries } from "@/lib/notifications/paymentConfirmationRetry";

const payload = { bookingId: "11111111-1111-4111-8111-111111111111", paymentReference: "bps_paid", amountCents: 45800,
  customerEmail: "customer@example.com", snapshot: null };
function setup(options?: { readError?: boolean; invalid?: boolean; paid?: boolean; booking?: Record<string, unknown>; reviewFlag?: boolean }) {
  const updates: Record<string, unknown>[] = []; const deleted: string[] = [];
  const filters: string[] = [];
  const admin = { from: (table: string) => {
    const chain = { select: () => chain, eq: () => chain, order: () => chain, or: (filter: string) => { filters.push(filter); return chain; },
      limit: async () => ({ data: [{ id: "job-1", attempts: 2, payload: options?.invalid ? {} : { ...payload,
        ...(options?.reviewFlag ? { notification_manual_review_required: true } : {}) } }], error: null }),
      maybeSingle: async () => ({ data: { status: "pending", payment_status: options?.paid === false ? "pending" : "success", paystack_reference: "bps_paid", ...options?.booking },
        error: options?.readError ? { message: "database unavailable" } : null }),
      update: (patch: Record<string, unknown>) => { updates.push(patch); return chain; },
      delete: () => { deleted.push(table); return chain; },
      then: (resolve: (value: unknown) => unknown) => resolve({ error: null }),
    }; return chain;
  } } as never;
  return { admin, updates, deleted, filters };
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
    expect(offline.updates).toContainEqual(expect.objectContaining({ payload: expect.objectContaining({ notification_retry_at: expect.any(String) }) }));
    expect(offline.filters[0]).toContain("notification_retry_at.lte.");
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
  it("processes newer due work while five older confirmations are in backoff", async () => {
    const jobs = [...Array.from({ length: 5 }, (_, i) => ({ id: `old-${i}`, payload: { ...payload,
      notification_retry_at: new Date(Date.now() + 3600_000).toISOString() }, attempts: 3 })),
    { id: "new-job", payload, attempts: 0 }];
    const deleted: string[] = [];
    const admin = { from: (table: string) => {
      let dueOnly = false; let deleting = false;
      const chain = { select: () => chain, order: () => chain, or: () => { dueOnly = true; return chain; },
        eq: (_column: string, value: string) => { if (deleting) deleted.push(value); return chain; },
        limit: async (limit: number) => ({ data: jobs.filter(job => !dueOnly || !("notification_retry_at" in job.payload) ||
          Date.parse(String(job.payload.notification_retry_at)) <= Date.now()).slice(0, limit), error: null }),
        maybeSingle: async () => ({ data: { status: "pending", payment_status: "success", paystack_reference: "bps_paid" }, error: null }),
        delete: () => { deleting = table === "failed_jobs"; return chain; },
        then: (resolve: (value: unknown) => unknown) => resolve({ error: null }),
      }; return chain;
    } } as never;
    expect(await processPaymentConfirmationRetries(admin)).toMatchObject({ completed: 1, processed: 1 });
    expect(deleted).toEqual(["new-job"]); expect(notify).toHaveBeenCalledOnce();
  });
  it.each([
    { paid_at: "2026-10-16T12:00:00Z" }, { payment_completed_at: "2026-10-16T12:00:00Z" }, { amount_paid_cents: 45800 },
  ])("retains confirmation delivery for a historically settled booking: %s", async (evidence) => {
    const { admin } = setup({ booking: { status: "completed", payment_status: null, ...evidence } });
    expect(await processPaymentConfirmationRetries(admin)).toMatchObject({ completed: 1 });
    expect(notify).toHaveBeenCalledOnce();
  });
  it.each(["pending_payment", "payment_expired"])("does not turn anomalous cash into settlement for %s", async (status) => {
    const { admin } = setup({ booking: { status, payment_status: null, paid_at: "2026-10-16T12:00:00Z", amount_paid_cents: 45800 } });
    expect(await processPaymentConfirmationRetries(admin)).toMatchObject({ completed: 1 });
    expect(notify).not.toHaveBeenCalled();
  });
  it.each([false, true])("retains ambiguous claims and flags manual review once (already flagged=%s)", async (reviewFlag) => {
    notify.mockResolvedValue({ failed: true, dedupeSkipped: true, error: "customer_email_claim_pending" });
    const { admin, updates, deleted } = setup({ reviewFlag });
    expect(await processPaymentConfirmationRetries(admin)).toMatchObject({ retained: 1, completed: 0 });
    expect(deleted).toEqual([]);
    expect(updates).toContainEqual(expect.objectContaining({ payload: expect.objectContaining({ notification_manual_review_required: true }) }));
    if (!reviewFlag) expect(issue).toHaveBeenCalledWith("critical", "payment_confirmation_retry", expect.any(String), expect.anything());
    else expect(issue).not.toHaveBeenCalled();
  });
});
