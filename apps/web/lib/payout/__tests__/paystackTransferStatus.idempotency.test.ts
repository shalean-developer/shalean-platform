import { describe, expect, it, vi } from "vitest";
import { applyTransferSuccess } from "@/lib/payout/paystackTransferStatus";

vi.mock("@/lib/payout/payoutAudit", () => ({
  logPayoutAuditEvent: vi.fn(async () => undefined),
}));

describe("applyTransferSuccess idempotency + booking sync", () => {
  it("ignores already-successful transfer and does not re-mark paid", async () => {
    const updates: string[] = [];
    const admin = {
      from(table: string) {
        if (table === "payout_transfers") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: { id: "tr1", payout_id: "po1", status: "success" },
                  error: null,
                }),
                // maybeMarkPayoutPaid path — not reached when already success
              }),
            }),
            update: () => {
              updates.push("payout_transfers");
              return {
                eq: () => ({
                  neq: async () => ({ error: null }),
                }),
              };
            },
          };
        }
        if (table === "earnings_disbursement_transfers") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: null, error: null }),
              }),
            }),
          };
        }
        throw new Error(table);
      },
      rpc: async () => {
        updates.push("rpc");
        return { error: null };
      },
    };

    const result = await applyTransferSuccess(admin as never, { transfer_code: "TRF_1" });
    expect(result).toEqual({ ignored: "already successful" });
    expect(updates).toEqual([]);
  });

  it("on first success marks transfer, payout, bookings, and outbox", async () => {
    const calls: string[] = [];
    const admin = {
      from(table: string) {
        if (table === "payout_transfers") {
          return {
            select: (cols: string) => {
              if (cols === "status") {
                return {
                  eq: async () => {
                    calls.push("select-statuses");
                    return { data: [{ status: "success" }], error: null };
                  },
                };
              }
              return {
                eq: () => ({
                  maybeSingle: async () => ({
                    data: { id: "tr1", payout_id: "po1", status: "processing" },
                    error: null,
                  }),
                }),
              };
            },
            update: () => {
              calls.push("update:payout_transfers");
              return {
                eq: () => ({
                  neq: async () => ({ error: null }),
                }),
              };
            },
          };
        }
        if (table === "cleaner_payouts") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: { payout_run_id: null }, error: null }),
              }),
            }),
            update: () => {
              calls.push("update:cleaner_payouts");
              return {
                eq: () => ({
                  eq: () => ({
                    neq: async () => ({ error: null }),
                  }),
                }),
              };
            },
          };
        }
        if (table === "payout_transfer_outbox") {
          return {
            update: () => {
              calls.push("update:outbox");
              return {
                eq: () => ({
                  neq: async () => ({ error: null }),
                }),
              };
            },
          };
        }
        if (table === "earnings_disbursement_transfers") {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: null, error: null }),
              }),
            }),
          };
        }
        throw new Error(table);
      },
      rpc: async (fn: string) => {
        calls.push(`rpc:${fn}`);
        return { error: null };
      },
    };

    const result = await applyTransferSuccess(admin as never, {
      transfer_code: "TRF_1",
      reference: "shalean-cleaner-payout-po1",
    });
    expect(result).toMatchObject({ kind: "cleaner_payout", payoutId: "po1" });
    expect(calls).toContain("update:payout_transfers");
    expect(calls).toContain("update:cleaner_payouts");
    expect(calls).toContain("rpc:mark_bookings_paid_for_cleaner_payout");
    expect(calls).toContain("update:outbox");
  });
});
