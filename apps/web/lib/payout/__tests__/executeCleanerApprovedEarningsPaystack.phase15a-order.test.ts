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
            select: (cols: string) => {
              expect(cols).toBe("id, booking_id");
              order.push("select:cleaner_earnings");
              return {
                eq: (col: string, val: unknown) => {
                  if (col === "cleaner_id") expect(val).toBe(CID);
                  return {
                    eq: (col2: string, val2: unknown) => {
                      expect(col2).toBe("status");
                      expect(val2).toBe("approved");
                      return {
                        is: (col3: string, val3: unknown) => {
                          expect(col3).toBe("disbursement_id");
                          expect(val3).toBeNull();
                          return {
                            limit: async (n: number) => {
                              expect(n).toBe(200);
                              // No approved ledger rows → dual-rail gate passes without booking scan.
                              return { data: [], error: null };
                            },
                          };
                        },
                      };
                    },
                  };
                },
              };
            },
            update: () => {
              throw new Error("unexpected write to cleaner_earnings in ordering test");
            },
            insert: () => {
              throw new Error("unexpected insert into cleaner_earnings in ordering test");
            },
          };
        }
        if (table === "bookings") {
          return {
            select: () => {
              throw new Error("unexpected bookings select when cleaner_earnings returned no rows");
            },
            update: () => {
              throw new Error("unexpected write to bookings in ordering test");
            },
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
    expect(order).toContain("select:cleaner_earnings");
    expect(order.indexOf("select:cleaner_earnings")).toBeLessThan(
      order.indexOf("rpc:claim_cleaner_earnings_for_paystack"),
    );
    expect(order).toContain("rpc:claim_cleaner_earnings_for_paystack");
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

  it("propagates cleaner_earnings dual-rail load errors without writing", async () => {
    const writes: string[] = [];
    const admin = {
      rpc: vi.fn(async () => {
        writes.push("rpc");
        return { data: DISB, error: null };
      }),
      from(table: string) {
        if (table === "cleaner_earnings") {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  is: () => ({
                    limit: async () => ({ data: null, error: { message: "ce_select_failed" } }),
                  }),
                }),
              }),
            }),
            update: () => {
              writes.push("update:cleaner_earnings");
              throw new Error("no write expected");
            },
            insert: () => {
              writes.push("insert:cleaner_earnings");
              throw new Error("no write expected");
            },
          };
        }
        throw new Error(`unexpected table in error-propagation test: ${table}`);
      },
    };

    const res = await executeCleanerApprovedEarningsPaystack(admin as never, { cleanerId: CID });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toBe("ce_select_failed");
      expect(res.code).toBe("earnings_load_failed");
      expect(res.status).toBe(409);
    }
    expect(admin.rpc).not.toHaveBeenCalled();
    expect(writes).toEqual([]);
  });

  it("blocks weekly-rail conflict without claiming or writing cleaner_earnings", async () => {
    const bookingId = "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb";
    const writes: string[] = [];
    const admin = {
      rpc: vi.fn(async () => {
        writes.push("rpc");
        return { data: DISB, error: null };
      }),
      from(table: string) {
        if (table === "cleaner_earnings") {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  is: () => ({
                    limit: async () => ({
                      data: [{ id: "ce-1", booking_id: bookingId }],
                      error: null,
                    }),
                  }),
                }),
              }),
            }),
            update: () => {
              writes.push("update:cleaner_earnings");
              return { eq: () => ({ eq: async () => ({ error: null }) }) };
            },
          };
        }
        if (table === "bookings") {
          return {
            select: () => ({
              in: async () => ({
                data: [{ id: bookingId, payout_id: "payout-1", payout_status: "paid" }],
                error: null,
              }),
            }),
            update: () => {
              writes.push("update:bookings");
              throw new Error("no booking write expected");
            },
          };
        }
        throw new Error(`unexpected table: ${table}`);
      },
    };

    const res = await executeCleanerApprovedEarningsPaystack(admin as never, { cleanerId: CID });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.code).toBe("dual_rail_weekly_conflict");
      expect(res.status).toBe(409);
    }
    expect(admin.rpc).not.toHaveBeenCalled();
    expect(writes).toEqual([]);
  });
});
