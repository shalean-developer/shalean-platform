import { afterEach, expect, it, vi } from "vitest";
import { submitPaystackTransferViaOutbox } from "@/lib/payout/paystackTransferExecutor";

const { cutoff } = vi.hoisted(() => ({ cutoff: vi.fn(async () => ({ ok: false, error: "historical cutoff", status: 409 })) }));
vi.mock("@/lib/payout/validateTransferProcessingCutoff", () => ({ validateTransferProcessingCutoff: cutoff }));
vi.mock("@/lib/payout/payoutAudit", () => ({ logPayoutAuditEvent: vi.fn() }));
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); cutoff.mockClear(); });

it.each(["submitted", "needs_reconcile"])("verifies an existing %s intent without a new POST even when historical", async (status) => {
  vi.stubEnv("PAYSTACK_SECRET_KEY", "sk_test_example");
  const fetchMock = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) => new Response(JSON.stringify({ status: true, data: { transfer_code: "TRF_existing", status: "pending" } }), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  const updates: string[] = [];
  const admin = { from(table: string) {
    const q = {
      select: () => q, eq: () => q, neq: () => q,
      update: () => { updates.push(table); return q; },
      maybeSingle: async () => ({ data: table === "payout_transfer_outbox" ? { id: "outbox", status, transfer_row_id: null, transfer_code: null, attempts: 1, reference: "existing-ref" } : null, error: null }),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: null, error: null }).then(resolve),
    };
    return q;
  } };
  const result = await submitPaystackTransferViaOutbox(admin as never, { rail: "cleaner_payout", subjectId: "historical", cleanerId: "cleaner", amountCents: 100, recipientCode: "recipient", reference: "existing-ref" });
  expect(result.ok).toBe(true);
  expect(result.needsReconcile).toBe(true);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: "GET" });
  expect(cutoff).not.toHaveBeenCalled();
  expect(updates).not.toContain("cleaner_payouts");
});

it.each([409, 500])("releases a ledger send lease on cutoff rejection %s without a provider request", async (status) => {
  cutoff.mockResolvedValueOnce({ ok: false, error: "cutoff unavailable or deferred", status });
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  const row = { id: "outbox", status: "pending", transfer_row_id: "transfer", transfer_code: null, attempts: 0, reference: "existing-ref" };
  const admin = { from(table: string) {
    let patch: Record<string, unknown> | null = null;
    const q = {
      select: () => q, eq: () => q, neq: () => q,
      update: (value: Record<string, unknown>) => { patch = value; return q; },
      maybeSingle: async () => {
        if (table !== "payout_transfer_outbox") return { data: null, error: null };
        if (patch) Object.assign(row, patch);
        return { data: { ...row }, error: null };
      },
    };
    return q;
  } };
  const result = await submitPaystackTransferViaOutbox(admin as never, { rail: "cleaner_earnings", subjectId: "disbursement", cleanerId: "cleaner", amountCents: 100, recipientCode: "recipient", reference: "existing-ref" });
  expect(result).toMatchObject({ ok: false, status, needsReconcile: true });
  expect(row.status).toBe(status === 409 ? "failed" : "pending");
  expect(row.attempts).toBe(1);
  expect(fetchMock).not.toHaveBeenCalled();
});
