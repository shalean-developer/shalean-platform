import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { bookingPayableForWeeklyBatch } from "@/lib/payout/bookingPayableForWeeklyBatch";
import { hydrateMissingMemberInvoiceStatuses } from "@/lib/payout/memberCandidateInvoiceStatuses";

function invoiceAdmin(status: string) {
  return {
    from(table: string) {
      expect(table).toBe("monthly_invoices");
      return {
        select() {
          return this;
        },
        async in(_col: string, ids: string[]) {
          return {
            data: ids.map((id) => ({ id, status })),
            error: null,
          };
        },
      };
    },
  } as never;
}

const monthlyBooking = {
  id: "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa",
  status: "completed",
  cleaner_id: "bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb",
  cleaner_payout_cents: 25_000,
  cleaner_bonus_cents: 0,
  is_test: false,
  completed_at: "2026-09-19T10:00:00Z",
  date: "2026-09-19",
  billing_type: "monthly_contract",
  is_monthly_billing_booking: true,
  monthly_invoice_id: "cccccccc-3333-4333-8333-cccccccccccc",
  payment_status: "success",
  payout_status: "eligible",
  payout_frozen_cents: 25_000,
  refunded_at: null,
  refund_status: null,
  metadata: {},
};

describe("AUDIT-03B01 member monthly-invoice status hydration", () => {
  it("hydrates a paid invoice missing from the direct-candidate map", async () => {
    const hydrated = await hydrateMissingMemberInvoiceStatuses(
      invoiceAdmin("paid"),
      [monthlyBooking],
      new Map(),
    );
    expect(hydrated?.get(monthlyBooking.monthly_invoice_id)).toBe("paid");
    expect(bookingPayableForWeeklyBatch(monthlyBooking, hydrated ?? new Map()).payable).toBe(true);
  });

  it("keeps a sent invoice non-payable after hydration", async () => {
    const hydrated = await hydrateMissingMemberInvoiceStatuses(
      invoiceAdmin("sent"),
      [monthlyBooking],
      new Map(),
    );
    expect(hydrated?.get(monthlyBooking.monthly_invoice_id)).toBe("sent");
    expect(bookingPayableForWeeklyBatch(monthlyBooking, hydrated ?? new Map()).payable).toBe(false);
  });

  it("preserves a status already supplied by the direct-candidate map without querying", async () => {
    let queried = false;
    const admin = {
      from() {
        queried = true;
        throw new Error("should not query");
      },
    } as never;
    const hydrated = await hydrateMissingMemberInvoiceStatuses(
      admin,
      [monthlyBooking],
      new Map([[monthlyBooking.monthly_invoice_id, "paid"]]),
    );
    expect(queried).toBe(false);
    expect(hydrated?.get(monthlyBooking.monthly_invoice_id)).toBe("paid");
  });

  it("wires the hydrated map into both member candidate loaders", () => {
    for (const path of [
      "lib/payout/rosterMemberWeeklyPayoutCandidates.ts",
      "lib/payout/teamJobMemberWeeklyPayoutCandidates.ts",
    ]) {
      const source = readFileSync(join(process.cwd(), path), "utf8");
      expect(source).toContain("hydrateMissingMemberInvoiceStatuses");
      expect(source).toContain("effectiveInvoiceStatusById");
      expect(source).toContain("bookingPayableForWeeklyBatch(booking, effectiveInvoiceStatusById");
    }
  });
  it("fails closed when the missing monthly-invoice lookup errors", async () => {
    const admin = {
      from() {
        return {
          select() {
            return this;
          },
          async in() {
            return {
              data: null,
              error: { message: "transient monthly invoice lookup failure" },
            };
          },
        };
      },
    } as never;

    await expect(
      hydrateMissingMemberInvoiceStatuses(admin, [monthlyBooking], new Map()),
    ).rejects.toThrow("member monthly_invoices lookup failed");
  });

  it("generator catches member-candidate failures before payout mutation", () => {
    const source = readFileSync(join(process.cwd(), "lib/payout/generateWeeklyPayouts.ts"), "utf8");
    const load = source.indexOf("rosterMemberCandidates = await listRosterMemberWeeklyPayoutCandidates");
    const failure = source.indexOf("member payout candidate loading failed");
    const payoutMutation = source.indexOf('admin.rpc("upsert_pending_payout_earnings"');

    expect(load).toBeGreaterThan(-1);
    expect(failure).toBeGreaterThan(load);
    expect(payoutMutation).toBeGreaterThan(failure);
  });

});
