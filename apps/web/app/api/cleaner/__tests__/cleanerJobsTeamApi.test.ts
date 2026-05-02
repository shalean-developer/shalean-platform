import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;

const mockState: { admin: MockSupabase | null } = { admin: null };

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => mockState.admin,
}));

vi.mock("@/lib/cleaner/session", () => ({
  resolveCleanerIdFromRequest: async () => ({ cleanerId: "cleaner-1", status: 200 }),
}));

vi.mock("@/lib/cleaner/scheduleStuckEarningsRecompute", () => ({
  scheduleStuckEarningsRecomputeDebounced: vi.fn(),
}));

function rowMatchesVisibilityOr(row: Row, expr: string): boolean {
  const head = /^cleaner_id\.eq\.([^,]+)/.exec(expr);
  if (head && String(row.cleaner_id ?? "") === head[1]) return true;
  const po = /payout_owner_cleaner_id\.eq\.([^,]+)/.exec(expr);
  if (po && String(row.payout_owner_cleaner_id ?? "") === po[1]) return true;
  const idIn = /id\.in\.\(([^)]*)\)/.exec(expr);
  if (idIn) {
    const list = idIn[1].split(",").map((s) => s.trim()).filter(Boolean);
    if (list.includes(String(row.id ?? ""))) return true;
  }
  if (!expr.includes("team_id.in.")) return false;
  const inMatch = /team_id\.in\.\(([^)]*)\)/.exec(expr);
  if (!inMatch) return false;
  const list = inMatch[1].split(",").map((s) => s.trim()).filter(Boolean);
  const hasTeamPredicate = expr.includes("is_team_job.eq.true") || expr.includes("is_team_job.is.true");
  if (!hasTeamPredicate) return false;
  return row.is_team_job === true && list.includes(String(row.team_id ?? ""));
}

class BookingsQuery {
  private orExpr: string | null = null;
  private statusNot = new Set<string>();

  constructor(private rows: Row[]) {}

  select() {
    return this;
  }
  or(expr: string) {
    this.orExpr = expr;
    return this;
  }
  not(_col: string, _op: string, val: unknown) {
    this.statusNot.add(String(val));
    return this;
  }
  order() {
    return this;
  }
  limit() {
    return this;
  }
  then(onfulfilled?: (value: { data: Row[]; error: null }) => void): Promise<{ data: Row[]; error: null }> {
    const filtered = this.rows.filter((row) => {
      for (const st of this.statusNot) {
        if (String(row.status ?? "") === st) return false;
      }
      if (this.orExpr) return rowMatchesVisibilityOr(row, this.orExpr);
      return true;
    });
    const data = filtered.map((r) => ({ ...r }));
    const payload = { data, error: null as null };
    if (onfulfilled) onfulfilled(payload);
    return Promise.resolve(payload);
  }
}

class CleanersQuery {
  private mode: "eq" | "in" = "eq";
  private idEq: unknown;
  private idIn: string[] = [];
  constructor(private db: MockSupabase) {}
  select() {
    return this;
  }
  eq(_col: string, value: unknown) {
    this.mode = "eq";
    this.idEq = value;
    return this;
  }
  in(_col: string, values: unknown[]) {
    this.mode = "in";
    this.idIn = values.map((v) => String(v ?? ""));
    return this;
  }
  maybeSingle() {
    if (this.mode !== "eq") return Promise.resolve({ data: null, error: null });
    const hit = this.db.tables.cleaners.find((r) => r.id === this.idEq);
    return Promise.resolve({ data: hit ?? null, error: null });
  }
  then(onfulfilled?: (value: { data: Row[]; error: null }) => void): Promise<{ data: Row[]; error: null }> {
    if (this.mode === "in") {
      const rows = this.idIn
        .map((id) => this.db.tables.cleaners.find((r) => String(r.id) === id))
        .filter((r): r is Row => Boolean(r));
      const payload = { data: rows, error: null as null };
      if (onfulfilled) onfulfilled(payload);
      return Promise.resolve(payload);
    }
    const payload = { data: [] as Row[], error: null as null };
    if (onfulfilled) onfulfilled(payload);
    return Promise.resolve(payload);
  }
}

