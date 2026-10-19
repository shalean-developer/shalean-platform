import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;

const mockState: { admin: MockSupabaseClient | null; cleanerId: string | null } = {
  admin: null,
  cleanerId: "cleaner-1",
};

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => mockState.admin,
}));

vi.mock("@/lib/cleaner/session", () => ({
  resolveCleanerIdFromRequest: async () => ({ cleanerId: mockState.cleanerId, status: 200 }),
}));

vi.mock("@/lib/cleaner/scheduleStuckEarningsRecompute", () => ({
  scheduleStuckEarningsRecomputeDebounced: vi.fn(),
}));

vi.mock("@/lib/payout/persistCleanerPayout", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/payout/persistCleanerPayout")>();
  return {
    ...actual,
    previewDisplayEarningsCentsForCleanerJob: vi.fn(
      async (_admin: unknown, params: { bookingId?: string }) => {
        const id = String(params?.bookingId ?? "").trim();
        if (id === "b-team" || id === "b3") return null;
        if (id === "b4") return 19_000;
        if (id === "b-card-hint") return 31_500;
        return null;
      },
    ),
  };
});

/** Legacy mega-.or() used by older tests; production now merges branches instead. */
function matchesBookingsVisibilityOrLegacy(row: Row, expr: string): boolean {
  const head = /^cleaner_id\.eq\.([^,]+)/.exec(expr);
  if (head && String(row.cleaner_id ?? "") === head[1]) return true;
  const po = /payout_owner_cleaner_id\.eq\.([^,]+)/.exec(expr);
  if (po && String(row.payout_owner_cleaner_id ?? "") === po[1]) return true;
  if (!expr.includes("team_id.in.")) return false;
  const inMatch = /team_id\.in\.\(([^)]*)\)/.exec(expr);
  if (!inMatch) return false;
  const list = inMatch[1].split(",").map((s) => s.trim()).filter(Boolean);
  const hasTeamPred = expr.includes("is_team_job.is.true") || expr.includes("is_team_job.eq.true");
  if (!hasTeamPred) return false;
  return row.is_team_job === true && list.includes(String(row.team_id ?? ""));
}

function matchesBookingsBranchOr(row: Row, expr: string): boolean {
  if (expr.includes("and(is_team_job")) {
    return matchesBookingsVisibilityOrLegacy(row, expr);
  }
  for (const chunk of expr.split(",").map((s) => s.trim())) {
    const ce = /^cleaner_id\.eq\.(.+)$/.exec(chunk);
    if (ce && String(row.cleaner_id ?? "") === ce[1]) return true;
    const pe = /^payout_owner_cleaner_id\.eq\.(.+)$/.exec(chunk);
    if (pe && String(row.payout_owner_cleaner_id ?? "") === pe[1]) return true;
  }
  return false;
}

class QueryBuilder {
  private filters: Array<{ kind: "eq" | "in" | "not_eq" | "not_in" | "gt" | "gte"; column: string; value: unknown }> = [];
  private single = false;
  private selectedColumns: string[] | null = null;
  private orExpr: string | null = null;
  private rangeStart: number | null = null;
  private rangeEnd: number | null = null;

  constructor(
    private table: string,
    private db: MockSupabaseClient,
  ) {}

  or(expr: string) {
    this.orExpr = expr;
    return this;
  }

  select(columns?: string) {
    if (typeof columns === "string" && columns.trim()) {
      this.selectedColumns = columns
        .split(",")
        .map((c) => c.trim())
        .filter(Boolean);
    }
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push({ kind: "eq", column, value });
    return this;
  }

  not(column: string, op: string, value: unknown) {
    if (op === "eq") this.filters.push({ kind: "not_eq", column, value });
    if (op === "in") this.filters.push({ kind: "not_in", column, value: String(value).replace(/^\(|\)$/g, "").split(",") });
    return this;
  }

  in(column: string, values: unknown[]) {
    this.filters.push({ kind: "in", column, value: values });
    return this;
  }

  gt(column: string, value: unknown) {
    this.filters.push({ kind: "gt", column, value });
    return this;
  }

  gte(column: string, value: unknown) {
    this.filters.push({ kind: "gte", column, value });
    return this;
  }

