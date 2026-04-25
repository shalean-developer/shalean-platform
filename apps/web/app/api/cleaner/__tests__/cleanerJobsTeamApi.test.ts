import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;

const mockState: { admin: MockSupabase | null } = { admin: null };

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => mockState.admin,
}));

vi.mock("@/lib/cleaner/session", () => ({
  resolveCleanerIdFromRequest: async () => ({ cleanerId: "cleaner-1", status: 200 }),
}));

function rowMatchesVisibilityOr(row: Row, expr: string): boolean {
  const head = /^cleaner_id\.eq\.([^,]+)/.exec(expr);
  if (head && String(row.cleaner_id ?? "") === head[1]) return true;
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
  private idEq: unknown;
  constructor(private db: MockSupabase) {}
  select() {
    return this;
  }
  eq(_col: string, value: unknown) {
    this.idEq = value;
    return this;
  }
  maybeSingle() {
    const hit = this.db.tables.cleaners.find((r) => r.id === this.idEq);
    return Promise.resolve({ data: hit ?? null, error: null });
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

class MockSupabase {
  tables: { cleaners: Row[]; team_members: Row[]; bookings: Row[] };

  constructor(seed: { cleaners?: Row[]; team_members?: Row[]; bookings?: Row[] }) {
    this.tables = {
      cleaners: seed.cleaners ?? [],
      team_members: seed.team_members ?? [],
      bookings: seed.bookings ?? [],
    };
  }

  from(table: string) {
    if (table === "bookings") return new BookingsQuery(this.tables.bookings) as unknown as CleanersQuery;
    if (table === "cleaners") return new CleanersQuery(this);
    if (table === "team_members") return new TeamMembersQuery(this);
    throw new Error(`unexpected table ${table}`);
  }
}

describe("GET /api/cleaner/jobs — team visibility", () => {
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

  it("team member sees team job and individual job; not other team", async () => {
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
});
