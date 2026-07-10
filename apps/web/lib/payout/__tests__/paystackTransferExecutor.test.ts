import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  immutableCleanerPayoutReference,
  submitPaystackTransferViaOutbox,
} from "@/lib/payout/paystackTransferExecutor";

vi.mock("@/lib/payout/payoutAudit", () => ({
  logPayoutAuditEvent: vi.fn(async () => undefined),
}));

const PAYOUT_ID = "11111111-1111-4111-8111-111111111111";
const CLEANER_ID = "22222222-2222-4222-8222-222222222222";
const TRANSFER_ROW = "33333333-3333-4333-8333-333333333333";
const OUTBOX_ID = "44444444-4444-4444-8444-444444444444";
const REF = immutableCleanerPayoutReference(PAYOUT_ID);

describe("submitPaystackTransferViaOutbox", () => {
  beforeEach(() => {
    vi.stubEnv("PAYSTACK_SECRET_KEY", "sk_test_outbox");
    vi.stubGlobal("fetch", vi.fn());
  });

  it("uses a stable immutable reference (no retry timestamp)", () => {
    expect(immutableCleanerPayoutReference(PAYOUT_ID)).toBe(`shalean-cleaner-payout-${PAYOUT_ID}`);
    expect(immutableCleanerPayoutReference(PAYOUT_ID)).toBe(immutableCleanerPayoutReference(PAYOUT_ID));
  });

  it("inserts transfer + outbox before calling Paystack", async () => {
    const order: string[] = [];
    const fetchMock = vi.fn(async () => {
      order.push("paystack:/transfer");
      return {
        ok: true,
        status: 200,
        json: async () => ({ status: true, data: { transfer_code: "TRF_1", reference: REF } }),
      };
    });
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const admin = {
      from(table: string) {
        if (table === "payout_transfers") {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: async () => ({ data: null, error: null }),
                }),
              }),
            }),
            insert: () => {
              order.push("insert:payout_transfers");
              return {
                select: () => ({
                  maybeSingle: async () => ({ data: { id: TRANSFER_ROW }, error: null }),
                }),
              };
            },
            update: () => ({
              eq: () => ({
                neq: async () => ({ error: null }),
              }),
            }),
          };
        }
        if (table === "payout_transfer_outbox") {
          let loaded = false;
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => {
                  if (!loaded) return { data: null, error: null };
                  return {
                    data: {
                      id: OUTBOX_ID,
                      status: "pending",
                      transfer_code: null,
                      transfer_row_id: TRANSFER_ROW,
                      reference: REF,
                      attempts: 0,
                    },
                    error: null,
                  };
                },
              }),
            }),
            insert: () => {
              order.push("insert:outbox");
              loaded = true;
              return {
                select: () => ({
                  maybeSingle: async () => ({
                    data: {
                      id: OUTBOX_ID,
                      status: "pending",
                      transfer_code: null,
                      transfer_row_id: TRANSFER_ROW,
                      reference: REF,
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
                        reference: REF,
                        attempts: 1,
                      },
                      error: null,
                    }),
                  }),
                }),
                neq: async () => ({ error: null }),
              }),
            }),
          };
        }
        if (table === "payout_audit_events") {
          return { insert: async () => ({ error: null }) };
        }
        throw new Error(`unexpected ${table}`);
      },
    };

    const res = await submitPaystackTransferViaOutbox(admin as never, {
      rail: "cleaner_payout",
      subjectId: PAYOUT_ID,
      cleanerId: CLEANER_ID,
      amountCents: 25000,
      recipientCode: "RCP_X",
      reference: REF,
      initiatedBy: "admin-1",
    });

    expect(res.ok).toBe(true);
    expect(order[0]).toBe("insert:payout_transfers");
    expect(order[1]).toBe("insert:outbox");
    expect(order[2]).toBe("paystack:/transfer");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
    expect(body.reference).toBe(REF);
  });

  it("on network error after enqueue, returns needsReconcile and does not invent a new reference", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("socket hang up");
      }) as unknown as typeof fetch,
    );

    const statuses: string[] = [];
    const admin = {
      from(table: string) {
        if (table === "payout_transfers") {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: async () => ({ data: null, error: null }),
                }),
              }),
            }),
            insert: () => ({
              select: () => ({
                maybeSingle: async () => ({ data: { id: TRANSFER_ROW }, error: null }),
              }),
            }),
            update: () => ({
              eq: () => ({
                neq: async () => ({ error: null }),
              }),
            }),
          };
        }
        if (table === "payout_transfer_outbox") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: null, error: null }),
              }),
            }),
            insert: () => ({
              select: () => ({
                maybeSingle: async () => ({
                  data: {
                    id: OUTBOX_ID,
                    status: "pending",
                    transfer_code: null,
                    transfer_row_id: TRANSFER_ROW,
                    reference: REF,
                    attempts: 0,
                  },
                  error: null,
                }),
              }),
            }),
            update: (patch: { status?: string }) => {
              if (patch.status) statuses.push(patch.status);
              return {
                eq: () => ({
                  in: () => ({
                    select: () => ({
                      maybeSingle: async () => ({
                        data: {
                          id: OUTBOX_ID,
                          status: "pending",
                          transfer_code: null,
                          transfer_row_id: TRANSFER_ROW,
                          reference: REF,
                          attempts: 1,
                        },
                        error: null,
                      }),
                    }),
                  }),
                  neq: async () => ({ error: null }),
                }),
              };
            },
          };
        }
        if (table === "payout_audit_events") {
          return { insert: async () => ({ error: null }) };
        }
        throw new Error(`unexpected ${table}`);
      },
    };

    const res = await submitPaystackTransferViaOutbox(admin as never, {
      rail: "cleaner_payout",
      subjectId: PAYOUT_ID,
      cleanerId: CLEANER_ID,
      amountCents: 25000,
      recipientCode: "RCP_X",
      reference: REF,
    });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.needsReconcile).toBe(true);
    }
    expect(statuses).toContain("needs_reconcile");
  });

  it("skips Paystack when a success transfer already exists", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock as unknown as typeof fetch);

    const admin = {
      from(table: string) {
        if (table === "payout_transfers") {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: async () => ({
                    data: { transfer_code: "TRF_EXISTING", reference: REF },
                    error: null,
                  }),
                }),
              }),
            }),
          };
        }
        throw new Error(`unexpected ${table}`);
      },
    };

    const res = await submitPaystackTransferViaOutbox(admin as never, {
      rail: "cleaner_payout",
      subjectId: PAYOUT_ID,
      cleanerId: CLEANER_ID,
      amountCents: 25000,
      recipientCode: "RCP_X",
      reference: REF,
    });

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.skippedExisting).toBe(true);
      expect(res.transferCode).toBe("TRF_EXISTING");
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
