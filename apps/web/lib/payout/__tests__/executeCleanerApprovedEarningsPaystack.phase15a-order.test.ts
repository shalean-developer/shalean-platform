import { beforeEach, describe, expect, it, vi } from "vitest";

const CID = "aaaaaaaa-bbbb-4ccc-dddd-eeeeeeeeeeee";
const DISB = "dddddddd-dddd-4ddd-dddd-eeeeeeeeeeee";

const { measureMock } = vi.hoisted(() => ({
  measureMock: vi.fn(async () => undefined),
}));

vi.mock("@/lib/payout/ensurePaystackRecipient", () => ({
  ensurePaystackRecipient: vi.fn(async () => ({ ok: true, recipientCode: "RCP_TEST" })),
}));

vi.mock("@/lib/payout/phase15aLedgerClaimShadowEligibility", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/lib/payout/phase15aLedgerClaimShadowEligibility")>();
  return { ...mod, measurePhase15aLedgerClaimShadowEligibility: measureMock };
});

import { executeCleanerApprovedEarningsPaystack } from "@/lib/payout/executeCleanerApprovedEarningsPaystack";

describe("executeCleanerApprovedEarningsPaystack — Phase 15A ordering", () => {
  beforeEach(() => {
    measureMock.mockClear();
    measureMock.mockImplementation(async () => undefined);
    vi.stubEnv("PAYSTACK_SECRET_KEY", "sk_test_phase15a_vitest");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ status: true, data: { transfer_code: "TC", reference: "REF" } }),
      })) as unknown as typeof fetch,
    );
  });

  it("runs shadow measurement before claim_cleaner_earnings_for_paystack and still completes Paystack path", async () => {
    const order: string[] = [];
    measureMock.mockImplementation(async () => {
      order.push("measure");
    });

    const rpc = vi.fn(async (fn: string) => {
      order.push(`rpc:${fn}`);
      return { data: DISB, error: null };
    });

    const admin = {
      rpc,
      from(table: string) {
        if (table === "earnings_disbursement_transfers") {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: async () => ({ data: null, error: null }),
                }),
              }),
            }),
            insert: async () => {
              order.push("insert:earnings_disbursement_transfers");
              return { error: null };
            },
          };
        }
        if (table === "cleaner_earnings_disbursements") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => {
                  order.push("select:cleaner_earnings_disbursements");
                  return {
                    data: { id: DISB, cleaner_id: CID, total_amount_cents: 100, status: "processing" },
                    error: null,
                  };
                },
              }),
            }),
            update: () => ({
              eq: () => ({
                eq: async () => {
                  order.push("update:cleaner_earnings_disbursements");
                  return { error: null };
                },
              }),
            }),
          };
        }
        if (table === "cleaner_earnings") {
          return {
            update: () => ({
              eq: () => ({
                eq: async () => {
                  order.push("update:cleaner_earnings");
                  return { error: null };
                },
              }),
            }),
          };
        }
        throw new Error(`unexpected table in test: ${table}`);
      },
    };

    const res = await executeCleanerApprovedEarningsPaystack(admin as never, { cleanerId: CID });

    expect(measureMock).toHaveBeenCalledWith(admin, CID);
    expect(order[0]).toBe("measure");
    expect(order[1]).toBe("rpc:claim_cleaner_earnings_for_paystack");
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.disbursement_id).toBe(DISB);
    }
  });
});
