import { beforeEach, describe, expect, it, vi } from "vitest";

const CID = "aaaaaaaa-bbbb-4ccc-dddd-eeeeeeeeeeee";
const DISB = "dddddddd-dddd-4ddd-dddd-eeeeeeeeeeee";
const TRANSFER_ROW = "eeeeeeee-eeee-4eee-eeee-ffffffffffff";
const OUTBOX_ID = "ffffffff-ffff-4fff-ffff-ffffffffffff";

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

vi.mock("@/lib/payout/payoutAudit", () => ({
  logPayoutAuditEvent: vi.fn(async () => undefined),
}));

import { executeCleanerApprovedEarningsPaystack } from "@/lib/payout/executeCleanerApprovedEarningsPaystack";

function chainEq(terminal: () => Promise<unknown>) {
  const self: Record<string, unknown> = {};
  self.eq = () => self;
  self.neq = () => self;
  self.in = () => self;
  self.select = () => self;
  self.maybeSingle = terminal;
  self.then = undefined;
  return self;
}

describe("executeCleanerApprovedEarningsPaystack — Phase 15A ordering + outbox", () => {
  beforeEach(() => {
    measureMock.mockClear();
    measureMock.mockImplementation(async () => undefined);
    vi.stubEnv("PAYSTACK_SECRET_KEY", "sk_test_phase15a_vitest");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ status: true, data: { transfer_code: "TC", reference: `shalean-earnings-${DISB}` } }),
      })) as unknown as typeof fetch,
    );
  });

  it("runs shadow measurement before claim and completes via outbox (insert before Paystack)", async () => {
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
            select: () =>
              chainEq(async () => ({ data: null, error: null })),
            insert: (row: Record<string, unknown>) => {
              order.push("insert:earnings_disbursement_transfers");
              expect(row.reference).toBe(`shalean-earnings-${DISB}`);
              expect(row.status).toBe("processing");
              return {
                select: () => ({
                  maybeSingle: async () => ({ data: { id: TRANSFER_ROW }, error: null }),
                }),
              };
            },
            update: () => chainEq(async () => ({ error: null })),
          };
        }
        if (table === "payout_transfer_outbox") {
          return {
            select: () =>
              chainEq(async () => ({ data: null, error: null })),
            insert: () => {
              order.push("insert:payout_transfer_outbox");
              return {
                select: () => ({
                  maybeSingle: async () => ({
                    data: {
                      id: OUTBOX_ID,
                      status: "pending",
                      transfer_code: null,
                      transfer_row_id: TRANSFER_ROW,
                      reference: `shalean-earnings-${DISB}`,
                      attempts: 0,
                    },
                    error: null,
                  }),
                }),
              };
            },
            update: () => ({
              eq: () => ({
                in: () => ({
                  select: () => ({
                    maybeSingle: async () => ({
                      data: {
                        id: OUTBOX_ID,
                        status: "pending",
                        transfer_code: null,
                        transfer_row_id: TRANSFER_ROW,
                        reference: `shalean-earnings-${DISB}`,
                        attempts: 1,
                      },
                      error: null,
                    }),
                  }),
                }),
                neq: async () => ({ error: null }),
                maybeSingle: async () => ({ error: null }),
              }),
            }),
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
                eq: async () => ({ error: null }),
              }),
            }),
          };
        }
        if (table === "payout_audit_events") {
          return { insert: async () => ({ error: null }) };
        }
        throw new Error(`unexpected table in test: ${table}`);
      },
    };

    const res = await executeCleanerApprovedEarningsPaystack(admin as never, { cleanerId: CID });

    expect(measureMock).toHaveBeenCalledWith(admin, CID);
    expect(order[0]).toBe("measure");
    expect(order[1]).toBe("rpc:claim_cleaner_earnings_for_paystack");
    expect(order).toContain("insert:earnings_disbursement_transfers");
    expect(order).toContain("insert:payout_transfer_outbox");
    // Outbox insert must happen before Paystack fetch completes the path
    const insertIdx = order.indexOf("insert:payout_transfer_outbox");
    const transferInsertIdx = order.indexOf("insert:earnings_disbursement_transfers");
    expect(transferInsertIdx).toBeLessThan(insertIdx);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.disbursement_id).toBe(DISB);
      expect(res.reference).toBe(`shalean-earnings-${DISB}`);
    }
  });
});
