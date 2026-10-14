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
