import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchEarningsWorkspace } from "@/lib/cleaner/fetchEarningsWorkspace";
type Row = Record<string, unknown>;
class Query {
  filters: Array<(row: Row) => boolean> = [];
  start = 0;
  end = Infinity;
  single = false;
  constructor(
    private table: string,
    private db: Record<string, Row[]>,
    private calls: string[],
  ) {}
  select(columns: string) {
    this.calls.push(`${this.table}.select:${columns}`);
    return this;
  }
  eq(key: string, value: unknown) {
    this.filters.push((r) => r[key] === value);
    return this;
  }
  in(key: string, values: unknown[]) {
    this.filters.push((r) => values.includes(r[key]));
    return this;
  }
  or(expression: string) {
    this.filters.push((r) =>
      expression.split(",").some((term) => {
        const [key, , value] = term.split(".");
        return r[key] === value;
      }),
    );
    return this;
  }
  order() {
    return this;
  }
  range(start: number, end: number) {
    this.start = start;
    this.end = end;
    this.calls.push(`${this.table}:${start}-${end}`);
    return this;
  }
  maybeSingle() {
    this.single = true;
    return this;
  }
  then(
    resolve: (value: unknown) => unknown,
    reject: (value: unknown) => unknown,
  ) {
    const rows = (this.db[this.table] ?? [])
      .filter((r) => this.filters.every((f) => f(r)))
      .slice(this.start, this.end + 1);
    return Promise.resolve({
      data: this.single ? (rows[0] ?? null) : rows,
      error: null,
    }).then(resolve, reject);
  }
}