class BookingCleanersQuery {
  private bookingIdsIn: string[] | null = null;
  private cleanerIdEq: string | null = null;
  constructor(private db: MockSupabase) {}
  select() {
    return this;
  }
  eq(col: string, value: unknown) {
    if (col === "cleaner_id") this.cleanerIdEq = String(value ?? "");
    return this;
  }
  in(col: string, values: unknown[]) {
    if (col === "booking_id") {
      this.bookingIdsIn = values.map((v) => String(v ?? "").trim()).filter(Boolean);
    }
    return this;
  }
  limit() {
    return this;
  }
  order() {
    return this;
  }
  then(onfulfilled?: (value: { data: Row[]; error: null }) => void): Promise<{ data: Row[]; error: null }> {
    let rows = [...(this.db.tables.booking_cleaners ?? [])];
    if (this.cleanerIdEq) rows = rows.filter((r) => String(r.cleaner_id ?? "") === this.cleanerIdEq);
    if (this.bookingIdsIn?.length) {
      const set = new Set(this.bookingIdsIn);
      rows = rows.filter((r) => set.has(String(r.booking_id ?? "")));
    }
    const payload = { data: rows, error: null as null };
    if (onfulfilled) onfulfilled(payload);
    return Promise.resolve(payload);
  }
}

class BookingLineItemsEmptyQuery {
  select() {
    return this;
  }
  in() {
    return this;
  }
  order() {
    return this;
  }
  then(onfulfilled?: (value: { data: Row[]; error: null }) => void): Promise<{ data: Row[]; error: null }> {
    const payload = { data: [] as Row[], error: null as null };
    if (onfulfilled) onfulfilled(payload);
    return Promise.resolve(payload);
  }
}

class TeamMembersQuery {
  private cleanerIdEq: string | null = null;
  private teamIdEq: string | null = null;
  private teamIdIn: string[] | null = null;
  private excludeNullCleaner = false;
  private excludeNullTeam = false;

  constructor(private db: MockSupabase) {}

  select() {
    return this;
  }
  eq(col: string, value: unknown) {
    if (col === "cleaner_id") this.cleanerIdEq = String(value ?? "");
    if (col === "team_id") this.teamIdEq = String(value ?? "");
    return this;
  }
  in(col: string, values: unknown[]) {
    if (col === "team_id") this.teamIdIn = values.map((v) => String(v ?? ""));
    return this;
  }
  not(col: string, _op: string, val: unknown) {
    if (col === "cleaner_id" && val === null) this.excludeNullCleaner = true;
    if (col === "team_id" && val === null) this.excludeNullTeam = true;
    return this;
  }
  maybeSingle() {
    const rows = this.resolve();
    const hit = rows[0] ?? null;
    return Promise.resolve({ data: hit, error: null });
  }
  then(onfulfilled?: (value: { data: Row[]; error: null }) => void): Promise<{ data: Row[]; error: null }> {
    const rows = this.resolve();
    const payload = { data: rows, error: null as null };
    if (onfulfilled) onfulfilled(payload);
    return Promise.resolve(payload);
  }
  private resolve(): Row[] {
    let rows = [...this.db.tables.team_members];
    if (this.cleanerIdEq) rows = rows.filter((r) => String(r.cleaner_id ?? "") === this.cleanerIdEq);
    if (this.teamIdEq) rows = rows.filter((r) => String(r.team_id ?? "") === this.teamIdEq);
    if (this.teamIdIn?.length) rows = rows.filter((r) => this.teamIdIn!.includes(String(r.team_id ?? "")));
    if (this.excludeNullCleaner) rows = rows.filter((r) => r.cleaner_id != null && String(r.cleaner_id).trim() !== "");
    if (this.excludeNullTeam) rows = rows.filter((r) => r.team_id != null && String(r.team_id).trim() !== "");
    return rows;
  }
}

/** GET /api/cleaner/jobs loads issue-report flags; tests use an empty report set. */
class IssueReportsEmptyQuery {
  select() {
    return this;
  }
  in() {
    return this;
  }
  eq() {
    return this;
  }
  then(onfulfilled?: (value: { data: Row[]; error: null }) => void): Promise<{ data: Row[]; error: null }> {
    const payload = { data: [] as Row[], error: null as null };
    if (onfulfilled) onfulfilled(payload);
    return Promise.resolve(payload);
  }
}

class MockSupabase {
  tables: { cleaners: Row[]; team_members: Row[]; bookings: Row[]; booking_cleaners: Row[] };

