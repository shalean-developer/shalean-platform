import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { executeCleanerApprovedEarningsPaystack } from "@/lib/payout/executeCleanerApprovedEarningsPaystack";
const CID = "aaaaaaaa-bbbb-4ccc-dddd-eeeeeeeeeeee",
  DISB = "dddddddd-dddd-4ddd-dddd-eeeeeeeeeeee",
  BID = "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb";
const { measure } = vi.hoisted(() => ({
  measure: vi.fn(async () => undefined),
}));
vi.mock("@/lib/payout/ensurePaystackRecipient", () => ({
  ensurePaystackRecipient: async () => ({
    ok: true,
    recipientCode: "RCP_TEST",
  }),
}));
vi.mock("@/lib/payout/phase15aLedgerClaimShadowEligibility", () => ({
  measurePhase15aLedgerClaimShadowEligibility: measure,
}));
vi.mock("@/lib/payout/payoutAudit", () => ({ logPayoutAuditEvent: vi.fn() }));
type Row = Record<string, unknown>;
function database() {
  const events: string[] = [];
  const rows: Record<string, Row[]> = {
    cleaner_earnings: [
      {
        id: "e",
        cleaner_id: CID,
        booking_id: BID,
        bookings: { date: "2026-10-15" },
        status: "approved",
        disbursement_id: null,
      },
    ],
    bookings: [{ id: BID, payout_id: null, payout_status: "pending" }],
    cleaner_earnings_disbursements: [
      {
        id: DISB,
        cleaner_id: CID,
        total_amount_cents: 100,
        status: "processing",
      },
    ],
    earnings_disbursement_transfers: [],
    payout_transfer_outbox: [],
  };
  let readError: string | null = null;
  const rpc = vi.fn(async (name: string) => {
    events.push(`rpc:${name}`);
    if (name === "claim_cleaner_earnings_for_paystack")
      Object.assign(rows.cleaner_earnings[0]!, {
        status: "processing",
        disbursement_id: DISB,
      });
    return { data: DISB, error: null };
  });
  return {
    rows,
    events,
    rpc,
    setReadError: (s: string) => {
      readError = s;
    },
    from(table: string) {
      if (!(table in rows)) throw Error(`Unexpected table ${table}`);
      const filters: ((r: Row) => boolean)[] = [];
      let patch: Row | null = null,
        insert = false,
        max = Infinity;
      const val = (r: Row, c: string): unknown =>
        c.split(".").reduce<unknown>((v, k) => (v as Row | undefined)?.[k], r);
      const exec = () => {
        if (readError && table === "cleaner_earnings")
          return { data: null, error: { message: readError } };
        if (insert) {
          const r = {
            id: table + "-1",
            ...(table === "payout_transfer_outbox"
              ? { attempts: 0, transfer_code: null }
              : {}),
            ...patch,
          };
          rows[table]!.push(r);
          events.push("insert:" + table);
          return { data: [r], error: null };
        }
        const selected = rows[table]!.filter((r) =>
          filters.every((f) => f(r)),
        ).slice(0, max);
        if (patch) {
          selected.forEach((r) => Object.assign(r, patch));
          events.push("update:" + table);
        }
        return { data: selected, error: null };
      };
      const q = {
        select: (_s?: string) => q,
        eq: (c: string, v: unknown) => {
          filters.push((r) => val(r, c) === v);
          return q;
        },
        neq: (c: string, v: unknown) => {
          filters.push((r) => val(r, c) !== v);
          return q;
        },
        is: (c: string, v: unknown) => {
          filters.push((r) => val(r, c) === v);
          return q;
        },
        in: (c: string, v: unknown[]) => {
          filters.push((r) => v.includes(val(r, c)));
          return q;
        },
        gte: (c: string, v: string) => {
          filters.push((r) => String(val(r, c)) >= v);
          return q;
        },
        lt: (c: string, v: string) => {
          filters.push((r) => String(val(r, c)) < v);
          return q;
        },
        order: () => q,
        range: () => q,
        limit: (n: number) => {
          max = n;
          return q;
        },
        insert: (r: Row) => {
          patch = r;
          insert = true;
          return q;
        },
        update: (r: Row) => {
          patch = r;
          return q;
        },
        maybeSingle: async () => {
          const r = exec();
          return { ...r, data: r.data?.[0] ?? null };
        },
        then: (f: (r: ReturnType<typeof exec>) => unknown) =>
          Promise.resolve(exec()).then(f),
      };
      return q;
    },
  };
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-05T12:00:00+02:00"));
  measure.mockReset();
  vi.stubEnv("PAYSTACK_SECRET_KEY", "sk_test_example");
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
describe("ledger ordering with October preflight", () => {
  it.each(["2026-10-15", " 2026-10-15 "])("measures before claim and persists the leased outbox before POST for %j", async (date) => {
    const db = database();
    db.rows.cleaner_earnings[0].bookings = {date};
    measure.mockImplementation(async () => {
      db.events.push("measure");
    });
    const provider = vi.fn(async (_url: unknown, init?: RequestInit) => {
      expect(init?.method).toBe("POST");
      expect(db.rows.earnings_disbursement_transfers).toHaveLength(1);
      expect(db.rows.payout_transfer_outbox[0]).toMatchObject({
        status: "sending",
        attempts: 1,
      });
      db.events.push("provider:POST");
      return new Response(
        JSON.stringify({
          status: true,
          data: { transfer_code: "TC", reference: `shalean-earnings-${DISB}` },
        }),
        { status: 200 },
      );
    });
    vi.stubGlobal("fetch", provider);
    expect(
      await executeCleanerApprovedEarningsPaystack(db as never, {
        cleanerId: CID,
      }),
    ).toMatchObject({ ok: true, disbursement_id: DISB });
    expect(db.events.indexOf("measure")).toBeLessThan(
      db.events.indexOf("rpc:claim_cleaner_earnings_for_paystack"),
    );
    expect(
      db.events.indexOf("insert:earnings_disbursement_transfers"),
    ).toBeLessThan(db.events.indexOf("insert:payout_transfer_outbox"));
    expect(db.events.indexOf("insert:payout_transfer_outbox")).toBeLessThan(
      db.events.indexOf("provider:POST"),
    );
    expect(provider).toHaveBeenCalledTimes(1);
  });
  it("propagates read errors without claims or writes", async () => {
    const db = database();
    db.setReadError("ce_select_failed");
    expect(
      await executeCleanerApprovedEarningsPaystack(db as never, {
        cleanerId: CID,
      }),
    ).toMatchObject({ ok: false, error: "ce_select_failed" });
    expect(db.rpc).not.toHaveBeenCalled();
    expect(db.events).toEqual([]);
  });
  it("blocks weekly conflicts without claims or writes", async () => {
    const db = database();
    Object.assign(db.rows.bookings[0]!, {
      payout_id: "payout-1",
      payout_status: "paid",
    });
    expect(
      await executeCleanerApprovedEarningsPaystack(db as never, {
        cleanerId: CID,
      }),
    ).toMatchObject({ ok: false, code: "dual_rail_weekly_conflict" });
    expect(db.rpc).not.toHaveBeenCalled();
    expect(db.events).toEqual([]);
  });
  it.each(["2026-09-30", "2026-11-01"])(
    "excludes visit %s without claims or sends",
    async (date) => {
      const db = database();
      db.rows.cleaner_earnings[0]!.bookings = { date };
      const provider = vi.fn();
      vi.stubGlobal("fetch", provider);
      expect(
        await executeCleanerApprovedEarningsPaystack(db as never, {
          cleanerId: CID,
        }),
      ).toMatchObject({ ok: false, code: "no_approved_earnings" });
      expect(db.rpc).not.toHaveBeenCalled();
      expect(provider).not.toHaveBeenCalled();
      expect(db.events).toEqual([]);
    },
  );
});
