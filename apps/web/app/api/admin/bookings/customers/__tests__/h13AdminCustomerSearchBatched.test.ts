import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * H-13: Admin customer search must NOT issue per-row profile / auth lookups.
 *
 * The legacy `pushRowFromProfileAndAuth` helper did:
 *   - `from("user_profiles").select(...).eq("id", userId).maybeSingle()` per user
 *   - `auth.admin.getUserById(userId)` per user
 *
 * For 50 matched users that meant ~100 round trips. The refactor replaces both
 * with batched calls:
 *   - one `from("user_profiles").select(...).in("id", uniqIds)` query
 *   - one paginated `auth.admin.listUsers` scan that captures both the auth
 *     needle matches AND the profile-ilike ids in a single pass
 *
 * These assertions pin down:
 *   1. Output shape is unchanged (id / email / full_name / billing_type / schedule_type).
 *   2. Profile lookup is batched (single `.in("id", …)` call, no per-row `.eq("id", …)`).
 *   3. Auth lookup is not called once per row (zero `getUserById` for multi-row paths).
 *   4. Missing profiles still use safe defaults (`per_booking` / `on_demand`).
 *   5. Search pagination / limits remain correct (capped at 20 rows, ilike `.limit(15)`).
 */

const ADMIN_EMAIL = "ops@example.com";
const ADMIN_USER_ID = "00000000-0000-4000-8000-000000000099";

vi.mock("@/lib/auth/requireAdminApi", () => ({
  requireAdminApi: vi.fn(async (request: Request) => {
    const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
    if (!token) return { ok: false, status: 401, error: "Missing authorization." };
    return { ok: true, userId: ADMIN_USER_ID, email: ADMIN_EMAIL };
  }),
}));

type ProfileRow = {
  id: string;
  full_name: string | null;
  billing_type: string | null;
  schedule_type: string | null;
};

type AuthUser = {
  id: string;
  email: string | null;
  user_metadata?: Record<string, unknown>;
};

type AdminMockState = {
  ilikeProfiles: ProfileRow[];
  ilikePattern: string | null;
  ilikeLimit: number | null;
  ilikeCalls: number;
  inIds: string[][];
  inCalls: number;
  eqIds: string[];
  eqCalls: number;
  authPages: AuthUser[][];
  listUsersCalls: Array<{ page: number; perPage: number }>;
  getUserByIdCalls: string[];
  rpcCalls: Array<{ fn: string; args: unknown }>;
  bookingsLookups: number;
};

function makeAdminMock(state: AdminMockState) {
  const profileBuilder = (selectedCols: string) => ({
    selectedCols,
    ilike(col: string, pattern: string) {
      state.ilikePattern = pattern;
      const rows = state.ilikeProfiles;
      return {
        async limit(n: number) {
          state.ilikeLimit = n;
          state.ilikeCalls += 1;
          return { data: rows.slice(0, n), error: null };
        },
      };
    },
    in(col: string, ids: string[]) {
      state.inIds.push([...ids]);
      state.inCalls += 1;
      const set = new Set(ids);
      const data = [
        ...state.ilikeProfiles.filter((p) => set.has(p.id)),
      ];
      // Awaitable thenable.
      return {
        then(resolve: (value: { data: ProfileRow[]; error: null }) => void) {
          resolve({ data, error: null });
        },
      };
    },
    eq(col: string, id: string) {
      state.eqIds.push(id);
      state.eqCalls += 1;
      return {
        async maybeSingle() {
          const found = state.ilikeProfiles.find((p) => p.id === id) ?? null;
          return { data: found, error: null };
        },
      };
    },
  });

  const bookingsBuilder = () => ({
    select() {
      return {
        eq() {
          return {
            not() {
              return {
                order() {
                  return {
                    limit() {
                      return {
                        async maybeSingle() {
                          state.bookingsLookups += 1;
                          return { data: null, error: null };
                        },
                      };
                    },
                  };
                },
              };
            },
          };
        },
      };
    },
  });

  return {
    from(table: string) {
      if (table === "user_profiles") {
        return {
          select: (cols: string) => profileBuilder(cols),
        };
      }
      if (table === "bookings") {
        return bookingsBuilder();
      }
      throw new Error(`Unexpected table: ${table}`);
    },
    auth: {
      admin: {
        async listUsers(opts: { page: number; perPage: number }) {
          state.listUsersCalls.push({ page: opts.page, perPage: opts.perPage });
          const users = state.authPages[opts.page - 1] ?? [];
          return { data: { users }, error: null };
        },
        async getUserById(userId: string) {
          state.getUserByIdCalls.push(userId);
          for (const page of state.authPages) {
            const u = page.find((x) => x.id === userId);
            if (u) return { data: { user: u }, error: null };
          }
          return { data: { user: null }, error: null };
        },
      },
    },
    async rpc(fn: string, args: unknown) {
      state.rpcCalls.push({ fn, args });
      return { data: null, error: null };
    },
  };
}