  constructor(seed: { cleaners?: Row[]; team_members?: Row[]; bookings?: Row[]; booking_cleaners?: Row[] }) {
    this.tables = {
      cleaners: seed.cleaners ?? [],
      team_members: seed.team_members ?? [],
      bookings: seed.bookings ?? [],
      booking_cleaners: seed.booking_cleaners ?? [],
    };
  }

  from(table: string) {
    if (table === "bookings") return new BookingsQuery(this.tables.bookings) as unknown as CleanersQuery;
    if (table === "cleaners") return new CleanersQuery(this);
    if (table === "team_members") return new TeamMembersQuery(this);
    if (table === "booking_cleaners") return new BookingCleanersQuery(this);
    if (table === "booking_line_items") return new BookingLineItemsEmptyQuery() as unknown as CleanersQuery;
    if (table === "cleaner_job_issue_reports") return new IssueReportsEmptyQuery() as unknown as CleanersQuery;
    throw new Error(`unexpected table ${table}`);
  }
}

describe("GET /api/cleaner/jobs — team visibility", { timeout: 60_000 }, () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("mock admin returns team ids for fetchCleanerTeamIds", async () => {
    mockState.admin = new MockSupabase({
      cleaners: [{ id: "cleaner-1" }],
      team_members: [{ cleaner_id: "cleaner-1", team_id: "team-a" }],
      bookings: [],
    });
    const { fetchCleanerTeamIds } = await import("@/lib/cleaner/cleanerBookingAccess");
    const ids = await fetchCleanerTeamIds(mockState.admin as never, "cleaner-1");
    expect(ids).toEqual(["team-a"]);
  });

  it("team member sees team job and individual job; not other team", { timeout: 60_000 }, async () => {
    mockState.admin = new MockSupabase({
      cleaners: [{ id: "cleaner-1" }],
      team_members: [
        { cleaner_id: "cleaner-1", team_id: "team-a" },
        { cleaner_id: "cleaner-2", team_id: "team-a" },
        { cleaner_id: "cleaner-3", team_id: "team-a" },
      ],
      bookings: [
        {
          id: "b-own",
          cleaner_id: "cleaner-1",
          team_id: null,
          is_team_job: false,
          status: "assigned",
          service: "Standard",
        },
        {
          id: "b-team",
          cleaner_id: null,
          team_id: "team-a",
          is_team_job: true,
          status: "assigned",
          service: "Deep",
          date: "2026-04-25",
          team_member_count_snapshot: 3,
        },
        {
          id: "b-other",
          cleaner_id: null,
          team_id: "team-z",
          is_team_job: true,
          status: "assigned",
          service: "Deep",
        },
      ],
    });

    const { GET } = await import("@/app/api/cleaner/jobs/route");
    const res = await GET(new Request("http://localhost/api/cleaner/jobs"));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { jobs: { id: string; teamMemberCount?: number | null }[] };
    const ids = json.jobs.map((j) => j.id).sort();
    expect(ids).toEqual(["b-own", "b-team"]);
    const teamRow = json.jobs.find((j) => j.id === "b-team");
    expect(teamRow?.teamMemberCount).toBe(3);
  });

  it("lite=1 keeps full visibility but omits line items and team roster payload", async () => {
    mockState.admin = new MockSupabase({
      cleaners: [{ id: "cleaner-1" }],
      team_members: [
        { cleaner_id: "cleaner-1", team_id: "team-a" },
        { cleaner_id: "cleaner-2", team_id: "team-a" },
      ],
      bookings: [
        {
          id: "b-own",
          cleaner_id: "cleaner-1",
          team_id: null,
          is_team_job: false,
          status: "assigned",
          service: "Standard",
        },
        {
          id: "b-team",
          cleaner_id: null,
          team_id: "team-a",
          is_team_job: true,
          status: "assigned",
          service: "Deep",
          date: "2026-04-25",
          team_member_count_snapshot: 2,
        },
      ],
    });

    const { GET } = await import("@/app/api/cleaner/jobs/route");
    const res = await GET(new Request("http://localhost/api/cleaner/jobs?lite=1"));
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      jobs: { id: string; lineItems?: unknown; team_roster?: unknown; team_roster_summary?: string | null }[];
    };
    const ids = json.jobs.map((j) => j.id).sort();
    expect(ids).toEqual(["b-own", "b-team"]);
    const teamRow = json.jobs.find((j) => j.id === "b-team");
    expect(teamRow?.lineItems).toBeNull();
    expect(teamRow?.team_roster).toEqual([]);
    expect(teamRow?.team_roster_summary).toBeNull();
  });

  it("view=card omits line items / roster and attaches scope_lines", async () => {
    mockState.admin = new MockSupabase({
      cleaners: [{ id: "cleaner-1" }],
      team_members: [{ cleaner_id: "cleaner-1", team_id: "team-a" }],
      bookings: [
        {
          id: "b-own",
          cleaner_id: "cleaner-1",
          team_id: null,
          is_team_job: false,
          status: "assigned",
          service: "Standard",
          date: "2026-05-01",
          time: "09:00",
          rooms: 2,
          bathrooms: 1,
          location: "1 Main Rd, Claremont",
        },
      ],
    });

    const { GET } = await import("@/app/api/cleaner/jobs/route");
    const res = await GET(new Request("http://localhost/api/cleaner/jobs?view=card"));
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      jobs: { id: string; lineItems?: unknown; scope_lines?: string[] }[];
    };
    expect(json.jobs).toHaveLength(1);
    const row = json.jobs[0]!;
    expect(row.lineItems).toBeNull();
    expect(Array.isArray(row.scope_lines)).toBe(true);
    expect((row.scope_lines ?? []).length).toBeGreaterThan(0);
  });
});

