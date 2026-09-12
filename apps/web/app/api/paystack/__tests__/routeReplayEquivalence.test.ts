import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import crypto from "crypto";
const m = vi.hoisted(() => ({
  admin: vi.fn(), replay: vi.fn(), record: vi.fn(), sync: vi.fn(), pipeline: vi.fn(), finalize: vi.fn(),
  monthly: vi.fn(), sales: vi.fn(), monthlyRecord: vi.fn(), salesRecord: vi.fn(),
}));
vi.mock("@/lib/supabase/admin", () => ({ getSupabaseAdmin: m.admin }));
vi.mock("@/lib/booking/paystackReplayPaymentConfirmedNotify", () => ({ replayPaymentConfirmedNotifyForPersistedBooking: m.replay }));
vi.mock("@/lib/booking/syncPaidBookingSideEffects", () => ({ syncPaidBookingSideEffects: m.sync }));
vi.mock("@/lib/payments/recordPaystackSettlement", () => ({
  paystackChargeDataFromRecord: (x: unknown) => x, recordPaystackBookingPayment: m.record,
  recordPaystackMonthlyInvoicePayment: m.monthlyRecord, recordPaystackSalesDocumentPayment: m.salesRecord,
}));
vi.mock("@/lib/booking/runPaystackVerifyFinalizePipeline", () => ({ runPaystackVerifyFinalizePipeline: m.pipeline }));
vi.mock("@/lib/booking/bookingOperations", () => ({ finalizePaidBooking: m.finalize, upsertResultFromFinalizePaidBookingOp: (x: unknown) => x }));
vi.mock("@/lib/booking/routePaystackChargeForMonthlyInvoice", () => ({
  routePaystackChargeForMonthlyInvoice: m.monthly,
  shouldShortCircuitForMonthlyInvoice: (x: { kind: string }) => x.kind === "monthly_settled" || x.kind === "monthly_already_processed",
}));
vi.mock("@/lib/salesDocument/routePaystackChargeForSalesDocument", () => ({
  routePaystackChargeForSalesDocument: m.sales,
  shouldShortCircuitForSalesDocument: (x: { kind: string }) => x.kind === "sales_doc_settled" || x.kind === "sales_doc_already_processed",
}));
vi.mock("@/lib/booking/loadBookingReference", () => ({ loadBookingReferenceForId: vi.fn().mockResolvedValue("SHL-BK-TEST") }));
vi.mock("@/lib/logging/systemLog", () => ({ logSystemEvent: vi.fn(), reportOperationalIssue: vi.fn() }));
vi.mock("@/lib/observability/paymentStructuredLog", () => ({ logPaymentStructured: vi.fn() }));
vi.mock("@/lib/rateLimit/paystackVerifyIpLimit", () => ({ allowPaystackVerifyRequest: () => true, paystackVerifyRateLimitKey: () => "test" }));
vi.mock("@/lib/booking/enqueuePaystackRecoveryFailedJobs", () => ({ enqueuePaystackRecoveryFailedJobs: vi.fn() }));
vi.mock("@/lib/ops/dispatchControlWebhook", () => ({ postDispatchControlAlert: vi.fn() }));
vi.mock("@/lib/payments/routePaystackRefundEvent", () => ({ routeSuccessfulPaystackRefund: vi.fn() }));
import { GET, POST } from "../verify/route";
import { POST as webhook } from "../webhook/route";
import { resetBookingOwnershipColumnCacheForTests } from "@/lib/customer/customerBookingsForUser";
import { provePersistedPaystackReplay } from "@/lib/booking/provePersistedPaystackReplay";