const adminState: AdminMockState = {
  ilikeProfiles: [],
  ilikePattern: null,
  ilikeLimit: null,
  ilikeCalls: 0,
  inIds: [],
  inCalls: 0,
  eqIds: [],
  eqCalls: 0,
  authPages: [],
  listUsersCalls: [],
  getUserByIdCalls: [],
  rpcCalls: [],
  bookingsLookups: 0,
};

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => makeAdminMock(adminState),
}));

vi.mock("@/lib/cleaner/linkCleanerAuth", () => ({
  findAuthUserIdByEmail: vi.fn(async () => null),
}));

import { GET, type AdminCustomerSearchRow } from "../route";

function resetState(next: Partial<AdminMockState>) {
  adminState.ilikeProfiles = next.ilikeProfiles ?? [];
  adminState.ilikePattern = null;
  adminState.ilikeLimit = null;
  adminState.ilikeCalls = 0;
  adminState.inIds = [];
  adminState.inCalls = 0;
  adminState.eqIds = [];
  adminState.eqCalls = 0;
  adminState.authPages = next.authPages ?? [];
  adminState.listUsersCalls = [];
  adminState.getUserByIdCalls = [];
  adminState.rpcCalls = [];
  adminState.bookingsLookups = 0;
}

function adminGet(qs: string) {
  return GET(
    new Request(`http://localhost/api/admin/bookings/customers${qs}`, {
      headers: { Authorization: "Bearer admin-token" },
    }),
  );
}

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon";
  process.env.ADMIN_EMAIL = ADMIN_EMAIL;
});