describe("GET /api/cleaner/dashboard", { timeout: 15_000 }, () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns jobs + summary with same visibility as jobs list", async () => {
    mockState.admin = new MockSupabase({
      cleaners: [{ id: "cleaner-1" }],
      team_members: [{ cleaner_id: "cleaner-1", team_id: "team-a" }],
      bookings: [
        { id: "b-own", cleaner_id: "cleaner-1", status: "assigned", service: "Standard", date: "2026-05-01", time: "09:00" },
        {
          id: "b-team",
          cleaner_id: null,
          team_id: "team-a",
          is_team_job: true,
          status: "assigned",
          service: "Deep",
          date: "2026-05-02",
          time: "10:00",
        },
      ],
    });
    const { GET } = await import("@/app/api/cleaner/dashboard/route");
    const res = await GET(new Request("http://localhost/api/cleaner/dashboard"));
    expect(res.status).toBe(200);
    const j = (await res.json()) as {
      jobs: { id: string }[];
      summary: { today_cents: number; today_breakdown: unknown[]; earnings_timezone: string };
    };
    expect(j.jobs.map((x) => x.id).sort()).toEqual(["b-own", "b-team"]);
    expect(typeof j.summary.today_cents).toBe("number");
    expect(Array.isArray(j.summary.today_breakdown)).toBe(true);
    expect(j.summary.earnings_timezone).toBe("Africa/Johannesburg");
  });

  it("caps dashboard jobs at 12 and dedupes duplicate booking ids", async () => {
    const many = Array.from({ length: 14 }, (_, i) => ({
      id: `b-${i}`,
      cleaner_id: "cleaner-1",
      status: "assigned",
      service: "Standard",
      date: `2026-05-${String(10 + i).padStart(2, "0")}`,
      time: "09:00",
    }));
    mockState.admin = new MockSupabase({
      cleaners: [{ id: "cleaner-1" }],
      team_members: [],
      bookings: many,
    });
    const { GET } = await import("@/app/api/cleaner/dashboard/route");
    const res = await GET(new Request("http://localhost/api/cleaner/dashboard"));
    expect(res.status).toBe(200);
    const capped = (await res.json()) as { jobs: { id: string }[] };
    expect(capped.jobs.length).toBe(12);

    mockState.admin = new MockSupabase({
      cleaners: [{ id: "cleaner-1" }],
      team_members: [],
      bookings: [
        { id: "b-dup", cleaner_id: "cleaner-1", status: "assigned", service: "A", date: "2026-06-01", time: "08:00" },
        { id: "b-dup", cleaner_id: "cleaner-1", status: "assigned", service: "B", date: "2026-06-01", time: "09:00" },
        { id: "b-x", cleaner_id: "cleaner-1", status: "assigned", service: "C", date: "2026-06-02", time: "10:00" },
      ],
    });
    const res2 = await GET(new Request("http://localhost/api/cleaner/dashboard"));
    expect(res2.status).toBe(200);
    const deduped = (await res2.json()) as { jobs: { id: string }[] };
    expect(deduped.jobs.filter((x) => x.id === "b-dup").length).toBe(1);
    expect(deduped.jobs.some((x) => x.id === "b-x")).toBe(true);
  });
});
