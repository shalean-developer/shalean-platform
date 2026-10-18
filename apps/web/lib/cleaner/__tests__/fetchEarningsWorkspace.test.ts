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
  select() {
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