describe("H-13 admin booking customer search — batched profile/auth lookups", () => {
  it("name search: response shape, batched profile lookup, no per-row getUserById", async () => {
    // Two profile-ilike hits + two auth-only hits whose metadata matches the
    // needle ("foo"). All four ids must appear in the response with the
    // canonical shape.
    const profileRows: ProfileRow[] = [
      {
        id: "11111111-1111-4111-8111-111111111111",
        full_name: "Foo Bar",
        billing_type: "monthly_contract",
        schedule_type: "recurring",
      },
      {
        id: "22222222-2222-4222-8222-222222222222",
        full_name: "Foo Baz",
        billing_type: null,
        schedule_type: null,
      },
    ];
    const authPage: AuthUser[] = [
      // Profile-ilike-matched users — auth listUsers will capture them
      // via the captureIds set.
      {
        id: "11111111-1111-4111-8111-111111111111",
        email: "foobar@example.com",
        user_metadata: { full_name: "Foo Bar (auth-meta)" },
      },
      {
        id: "22222222-2222-4222-8222-222222222222",
        email: "FooBaz@Example.com",
        user_metadata: { name: "Foobaz Display" },
      },
      // Auth-only matches (metadata or email contains "foo") with no
      // `user_profiles` row — must still appear with safe defaults.
      {
        id: "33333333-3333-4333-8333-333333333333",
        email: "third+foo@example.com",
        user_metadata: { full_name: "Third Foo" },
      },
      {
        id: "44444444-4444-4444-8444-444444444444",
        email: "noprofile@example.com",
        user_metadata: { full_name: "Foo Without Profile" },
      },
    ];

    resetState({ ilikeProfiles: profileRows, authPages: [authPage] });
    const res = await adminGet("?q=foo");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { customers: AdminCustomerSearchRow[] };
    expect(Array.isArray(body.customers)).toBe(true);

    // 1. SHAPE — every row exposes the exact 5 keys (no leakage).
    for (const row of body.customers) {
      expect(Object.keys(row).sort()).toEqual([
        "billing_type",
        "email",
        "full_name",
        "id",
        "schedule_type",
      ]);
    }

    // Profile-ilike rows preserve their stored values.
    const byId = new Map(body.customers.map((r) => [r.id, r] as const));
    const r1 = byId.get("11111111-1111-4111-8111-111111111111");
    expect(r1).toBeDefined();
    expect(r1?.email).toBe("foobar@example.com");
    expect(r1?.full_name).toBe("Foo Bar");
    expect(r1?.billing_type).toBe("monthly_contract");
    expect(r1?.schedule_type).toBe("recurring");

    const r2 = byId.get("22222222-2222-4222-8222-222222222222");
    expect(r2).toBeDefined();
    expect(r2?.email).toBe("foobaz@example.com");
    expect(r2?.full_name).toBe("Foo Baz");
    // 4. SAFE DEFAULTS for null profile fields.
    expect(r2?.billing_type).toBe("per_booking");
    expect(r2?.schedule_type).toBe("on_demand");

    // Profile-ilike hits emitted before auth-only hits.
    expect(body.customers[0]?.id).toBe(profileRows[0]?.id);
    expect(body.customers[1]?.id).toBe(profileRows[1]?.id);

    // 2. BATCHED PROFILE LOOKUP — exactly one ilike + one .in() call.
    expect(adminState.ilikeCalls).toBe(1);
    expect(adminState.inCalls).toBe(1);
    // The single .in() request must contain the auth-only ids
    // (profile-ilike ids are already known so they're not queried again).
    expect(adminState.inIds[0]?.sort()).toEqual(
      [
        "33333333-3333-4333-8333-333333333333",
        "44444444-4444-4444-8444-444444444444",
      ].sort(),
    );
    // Per-row `.eq("id", id)` lookups must NOT be used in this path.
    expect(adminState.eqCalls).toBe(0);

    // 3. AUTH NOT-PER-ROW — exactly one paginated listUsers call (4 users
    // returned in one page < 1000 → loop exits) and zero `getUserById`s.
    expect(adminState.listUsersCalls.length).toBe(1);
    expect(adminState.listUsersCalls[0]).toEqual({ page: 1, perPage: 1000 });
    expect(adminState.getUserByIdCalls).toEqual([]);

    // 5. PAGINATION / LIMITS — ilike limit 15.
    expect(adminState.ilikeLimit).toBe(15);
  });

  it("missing profiles still use safe defaults (per_booking / on_demand)", async () => {
    // Auth-needle hit with no profile row at all — billing_type and
    // schedule_type must still be set to the documented defaults.
    const authPage: AuthUser[] = [
      {
        id: "55555555-5555-4555-8555-555555555555",
        email: "lonely+foo@example.com",
        user_metadata: { full_name: "Lonely Auth User" },
      },
    ];
    resetState({ ilikeProfiles: [], authPages: [authPage] });

    const res = await adminGet("?q=foo");
    const body = (await res.json()) as { customers: AdminCustomerSearchRow[] };
    expect(body.customers.length).toBe(1);
    const row = body.customers[0]!;
    expect(row.id).toBe("55555555-5555-4555-8555-555555555555");
    expect(row.email).toBe("lonely+foo@example.com");
    expect(row.full_name).toBe("Lonely Auth User");
    expect(row.billing_type).toBe("per_booking");
    expect(row.schedule_type).toBe("on_demand");
    // Still no per-row auth fan-out, even when only one profile id is missing.
    expect(adminState.getUserByIdCalls).toEqual([]);
    // The .in() lookup is skipped if the id list is empty; here we have one
    // missing id (the auth hit) so a single batched lookup is expected.
    expect(adminState.inCalls).toBe(1);
    expect(adminState.eqCalls).toBe(0);
  });

  it("output is capped at 20 customers regardless of profile + auth match volume", async () => {
    // 30 profile-ilike rows + 30 auth-needle hits → 60 candidates, but the
    // route caps at 20 (ilike returns 15, then auth fills up to 20).
    const profileRows: ProfileRow[] = Array.from({ length: 30 }, (_, i) => ({
      id: `aaaaaaaa-aaaa-4aaa-8aaa-${String(i).padStart(12, "0")}`,
      full_name: `Foo Profile ${i}`,
      billing_type: "per_booking",
      schedule_type: "on_demand",
    }));
    const authPage: AuthUser[] = Array.from({ length: 30 }, (_, i) => ({
      id: `bbbbbbbb-bbbb-4bbb-8bbb-${String(i).padStart(12, "0")}`,
      email: `extra${i}+foo@example.com`,
      user_metadata: { full_name: `Foo Auth ${i}` },
    }));

    resetState({ ilikeProfiles: profileRows, authPages: [authPage] });
    const res = await adminGet("?q=foo");
    const body = (await res.json()) as { customers: AdminCustomerSearchRow[] };
    expect(body.customers.length).toBe(20);

    // First 15 must be profile-ilike rows (they're emitted first), then 5
    // auth-only rows fill up to the 20-row cap.
    for (let i = 0; i < 15; i++) {
      expect(body.customers[i]?.id).toBe(profileRows[i]?.id);
    }
    for (let i = 15; i < 20; i++) {
      expect(body.customers[i]?.id?.startsWith("bbbbbbbb")).toBe(true);
    }

    // Still exactly one batched profile lookup and one listUsers call.
    expect(adminState.inCalls).toBe(1);
    expect(adminState.eqCalls).toBe(0);
    expect(adminState.listUsersCalls.length).toBe(1);
    expect(adminState.getUserByIdCalls).toEqual([]);
  });

  it("email-substring fallback uses the batched profile loader (no per-row eq)", async () => {
    // No full email match → falls through to listUsers substring scan.
    // Auth hits' profiles are loaded via a single `.in("id", ids)` query.
    const profileRows: ProfileRow[] = [
      {
        id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        full_name: "Stored Name",
        billing_type: "monthly_contract",
        schedule_type: "recurring",
      },
    ];
    const authPage: AuthUser[] = [
      {
        id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        email: "stored@example.com",
        user_metadata: { full_name: "Auth Meta Name" },
      },
      {
        id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        email: "noprofile@example.com",
        user_metadata: { full_name: "Auth Only" },
      },
    ];
    resetState({ ilikeProfiles: profileRows, authPages: [authPage] });

    // q contains "@" but is not a full email (no local-part) — the
    // FULL_EMAIL regex fails, skipping `findAuthUserIdByEmail` and routing
    // to the listUsers scan whose needle is `q`. Both seeded users' emails
    // contain `@example.com` as a substring so they both match.
    const res = await adminGet(`?q=${encodeURIComponent("@example.com")}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { customers: AdminCustomerSearchRow[] };
    expect(body.customers.length).toBe(2);

    // Profile data is still applied for the matching id.
    const stored = body.customers.find(
      (r) => r.id === "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    );
    expect(stored?.full_name).toBe("Stored Name");
    expect(stored?.billing_type).toBe("monthly_contract");
    expect(stored?.schedule_type).toBe("recurring");

    // Profile fallback for auth-only hit.
    const lonely = body.customers.find(
      (r) => r.id === "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    );
    expect(lonely?.full_name).toBe("Auth Only");
    expect(lonely?.billing_type).toBe("per_booking");
    expect(lonely?.schedule_type).toBe("on_demand");

    // Single batched profile lookup, no per-row .eq().
    expect(adminState.inCalls).toBe(1);
    expect(adminState.eqCalls).toBe(0);
    // Single listUsers call, zero getUserById.
    expect(adminState.listUsersCalls.length).toBe(1);
    expect(adminState.getUserByIdCalls).toEqual([]);
  });

  it("listUsers pagination terminates correctly when a page returns < 1000 users", async () => {
    // Two pages: page 1 returns a full 1000-user page (none match the
    // needle), page 2 returns 1 matching user (< 1000 → loop exits).
    // The route must paginate all the way to page 2 and stop after.
    const filler: AuthUser[] = Array.from({ length: 1000 }, (_, i) => ({
      id: `eeeeeeee-eeee-4eee-8eee-${String(i).padStart(12, "0")}`,
      email: `noise${i}@example.com`,
      user_metadata: { full_name: `Noise ${i}` },
    }));
    const matching: AuthUser[] = [
      {
        id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
        email: "wanted+foo@example.com",
        user_metadata: { full_name: "Wanted Foo" },
      },
    ];
    resetState({ ilikeProfiles: [], authPages: [filler, matching] });

    const res = await adminGet("?q=foo");
    const body = (await res.json()) as { customers: AdminCustomerSearchRow[] };
    expect(body.customers.length).toBe(1);
    expect(body.customers[0]?.id).toBe("ffffffff-ffff-4fff-8fff-ffffffffffff");

    // Both pages requested, no third page (page 2 returned 1 user < 1000).
    expect(adminState.listUsersCalls.length).toBe(2);
    expect(adminState.listUsersCalls[0]?.page).toBe(1);
    expect(adminState.listUsersCalls[1]?.page).toBe(2);
    // Still no per-row auth lookup.
    expect(adminState.getUserByIdCalls).toEqual([]);
  });

  it("returns 401 without authorization (security guard preserved)", async () => {
    resetState({});
    const res = await GET(new Request("http://localhost/api/admin/bookings/customers?q=foo"));
    expect(res.status).toBe(401);
    expect(adminState.listUsersCalls.length).toBe(0);
    expect(adminState.inCalls).toBe(0);
  });
});
