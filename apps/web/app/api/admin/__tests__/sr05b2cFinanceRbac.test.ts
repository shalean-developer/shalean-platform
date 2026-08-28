import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

vi.mock("@/lib/auth/requireAdminApi", () => ({
  requireAdminApi: vi.fn(),
}));
vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: vi.fn(),
}));
vi.mock("@/lib/payments/backfillPaystackPaymentTransactions", () => ({
  backfillPaystackPaymentTransactions: vi.fn(),
  countMissingPaystackPaymentTransactions: vi.fn(),
}));
vi.mock("@/lib/admin/payments/loadPaymentReconciliation", () => ({
  loadPaymentReconciliation: vi.fn(),
}));
vi.mock("@/lib/admin/logAdminEarningsAction", () => ({
  logAdminEarningsAction: vi.fn(async () => undefined),
}));

import { GET as reconciliationGET } from "@/app/api/admin/payment-reconciliation/route";
import { POST as backfillPOST } from "@/app/api/admin/payments/backfill-paystack/route";
import { PATCH as disputePATCH } from "@/app/api/admin/cleaner-earnings-disputes/[id]/route";
import { loadPaymentReconciliation } from "@/lib/admin/payments/loadPaymentReconciliation";
import { requireAdminApi } from "@/lib/auth/requireAdminApi";
import {
  backfillPaystackPaymentTransactions,
} from "@/lib/payments/backfillPaystackPaymentTransactions";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const OK_AUTH = {
  ok: true as const,
  userId: "00000000-0000-4000-8000-0000000000aa",
  email: "finance@shalean.test",
};
const DENIED_AUTH = { ok: false as const, status: 403, error: "Forbidden." };
const DISPUTE_ID = "00000000-0000-4000-8000-000000000d11";

beforeEach(() => {
  vi.mocked(requireAdminApi).mockReset();
  vi.mocked(getSupabaseAdmin).mockReset();
  vi.mocked(loadPaymentReconciliation).mockReset();
  vi.mocked(backfillPaystackPaymentTransactions).mockReset();
});

describe("SR-05B2C finance, billing and payout RBAC", () => {
  it("blocks Paystack backfill when the caller lacks payment.reconcile", async () => {
    vi.mocked(requireAdminApi).mockResolvedValue(DENIED_AUTH);

    const request = new Request("https://example.test/api/admin/payments/backfill-paystack", {
      method: "POST",
      headers: { Authorization: "Bearer test" },
    });
    const response = await backfillPOST(request);

    expect(response.status).toBe(403);
    expect(requireAdminApi).toHaveBeenCalledWith(request, ["payment.reconcile"]);
    expect(backfillPaystackPaymentTransactions).not.toHaveBeenCalled();
    expect(getSupabaseAdmin).not.toHaveBeenCalled();
  });

  it("loads payment reconciliation with the same payment.reconcile permission advertised by Office", async () => {
    vi.mocked(requireAdminApi).mockResolvedValue(OK_AUTH);
    vi.mocked(getSupabaseAdmin).mockReturnValue({} as never);
    vi.mocked(loadPaymentReconciliation).mockResolvedValue({ rows: [] } as never);

    const request = new Request("https://example.test/api/admin/payment-reconciliation", {
      headers: { Authorization: "Bearer test" },
    });
    const response = await reconciliationGET(request);

    expect(response.status).toBe(200);
    expect(requireAdminApi).toHaveBeenCalledWith(request, ["payment.reconcile"]);
  });

  it("requires payout.prepare before a dispute resolution can create an earnings adjustment", async () => {
    vi.mocked(requireAdminApi)
      .mockResolvedValueOnce(OK_AUTH)
      .mockResolvedValueOnce(DENIED_AUTH);

    const request = new Request(
      `https://example.test/api/admin/cleaner-earnings-disputes/${DISPUTE_ID}`,
      {
        method: "PATCH",
        headers: { Authorization: "Bearer test", "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "resolved",
          admin_response: "Reviewed and resolved.",
          adjustment_amount_cents: 2500,
          adjustment_reason: "Correct underpayment",
        }),
      },
    );
    const response = await disputePATCH(request, { params: Promise.resolve({ id: DISPUTE_ID }) });

    expect(response.status).toBe(403);
    expect(requireAdminApi).toHaveBeenNthCalledWith(1, request);
    expect(requireAdminApi).toHaveBeenNthCalledWith(2, request, ["payout.prepare"]);
    expect(getSupabaseAdmin).not.toHaveBeenCalled();
  });

  it("keeps payout approval and release as separate explicit authorities", () => {
    const approveSource = readFileSync(
      fileURLToPath(new URL("../payouts/[id]/approve/route.ts", import.meta.url)),
      "utf8",
    );
    const paySource = readFileSync(
      fileURLToPath(new URL("../payouts/[id]/pay/route.ts", import.meta.url)),
      "utf8",
    );
    const markPaidSource = readFileSync(
      fileURLToPath(new URL("../payouts/[id]/mark-paid/route.ts", import.meta.url)),
      "utf8",
    );

    expect(approveSource).toContain('requireAdminPermissionFromRequest(request, "payout.approve")');
    expect(paySource).toContain('requireAdminPermissionFromRequest(request, "payout.release")');
    expect(markPaidSource).toContain('requireAdminPermissionFromRequest(request, "payout.release")');
  });
});