const id = "00000000-0000-4000-8000-000000000001";
const owner = "00000000-0000-4000-8000-000000000002";
const other = "00000000-0000-4000-8000-000000000003";
let row: Record<string, unknown>;
let tx: { status: string; reference: string; amount: number; currency: string; customer: { email: string }; metadata: Record<string, string> };
let fetchMock: ReturnType<typeof vi.fn>;
let reads: string[];
let rpcOwner: string | null;
let lookupError: boolean;
let ownershipColumn: "customer_id" | "user_id";
const secret = "test-only-paystack-signing-key";
beforeEach(() => {
  vi.clearAllMocks(); resetBookingOwnershipColumnCacheForTests();
  ownershipColumn = "customer_id"; lookupError = false; rpcOwner = null; reads = [];
  row = { id, status: "pending", paystack_reference: "pay_current", customer_email: "payer@example.com", customer_id: owner, payment_status: "success", amount_paid_cents: 12550 };
  tx = { status: "success", reference: "pay_current", amount: 12550, currency: "ZAR", customer: { email: "payer@example.com" }, metadata: { booking_id: id, user_id: owner } };
  m.admin.mockReturnValue({
    rpc: vi.fn(async () => ({ data: rpcOwner, error: null })),
    from: () => {
      let columns = "";
      const q = {
        select: (s: string) => { columns = s; return q; }, eq: () => q,
        limit: async () => ({ data: [], error: ownershipColumn === "user_id" && columns === "customer_id" ? { code: "42703", message: 'column "customer_id" does not exist' } : null }),
        maybeSingle: async () => {
          reads.push(columns);
          return { data: { ...row }, error: lookupError && columns.includes("customer_email") ? { message: "read failed" } : null };
        },
      }; return q;
    },
  });
  m.monthly.mockResolvedValue({ kind: "not_monthly" }); m.sales.mockResolvedValue({ kind: "not_sales_doc" });
  m.finalize.mockResolvedValue({ ok: false, skipped: false, bookingId: null, error: "test pending finalization" });
  m.pipeline.mockResolvedValue({ result: { ok: false, bookingId: null, error: "test pending finalization" }, metadata: {}, snapshot: null, ref: tx.reference, amount: tx.amount, currency: "ZAR", email: tx.customer.email });
  fetchMock = vi.fn(async () => ({ json: async () => ({ status: true, data: tx }) }));
  vi.stubGlobal("fetch", fetchMock); vi.stubEnv("PAYSTACK_SECRET_KEY", secret);
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
async function call(mode: "GET" | "POST" | "webhook") {
  if (mode === "GET") return GET(new Request("http://localhost/api/paystack/verify?reference=pay_current"));
  if (mode === "POST") return POST(new Request("http://localhost/api/paystack/verify", { method: "POST", body: JSON.stringify({ reference: "pay_current", customerEmail: "untrusted@example.com", user_id: other }) }));
  const body = JSON.stringify({ event: "charge.success", data: tx });
  return webhook(new Request("http://localhost/api/paystack/webhook", { method: "POST", body, headers: { "x-paystack-signature": crypto.createHmac("sha512", secret).update(body).digest("hex") } }));
}
function noSuccess() {
  expect(m.replay).not.toHaveBeenCalled(); expect(m.record).not.toHaveBeenCalled(); expect(m.sync).not.toHaveBeenCalled();
  expect(m.pipeline).not.toHaveBeenCalled(); expect(m.finalize).not.toHaveBeenCalled();
}
for (const mode of ["GET", "POST", "webhook"] as const) {
  describe(mode + " actual replay shortcut", () => {
    it("allows equivalent replay using verified identity only", async () => {
      const response = await call(mode); const data = await response.json();
      expect(response.status).toBe(200);
      if (mode !== "webhook") expect(data).toMatchObject({ ok: true, state: "already_processed" });
      expect(m.replay).toHaveBeenCalledTimes(1); expect(m.record).toHaveBeenCalledTimes(1);
      expect(m.sync).toHaveBeenCalledTimes(mode === "webhook" ? 1 : 0);
      expect(m.pipeline).not.toHaveBeenCalled(); expect(m.finalize).not.toHaveBeenCalled();
      expect(reads).toContain("id, status, paystack_reference, customer_email, customer_id");
    });
    it.each(["email", "owner", "booking", "reference", "missing email", "missing owner", "read error"])("rejects %s before all success effects", async (conflict) => {
      if (conflict === "email") tx.customer.email = "other@example.com";
      if (conflict === "owner") tx.metadata.user_id = other;
      if (conflict === "booking") tx.metadata.booking_id = other;
      if (conflict === "reference") row.paystack_reference = "pay_stale";
      if (conflict === "missing email") tx.customer.email = "";
      if (conflict === "missing owner") delete tx.metadata.user_id;
      if (conflict === "read error") lookupError = true;
      const response = await call(mode);
      expect(await response.json()).toMatchObject({ ok: false, error: "PAYMENT_FINALIZATION_REPLAY_MISMATCH" });
      expect(response.status).toBe(mode === "webhook" ? 200 : 409); noSuccess();
    });
    it("keeps monthly routing ahead of booking proof", async () => {
      m.monthly.mockResolvedValue({ kind: "monthly_settled", settled: "full", invoiceId: id });
      await call(mode); expect(m.monthlyRecord).toHaveBeenCalled(); expect(m.sales).not.toHaveBeenCalled();
      expect(reads.some((x) => x.includes("customer_email"))).toBe(false); noSuccess();
    });
    it("keeps sales routing ahead of booking proof", async () => {
      m.sales.mockResolvedValue({ kind: "sales_doc_settled", documentId: id });
      await call(mode); expect(m.salesRecord).toHaveBeenCalled(); expect(m.monthly).toHaveBeenCalled();
      expect(reads.some((x) => x.includes("customer_email"))).toBe(false); noSuccess();
    });
    it("passes pending payment to canonical finalization", async () => {
      row.status = "pending_payment"; row.payment_status = "pending";
      await call(mode); expect(mode === "webhook" ? m.finalize : m.pipeline).toHaveBeenCalledTimes(1);
      expect(m.replay).not.toHaveBeenCalled(); expect(m.record).not.toHaveBeenCalled(); expect(m.sync).not.toHaveBeenCalled();
    });
  });
}
describe("POST exact-zero pre-verification gate", () => {
  it.each(["success", "paid"])("preserves %s with numeric zero", async (status) => {
    row.payment_status = status; row.amount_paid_cents = 0;
    expect(await (await call("POST")).json()).toMatchObject({ ok: true, state: "already_processed", amountCents: 0 });
    expect(fetchMock).not.toHaveBeenCalled(); noSuccess();
  });
  it.each([12550, -1, null, undefined, "0", NaN, Infinity, 0.5])("verifies remotely for unproven zero %s", async (amount) => {
    row.amount_paid_cents = amount; if (amount === undefined) delete row.amount_paid_cents;
    await call("POST"); expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
describe("shared route proof canonical ownership resolution", () => {
  it("uses legacy user_id projection when resolved", async () => {
    ownershipColumn = "user_id"; delete row.customer_id; row.user_id = owner;
    expect(await provePersistedPaystackReplay({ supabase: m.admin(), bookingId: id, reference: tx.reference, amountCents: tx.amount, customerEmail: tx.customer.email, metadata: tx.metadata })).toBe(true);
    expect(reads).toContain("id, status, paystack_reference, customer_email, user_id");
  });
  it("uses canonical email-to-auth fallback", async () => {
    delete tx.metadata.user_id; rpcOwner = owner;
    expect(await provePersistedPaystackReplay({ supabase: m.admin(), bookingId: id, reference: tx.reference, amountCents: tx.amount, customerEmail: tx.customer.email, metadata: tx.metadata })).toBe(true);
    expect(m.admin().rpc).toHaveBeenCalledWith("resolve_auth_user_id_by_email", { p_email: "payer@example.com" });
  });
});

for (const mode of ["GET", "POST"] as const) {
  describe(mode + " canonical booking response boundary", () => {
    it.each([
      { ok: false, error: "PAYMENT_FINALIZATION_REPLAY_MISMATCH", code: "PAYMENT_FINALIZATION_REPLAY_MISMATCH" },
      { ok: false, error: "PAYMENT_FINALIZATION_CONFLICT" },
      { ok: true, error: "PAYMENT_CUSTOMER_IDENTITY_MISMATCH" },
      { ok: false },
      { ok: false, error: "amount mismatch", reason: "amount_mismatch" },
    ])("rejects failed finalization despite an existing booking: %j", async (failure) => {
      row.status = "pending_payment"; row.payment_status = "pending";
      m.pipeline.mockResolvedValue({ result: { ...failure, bookingId: id, bookingInDatabase: true, skipped: true }, ref: tx.reference });
      const response = await call(mode); const data = await response.json();
      expect(response.status).toBe(409);
      expect(data).toMatchObject({ ok: false, success: false, paymentStatus: "success", bookingId: id,
        alreadyExists: false, upsertError: failure.error || "PAYMENT_FINALIZATION_FAILED",
        state: "reason" in failure ? "payment_mismatch" : "payment_reconciliation_required" });
      if ("code" in failure) expect(data.code).toBe(failure.code);
      if ("reason" in failure) expect(data.reason).toBe(failure.reason);
      // Existing clients require response.ok and success/ok before navigating or confirming.
      expect(response.ok && data.success === true && data.ok === true).toBe(false);
      expect(m.replay).not.toHaveBeenCalled(); expect(m.record).not.toHaveBeenCalled(); expect(m.sync).not.toHaveBeenCalled();
      expect(m.pipeline).toHaveBeenCalledTimes(1);
    });
    it("preserves successful equivalent replay returned by canonical finalization", async () => {
      row.status = "pending_payment"; row.payment_status = "pending";
      m.pipeline.mockResolvedValue({ result: { ok: true, bookingId: id, bookingInDatabase: true, skipped: true },
        metadata: {}, snapshot: null, ref: tx.reference, amount: tx.amount, currency: "ZAR", email: tx.customer.email });
      const response = await call(mode);
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ ok: true, success: true, bookingId: id, state: "paid", upsertError: null });
    });
  });
}


describe("POST raw R0 status authority", () => {
  it.each(["SUCCESS", "Paid", " PAID ", " success ", null, undefined, 123, true, "pending"])(
    "continues to gateway verification for non-exact status %s", async (status) => {
      row.payment_status = status; row.amount_paid_cents = 0;
      if (status === undefined) delete row.payment_status;
      await call("POST");
      expect(fetchMock).toHaveBeenCalledTimes(1);
    },
  );
});

for (const mode of ["GET", "POST", "webhook"] as const) {
  describe(mode + " canonical replay email fallback", () => {
    it.each(["   ", ""])("uses matching metadata when gateway email is blank: %j", async (email) => {
      tx.customer.email = email; tx.metadata.customer_email = " Payer@Example.com ";
      const response = await call(mode);
      expect(response.status).toBe(200);
      const body = await response.json();
      if (mode !== "webhook") expect(body).toMatchObject({ ok: true, state: "already_processed" });
      expect(m.replay).toHaveBeenCalledTimes(1); expect(m.record).toHaveBeenCalledTimes(1);
      expect(m.sync).toHaveBeenCalledTimes(mode === "webhook" ? 1 : 0);
    });
    it("prefers a usable gateway email over conflicting metadata", async () => {
      tx.customer.email = " Payer@Example.com "; tx.metadata.customer_email = "other@example.com";
      const response = await call(mode);
      expect(response.status).toBe(200);
      expect(m.replay).toHaveBeenCalledTimes(1); expect(m.record).toHaveBeenCalledTimes(1);
    });
    it.each([undefined, "   ", "other@example.com"])("rejects absent or conflicting metadata proof: %s", async (email) => {
      tx.customer.email = "   ";
      if (email === undefined) delete tx.metadata.customer_email;
      else tx.metadata.customer_email = email;
      const response = await call(mode);
      expect(response.status).toBe(mode === "webhook" ? 200 : 409);
      expect(await response.json()).toMatchObject({ ok: false, error: "PAYMENT_FINALIZATION_REPLAY_MISMATCH" });
      noSuccess();
    });
  });
}