describe("complete cleaner workspace loader", () => {
  it("retains roster-only visits as unavailable when their own payout allocation is missing", async () => {
    const calls: string[] = [];
    const db: Record<string, Row[]> = {
      bookings: [
        {
          id: "roster-only",
          cleaner_id: "lead",
          payout_owner_cleaner_id: "lead",
          status: "completed",
          is_test: false,
          date: "2026-10-15",
          service: "Regular",
          completed_at: "2026-10-15T12:00:00Z",
          display_earnings_cents: 99999,
          payout_frozen_cents: 90000,
          payout_id: "lead-batch",
          payout_status: "paid",
        },
      ],
      booking_cleaners: [
        { id: "r1", booking_id: "roster-only", cleaner_id: "own" },
      ],
      cleaner_payouts: [
        {
          id: "lead-batch",
          cleaner_id: "lead",
          status: "paid",
          payment_reference: "DoNotLeak",
        },
      ],
    };
    const admin = {
      from: (table: string) => new Query(table, db, calls),
    } as unknown as SupabaseClient;
    const result = await fetchEarningsWorkspace(
      admin,
      "own",
      "2026-10",
      new Date("2026-11-03T12:00:00Z"),
    );
    expect(result.earnings).toHaveLength(1);
    expect(result.earnings[0]).toMatchObject({
      amount_cents: null,
      state: "needs_review",
    });
    expect(result.period.unavailable_visits).toBe(1);
    expect(result.period.earned_cents).toBeNull();
    expect(JSON.stringify(result)).not.toMatch(
      /DoNotLeak|99999|90000|lead-batch/,
    );
  });
  it("paginates own settlement lineage, excludes foreign links and never expands earnings from orphaned ledger rows", async () => {
    const calls: string[] = [];
    const visits = Array.from({ length: 601 }, (_, i) => ({
      id: `visit-${i}`,
      date: "2026-10-15",
      completed_at: "2026-10-15T12:00:00Z",
      service: "Regular",
      status: "completed",
      is_test: false,
      cleaner_id: "own",
      payout_owner_cleaner_id: "own",
      display_earnings_cents: 26000,
      payout_id: null,
      payout_status: "pending",
    }));
    const db: Record<string, Row[]> = {
      bookings: [...visits, { ...visits[0], id: "approved-visit" }],
      cleaner_earnings: [
        ...visits.slice(0, 600).map((r) => ({
          id: `e-${r.id}`,
          cleaner_id: "own",
          booking_id: r.id,
          status: "paid",
          disbursement_id: "own-transfer",
          amount_cents: 1,
        })),
        {
          id: "orphan",
          cleaner_id: "own",
          booking_id: "not-a-viewer-visit",
          status: "paid",
          disbursement_id: "own-transfer",
        },
        {
          id: "approved",
          cleaner_id: "own",
          booking_id: "approved-visit",
          status: "approved",
          disbursement_id: null,
          amount_cents: 99999,
        },
        {
          id: "foreign",
          cleaner_id: "other",
          booking_id: "visit-600",
          status: "paid",
          disbursement_id: "foreign-transfer",
        },
      ],
      cleaner_earnings_disbursements: [
        {
          id: "own-transfer",
          cleaner_id: "own",
          status: "paid",
          total_amount_cents: 600 * 26000,
          paid_at: "2026-11-02T12:00:00Z",
          paystack_reference: "OwnReceipt",
        },
        {
          id: "foreign-transfer",
          cleaner_id: "other",
          status: "paid",
          total_amount_cents: 99999,
          paid_at: "2026-11-02T12:00:00Z",
          paystack_reference: "DoNotLeak",
        },
      ],
    };
    const admin = {
      from: (table: string) => new Query(table, db, calls),
    } as unknown as SupabaseClient;
    const result = await fetchEarningsWorkspace(
      admin,
      "own",
      "2026-10",
      new Date("2026-11-03T12:00:00Z"),
    );
    expect(result.earnings).toHaveLength(602);
    expect(result.earnings.filter((r) => r.state === "paid")).toHaveLength(600);
    expect(result.earnings.find((r) => r.id === "visit-600")?.state).toBe(
      "awaiting_review",
    );
    expect(result.period.unbatched_cents).toBe(26000);
    expect(result.period.earned_cents).toBe(602 * 26000);
    expect(result.period.approved_cents).toBe(26000);
    expect(result.earnings.find((r) => r.id === "approved-visit")?.state).toBe(
      "approved",
    );
    expect(calls).toContain("cleaner_earnings:500-999");
    expect(calls).toContain(
      "cleaner_earnings.select:id,booking_id,status,disbursement_id",
    );
    expect(JSON.stringify(result)).not.toMatch(
      /DoNotLeak|foreign-transfer|disbursement_id|amount_cents":1[,}]/,
    );
  });
  it("paginates beyond500, deduplicates source branches and filters every financial read to the viewer", async () => {
    const cid = "own";
    const calls: string[] = [];
    const visits = Array.from({ length: 601 }, (_, i) => ({
      id: `visit-${i}`,
      date: "2026-10-15",
      completed_at: "2026-10-15T12:00:00Z",
      service: "Regular",
      status: "completed",
      is_test: false,
      cleaner_id: cid,
      payout_owner_cleaner_id: cid,
      display_earnings_cents: 26000,
      payout_id: null,
      payout_status: "pending",
    }));
    const db: Record<string, Row[]> = {
      bookings: [
        ...visits,
        {
          ...visits[0],
          id: "member",
          cleaner_id: "lead",
          payout_owner_cleaner_id: "lead",
          display_earnings_cents: 99999,
        },
        {
          ...visits[0],
          id: "foreign",
          cleaner_id: "other",
          payout_owner_cleaner_id: "other",
        },
        { ...visits[0], id: "test", is_test: true },
      ],
      booking_cleaners: [
        { id: "r1", booking_id: "visit-0", cleaner_id: cid },
        { id: "r2", booking_id: "member", cleaner_id: cid },
        { id: "r3", booking_id: "foreign", cleaner_id: "other" },
      ],
      booking_roster_member_payouts: [
        {
          id: "m1",
          booking_id: "member",
          cleaner_id: cid,
          payout_cents: 26000,
          bonus_cents: 0,
          status: "pending",
          cleaner_payout_id: null,
        },
      ],
      team_job_member_payouts: [],
      cleaner_payouts: [
        {
          id: "private",
          cleaner_id: "other",
          status: "paid",
          payment_reference: "DoNotLeak",
          paid_at: "2026-10-15T12:00:00Z",
        },
      ],
      cleaner_earnings_disbursements: [],
      cleaner_payment_details: [
        {
          cleaner_id: cid,
          account_number: "12345",
          bank_code: "00000",
          account_name: "Test",
        },
      ],
    };
    const admin = {
      from: (table: string) => new Query(table, db, calls),
    } as unknown as SupabaseClient;
    const result = await fetchEarningsWorkspace(
      admin,
      cid,
      "2026-10",
      new Date("2026-10-18T12:00:00Z"),
    );
    expect(result.lifetime.completed_visits).toBe(602);
    expect(result.lifetime.earned_cents).toBe(602 * 26000);
    expect(result.earnings.find((r) => r.id === "member")?.amount_cents).toBe(
      26000,
    );
    expect(
      result.earnings.some((r) => ["foreign", "test"].includes(r.id)),
    ).toBe(false);
    expect(JSON.stringify(result)).not.toMatch(
      /DoNotLeak|12345|account_number|99999/,
    );
    expect(calls).toContain("bookings:500-999");
    expect(result.bank_details_ready).toBe(true);
  });
});