  order() {
    return this;
  }

  limit() {
    return this;
  }

  range(start: number, end: number) {
    this.rangeStart = Math.max(0, Math.floor(start));
    this.rangeEnd = Math.max(this.rangeStart, Math.floor(end));
    return this;
  }

  maybeSingle() {
    this.single = true;
    return this.execute();
  }

  then<TResult1 = { data: unknown; error: null }, TResult2 = never>(
    onfulfilled?: ((value: { data: unknown; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    return this.execute().then(onfulfilled, onrejected);
  }

  private async execute(): Promise<{ data: unknown; error: null }> {
    const rows = (this.db.tables[this.table] as Row[] | undefined) ?? [];
    const filtered = rows.filter((row) => this.matches(row)).map((row) => this.projectRow(row));
    const ranged =
      this.rangeStart == null || this.rangeEnd == null
        ? filtered
        : filtered.slice(this.rangeStart, this.rangeEnd + 1);
    return { data: this.single ? ranged[0] ?? null : ranged, error: null };
  }

  private matches(row: Row): boolean {
    if (this.table === "bookings" && this.orExpr) {
      if (!matchesBookingsBranchOr(row, this.orExpr)) return false;
    }
    for (const f of this.filters) {
      if (f.kind === "eq" && row[f.column] !== f.value) return false;
      if (f.kind === "not_eq" && row[f.column] === f.value) return false;
      if (f.kind === "not_in" && Array.isArray(f.value) && f.value.includes(row[f.column])) return false;
      if (f.kind === "gte" && (row[f.column] == null || String(row[f.column]) < String(f.value))) return false;
      if (f.kind === "in") {
        const values = Array.isArray(f.value) ? f.value : [];
        if (!values.includes(row[f.column])) return false;
      }
      if (f.kind === "gt") {
        // Lexicographic compare matches Supabase semantics for ISO strings
        // (the only `.gt` user in this test surface is `expires_at > now`).
        const a = row[f.column];
        if (a == null) return false;
        if (!(String(a) > String(f.value))) return false;
      }
    }
    return true;
  }

  private projectRow(row: Row): Row {
    if (!this.selectedColumns || this.selectedColumns.length === 0 || this.selectedColumns.includes("*")) {
      return { ...row };
    }
    const out: Row = {};
    for (const col of this.selectedColumns) {
      out[col] = row[col];
    }
    return out;
  }
}

class MockSupabaseClient {
  tables: Record<string, Row[]>;
  constructor(seed?: Partial<Record<string, Row[]>>) {
    this.tables = {
      cleaners: [],
      bookings: [],
      dispatch_offers: [],
      team_members: [],
      ...(seed ?? {}),
    };
  }
  from(table: string) {
    return new QueryBuilder(table, this);
  }
}

describe("cleaner API earnings contracts", { timeout: 60_000 }, () => {
  afterEach(() => vi.unstubAllEnvs());
  beforeEach(() => {
    vi.restoreAllMocks();
    mockState.cleanerId = "cleaner-1";
  });

  it.each([
    { cleaner: "cleaner-1", status: "pending", flag: "query" },
    { cleaner: "cleaner-2", status: "pending", flag: "env" },
    { cleaner: "cleaner-1", status: "paid", flag: "env" },
    { cleaner: "cleaner-2", status: "paid", flag: "query" },
  ])("keeps paired $status earnings correct for $cleaner with $flag ledger request", async ({ cleaner, status, flag }) => {
    mockState.cleanerId = cleaner;
    vi.stubEnv("USE_LEDGER_TOTALS", flag === "env" ? "true" : "false");
    mockState.admin = new MockSupabaseClient({
      cleaners: [{ id: cleaner, full_name: cleaner }],
      bookings: [{ id: "11111111-1111-4111-8111-111111111111", cleaner_id: "cleaner-1", payout_owner_cleaner_id: "cleaner-1",
        status: "completed", is_test: false, is_team_job: false, date: "2026-10-01",
        completed_at: "2026-10-01T10:00:00Z", display_earnings_cents: 26000,
        cleaner_earnings_total_cents: 52000, payout_status: status,
        payout_frozen_cents: status === "paid" ? 26000 : null,
        payout_paid_at: status === "paid" ? "2026-10-02T10:00:00Z" : null }],
      booking_cleaners: [{ id: "r1", booking_id: "11111111-1111-4111-8111-111111111111", cleaner_id: "cleaner-1" },
        { id: "r2", booking_id: "11111111-1111-4111-8111-111111111111", cleaner_id: "cleaner-2" }],
      booking_roster_member_payouts: [{ booking_id: "11111111-1111-4111-8111-111111111111", cleaner_id: "cleaner-2", payout_cents: 25000, bonus_cents: 1000 }],
      cleaner_earnings: [{ id: "legacy", booking_id: "11111111-1111-4111-8111-111111111111", cleaner_id: "cleaner-1", amount_cents: 52000, status: "pending" }],
    });
    const { GET } = await import("@/app/api/cleaner/earnings/route");
    const res = await GET(new Request("http://localhost/api/cleaner/earnings" + (flag === "query" ? "?use_ledger_totals=true" : "")));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.source_of_truth).toBe("booking");
    expect(json.use_ledger_totals).toBe(false);
    expect(json.ledger_totals_requested).toBe(true);
    expect(json.total_all_time).toBe(26000);
    expect(json.summary[status + "_cents"]).toBe(26000);
    expect(json.rows[0].amount_cents).toBe(26000);
    expect(json.finance_shadow.scope).toBe("solo_ledger_only");
    expect(json.finance_shadow.excluded_member_rail_count).toBe(1);
    expect(json.finance_shadow.delta_all_cents).toBe(0);
    expect(json.finance_shadow.missing_ledger_expected_count).toBe(0);
    expect(json.earnings_ledger_flip_ready).toBe(false);
  });

  it("keeps summary-absent adjusted earnings aligned across today and daily goal", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-16T10:00:00Z"));
    try {
      mockState.admin = new MockSupabaseClient({
        cleaners: [{ id: "cleaner-1" }],
        bookings: Array.from({ length: 12 }, (_, i) => ({
          id: `11111111-1111-4111-8111-${String(i).padStart(12,"0")}`,
          cleaner_id: "cleaner-1", payout_owner_cleaner_id: "cleaner-1", status: "completed", is_test: false,
          is_team_job: false, date: "2026-10-16", completed_at: "2026-10-16T07:00:00Z",
          earnings_policy: "legacy_july", display_earnings_cents: 26000, cleaner_payout_cents: 26000,
          cleaner_bonus_cents: 500, internal_earnings_cents: 26500, earnings_summary: null,
          payout_status: "pending", payout_frozen_cents: null,
        })),
      });
      const { GET } = await import("@/app/api/cleaner/earnings/route");
      const res = await GET(new Request("http://localhost/api/cleaner/earnings"));
      const json = await res.json();
      expect(res.status).toBe(200);
      expect(json.rows.every((r: { amount_cents:number }) => r.amount_cents === 26500)).toBe(true);
      expect(json.summary.today_cents).toBe(318000);
      expect(json.rows.every((r: { bonus_cents:number }) => r.bonus_cents === 500)).toBe(true);
      expect(json.summary.bonus_total_cents).toBe(6000);
      expect(json.rows.every((r: {job_earning_cents:number})=>r.job_earning_cents===26000)).toBe(true);
      expect(json.summary.suggested_daily_goal_cents).toBe(Math.round(318000 / 7 * 1.1));
    } finally { vi.useRealTimers(); }
  });

  it("earnings feed excludes a completed visit whose payout attribution was explicitly removed", async () => {
    mockState.admin = new MockSupabaseClient({
      cleaners: [{ id: "cleaner-1", full_name: "Cleaner One" }],
      bookings: [
        {
          id: "removed-earning",
          cleaner_id: "cleaner-1",
          payout_owner_cleaner_id: "cleaner-1",
          service: "Standard Cleaning",
          status: "completed",
          date: "2026-10-01",
          completed_at: "2026-10-01T20:00:00Z",
          display_earnings_cents: 0,
          cleaner_earnings_total_cents: 0,
          cleaner_payout_cents: null,
          payout_status: "pending",
          is_team_job: false,
          metadata: {
            payout_attribution_removal_v1: {
              active: true,
              cleaner_id: "cleaner-1",
              header_cleaner_id_at_removal: "cleaner-1",
              removed_at: "2026-10-02T07:22:44Z",
              removed_by_admin_id: "admin-1",
              reason: null,
            },
          },
        },
      ],
    });

    const { GET } = await import("@/app/api/cleaner/earnings/route");
    const res = await GET(new Request("http://localhost/api/cleaner/earnings"));
    const json = (await res.json()) as { rows: Array<Record<string, unknown>>; summary?: Record<string, unknown> };

    expect(res.status).toBe(200);
    expect(json.rows).toEqual([]);
    expect(json.summary?.pending_cents ?? 0).toBe(0);
  });

  it("jobs response exposes displayEarningsCents and hides internal payout fields", { timeout: 60_000 }, async () => {
    mockState.admin = new MockSupabaseClient({
      cleaners: [{ id: "cleaner-1" }],
      bookings: [
        {
          id: "b1",
          cleaner_id: "cleaner-1",
          service: "Standard Cleaning",
          status: "assigned",
          display_earnings_cents: 25_000,
          cleaner_payout_cents: 30_000,
          cleaner_bonus_cents: 5_000,
          payout_earnings_cents: 25_000,
          internal_earnings_cents: 30_000,
        },
      ],
    });

    const { GET } = await import("@/app/api/cleaner/jobs/route");
    const res = await GET(new Request("http://localhost/api/cleaner/jobs"));
    const json = (await res.json()) as { jobs: Array<Record<string, unknown>> };
    const row = json.jobs[0]!;

    expect(row.displayEarningsCents).toBeDefined();
    expect(row.displayEarningsCents).toBe(25_000);
    expect(row.earnings_cents).toBe(25_000);
    expect(row.earnings_estimated).toBe(false);
    expect(row.earnings_is_estimate).toBe(false);
    expect(row.cleaner_bonus_cents).toBeUndefined();
    expect(row.payout_earnings_cents).toBeUndefined();
    expect(row.internal_earnings_cents).toBeUndefined();
  });

  it.each(["eligible","paid"])("keeps the member weekly chart aligned with %s earnings",async payoutStatus=>{
    vi.useFakeTimers({toFake:["Date"]});vi.setSystemTime(new Date("2026-10-16T10:00:00Z"));
    try {
      mockState.cleanerId="cleaner-2";
      const id="11111111-1111-4111-8111-111111111111";
      mockState.admin=new MockSupabaseClient({cleaners:[{id:"cleaner-2"}],
        bookings:[{id,cleaner_id:"cleaner-1",payout_owner_cleaner_id:"cleaner-1",status:"completed",is_test:false,
          date:"2026-10-16",completed_at:"2026-10-16T07:00:00Z",display_earnings_cents:26000,cleaner_earnings_total_cents:51700,
          payout_frozen_cents:25700,payout_status:payoutStatus,payout_paid_at:payoutStatus==="paid"?"2026-10-16T08:00:00Z":null}],
        booking_cleaners:[{booking_id:id,cleaner_id:"cleaner-1"},{booking_id:id,cleaner_id:"cleaner-2"}],
        booking_roster_member_payouts:[{booking_id:id,cleaner_id:"cleaner-2",payout_cents:26000,bonus_cents:0}]});
      const {GET}=await import("@/app/api/cleaner/earnings/route");
      const res=await GET(new Request("http://localhost/api/cleaner/earnings"));const json=await res.json();
      expect(res.status).toBe(200);expect(json.rows[0].amount_cents).toBe(26000);
      expect(json.rows[0].payout_frozen_cents).toBe(26000);expect(json.summary.today_cents).toBe(26000);
      const {buildLast7DaysEarningsPoints}=await import("@/lib/cleaner/earningsInsightsSeries");
      expect(buildLast7DaysEarningsPoints(json.rows,new Date()).find(p=>p.ymd==="2026-10-16")?.cents).toBe(26000);
    } finally {vi.useRealTimers();}
  });
  it.each(["", "?view=card", "?lite=1", "detail", "dashboard"])("keeps client fallback money specific to the member in %s",async mode=>{
    vi.useFakeTimers({toFake:["Date"]});vi.setSystemTime(new Date("2026-10-16T10:00:00Z"));
    try {
      const id="22222222-2222-4222-8222-222222222222";
      for(const ownAmount of [26000,0]) {
        mockState.admin=new MockSupabaseClient({cleaners:[{id:"cleaner-1"}],
          bookings:[{id,cleaner_id:"peer",payout_owner_cleaner_id:"peer",status:"completed",is_test:false,
            date:"2026-10-16",completed_at:"2026-10-16T07:00:00Z",display_earnings_cents:26000,
            cleaner_earnings_total_cents:25700+ownAmount,payout_frozen_cents:25700,payout_status:"eligible",
            customer_name:"Synthetic Customer",customer_phone:"+270000000000"}],
          booking_cleaners:[{booking_id:id,cleaner_id:"peer"},{booking_id:id,cleaner_id:"cleaner-1"}],
          booking_roster_member_payouts:[{booking_id:id,cleaner_id:"cleaner-1",payout_cents:ownAmount,bonus_cents:0}]});
        let res:Response;
        if(mode==="detail") {const {GET}=await import("@/app/api/cleaner/jobs/[id]/route");res=await GET(new Request("http://localhost/api/cleaner/jobs/"+id),{params:Promise.resolve({id})});}
        else if(mode==="dashboard") {const {GET}=await import("@/app/api/cleaner/dashboard/route");res=await GET(new Request("http://localhost/api/cleaner/dashboard"));}
        else {const {GET}=await import("@/app/api/cleaner/jobs/route");res=await GET(new Request("http://localhost/api/cleaner/jobs"+mode));}
        const json=await res.json();expect(res.status).toBe(200);const job=mode==="detail"?json.job:json.jobs[0];
        expect(job.displayEarningsCents).toBe(ownAmount);expect(job.payout_frozen_cents).toBe(ownAmount);
        expect(job.cleaner_earnings_total_cents).toBe(ownAmount);
        const {cleanerFacingDisplayEarningsCents}=await import("@/lib/cleaner/cleanerMobileBookingMap");
        expect(cleanerFacingDisplayEarningsCents(job)).toBe(ownAmount);
      }
    } finally {vi.useRealTimers();}
  });

  it.each(["", "?view=card", "?lite=1", "detail"])("hides peer earnings and dispute reasons in %s job responses",async mode=>{
    const booking={id:"private-summary",cleaner_id:"cleaner-1",payout_owner_cleaner_id:"cleaner-1",status:"completed",date:"2026-10-16",
      is_test:false,is_team_job:false,display_earnings_cents:25000,cleaner_payout_cents:25000,
      customer_name:"Synthetic Customer",customer_phone:"+270000000000",earnings_policy:"legacy_july",
      earnings_summary:{model_version:"test",cleaner_count:2,total_cleaner_earnings_cents:52000,
        per_cleaner_earnings:[{cleaner_id:"cleaner-1",base_earning_cents:25000,bonus_cents:0,deduction_cents:0,total_cents:25000},
          {cleaner_id:"peer",base_earning_cents:26000,bonus_cents:1000,deduction_cents:0,total_cents:27000}],
        bonus:{items:[{cleaner_id:"peer",amount_cents:1000,reason:"private-peer-dispute-reason"}],total_cents:1000}}};
    mockState.admin=new MockSupabaseClient({cleaners:[{id:"cleaner-1"}],bookings:[booking]});
    let res:Response;
    if(mode==="detail") {
      const {GET}=await import("@/app/api/cleaner/jobs/[id]/route");
      res=await GET(new Request("http://localhost/api/cleaner/jobs/private-summary"),{params:Promise.resolve({id:"private-summary"})});
    } else {
      const {GET}=await import("@/app/api/cleaner/jobs/route");
      res=await GET(new Request("http://localhost/api/cleaner/jobs"+mode));
    }
    const json=await res.json();expect(res.status).toBe(200);
    const job=mode==="detail"?json.job:json.jobs[0];
    expect(job.earnings_summary).toBeUndefined();
    expect(job.displayEarningsCents).toBe(25000);
    expect(JSON.stringify(json)).not.toContain("private-peer-dispute-reason");
    expect(job.booking_roster_member_payouts).toBeUndefined();
  });

  it("offers response includes positive displayEarningsCents", async () => {
    mockState.admin = new MockSupabaseClient({
      dispatch_offers: [
        {
          id: "o1",
          booking_id: "b2",
          cleaner_id: "cleaner-1",
          status: "pending",
          expires_at: "2099-01-01T00:00:00Z",
          offer_token: "aaaa0001-0000-4000-8000-000000000001",
        },
      ],
      bookings: [
        {
          id: "b2",
          service: "Standard Cleaning",
          display_earnings_cents: 18_000,
          cleaner_payout_cents: 18_000,
          status: "pending",
        },
      ],
    });

    const { GET } = await import("@/app/api/cleaner/offers/route");
    const res = await GET(new Request("http://localhost/api/cleaner/offers"));
    const json = (await res.json()) as { offers: Array<Record<string, unknown>> };
    const offer = json.offers[0]!;

    expect(offer.displayEarningsCents).toBeDefined();
    expect(Number(offer.displayEarningsCents)).toBeGreaterThan(0);
    expect(offer.earnings_cents).toBe(offer.displayEarningsCents);
    expect(offer.earnings_is_estimate).toBe(false);
    expect(offer.offer_token).toBe("aaaa0001-0000-4000-8000-000000000001");
  });

  it("offers include row with null when earnings cannot be resolved", async () => {
    mockState.admin = new MockSupabaseClient({
      dispatch_offers: [
        {
          id: "o-none",
          booking_id: "b-none",
          cleaner_id: "cleaner-1",
          status: "pending",
          expires_at: "2099-01-01T00:00:00Z",
          offer_token: "aaaa0002-0000-4000-8000-000000000002",
        },
      ],
      bookings: [
        {
          id: "b-none",
          service: "Standard Cleaning",
          display_earnings_cents: null,
          cleaner_payout_cents: null,
          payout_frozen_cents: null,
          amount_paid_cents: null,
          total_paid_zar: null,
          booking_snapshot: null,
          status: "pending",
        },
      ],
    });

    const { GET } = await import("@/app/api/cleaner/offers/route");
    const res = await GET(new Request("http://localhost/api/cleaner/offers"));
    const json = (await res.json()) as { offers: Array<Record<string, unknown>> };

    expect(json.offers).toHaveLength(1);
    expect(json.offers[0]!.displayEarningsCents).toBeNull();
    expect(json.offers[0]!.earnings_cents).toBeNull();
    expect(json.offers[0]!.earnings_is_estimate).toBe(false);
  });

  it("offers return null display when booking has no stored cleaner earnings", async () => {
    mockState.admin = new MockSupabaseClient({
      dispatch_offers: [
        {
          id: "o-est",
          booking_id: "b-est",
          cleaner_id: "cleaner-1",
          status: "pending",
          expires_at: "2099-01-01T00:00:00Z",
          offer_token: "aaaa0003-0000-4000-8000-000000000003",
        },
      ],
      bookings: [
        {
          id: "b-est",
          service: "Standard Cleaning",
          is_team_job: false,
          display_earnings_cents: null,
          cleaner_payout_cents: null,
          amount_paid_cents: null,
          total_paid_zar: null,
          payout_frozen_cents: null,
          booking_snapshot: { locked: { finalPrice: 1000 } },
          status: "pending",
        },
      ],
    });

    const { GET } = await import("@/app/api/cleaner/offers/route");
    const res = await GET(new Request("http://localhost/api/cleaner/offers"));
    const json = (await res.json()) as { offers: Array<Record<string, unknown>> };
    const offer = json.offers[0]!;

    expect(offer.displayEarningsCents).toBeNull();
    expect(offer.displayEarningsIsEstimate).toBe(false);
    expect(offer.earnings_cents).toBeNull();
    expect(offer.earnings_estimated).toBe(false);
    expect(offer.earnings_is_estimate).toBe(false);
  });

  it("team job offer has null display when booking has no stored cleaner earnings", async () => {
    mockState.admin = new MockSupabaseClient({
      dispatch_offers: [
        {
          id: "o2",
          booking_id: "b3",
          cleaner_id: "cleaner-1",
          status: "pending",
          expires_at: "2099-01-01T00:00:00Z",
          offer_token: "aaaa0004-0000-4000-8000-000000000004",
        },
      ],
      bookings: [
        {
          id: "b3",
          service: "Deep Cleaning",
          is_team_job: true,
          display_earnings_cents: null,
          cleaner_payout_cents: null,
          payout_frozen_cents: null,
          status: "pending",
        },
      ],
    });

    const { GET } = await import("@/app/api/cleaner/offers/route");
    const res = await GET(new Request("http://localhost/api/cleaner/offers"));
    const json = (await res.json()) as { offers: Array<Record<string, unknown>> };

    expect(json.offers[0]!.displayEarningsCents).toBeNull();
    expect(json.offers[0]!.displayEarningsIsEstimate).toBe(false);
    expect(json.offers[0]!.earnings_is_estimate).toBe(false);
  });

  it("jobs default list previews earnings when resolved display/frozen/line total are unset", async () => {
    mockState.admin = new MockSupabaseClient({
      cleaners: [{ id: "cleaner-1" }],
      bookings: [
        {
          id: "b4",
          cleaner_id: "cleaner-1",
          service: "Standard Cleaning",
          status: "assigned",
          display_earnings_cents: null,
          cleaner_payout_cents: 19_000,
          payout_frozen_cents: null,
        },
      ],
    });

    const { GET } = await import("@/app/api/cleaner/jobs/route");
    const res = await GET(new Request("http://localhost/api/cleaner/jobs"));
    const json = (await res.json()) as { jobs: Array<Record<string, unknown>> };

    expect(json.jobs[0]!.displayEarningsCents).toBe(19_000);
    expect(json.jobs[0]!.displayEarningsIsEstimate).toBe(true);
    expect(json.jobs[0]!.earnings_estimated).toBe(true);
    expect(json.jobs[0]!.earnings_is_estimate).toBe(true);
  });

  it("jobs view=card applies rule preview when display earnings are null and keeps pay totals for hints", async () => {
    mockState.admin = new MockSupabaseClient({
      cleaners: [{ id: "cleaner-1" }],
      bookings: [
        {
          id: "b-card-hint",
          cleaner_id: "cleaner-1",
          service: "Standard Cleaning",
          status: "assigned",
          display_earnings_cents: null,
          cleaner_payout_cents: null,
          payout_frozen_cents: null,
          total_paid_zar: 450,
          amount_paid_cents: null,
        },
      ],
    });

    const { GET } = await import("@/app/api/cleaner/jobs/route");
    const res = await GET(new Request("http://localhost/api/cleaner/jobs?view=card"));
    const json = (await res.json()) as { jobs: Array<Record<string, unknown>> };
    const row = json.jobs[0]!;

    expect(row.displayEarningsCents).toBe(31_500);
    expect(row.displayEarningsIsEstimate).toBe(true);
    expect(row.earnings_estimated).toBe(true);
    expect(row.earnings_is_estimate).toBe(true);
    expect(row.earnings_basis_pending).toBe(false);
    expect(row.total_paid_zar).toBe(450);
  });

  it("team job without stored display earnings returns null from jobs API", async () => {
    mockState.admin = new MockSupabaseClient({
      cleaners: [{ id: "cleaner-1" }],
      bookings: [
        {
          id: "b-team",
          cleaner_id: "cleaner-1",
          service: "Deep Cleaning",
          status: "assigned",
          is_team_job: true,
          team_id: "team-1",
          display_earnings_cents: null,
          cleaner_payout_cents: null,
          payout_frozen_cents: null,
        },
      ],
    });

    const { GET } = await import("@/app/api/cleaner/jobs/route");
    const res = await GET(new Request("http://localhost/api/cleaner/jobs"));
    const json = (await res.json()) as { jobs: Array<Record<string, unknown>> };

    expect(json.jobs[0]!.displayEarningsCents).toBeNull();
    expect(json.jobs[0]!.displayEarningsIsEstimate).toBe(false);
    expect(json.jobs[0]!.earnings_is_estimate).toBe(false);
  });
});

