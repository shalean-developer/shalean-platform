import { beforeEach, describe, expect, it, vi } from "vitest";

import { ensureUserProfileForAuthUser } from "@/lib/admin/ensureUserProfileForAuthUser";

type MaybeSingleResult<T> = { data: T | null; error: { message: string } | null };

type ExistingProfile = {
  billing_type: string | null;
  schedule_type: string | null;
  role?: string | null;
};

type AuthUserMeta = {
  full_name?: unknown;
  name?: unknown;
  phone?: unknown;
};

type FakeAdmin = {
  reads: number;
  inserts: Array<Record<string, unknown>>;
  authGetCalls: number;
};

function buildFakeAdmin(opts: {
  initialProfile: ExistingProfile | null;
  authMeta: AuthUserMeta | null;
  authEmail?: string | null;
  authError?: string | null;
  insertError?: string | null;
  racedProfileAfterInsertError?: ExistingProfile | null;
  readError?: string | null;
}): { admin: unknown; state: FakeAdmin } {
  const state: FakeAdmin = { reads: 0, inserts: [], authGetCalls: 0 };
  let profileRow: (ExistingProfile & { id: string }) | null = opts.initialProfile
    ? { id: ID_VALID, ...opts.initialProfile }
    : null;
  const insertError = opts.insertError ?? null;

  const admin = {
    from(table: string) {
      if (table === "cleaners") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: null, error: null }),
            }),
          }),
        };
      }
      if (table !== "user_profiles") throw new Error(`unexpected table ${table}`);
      return {
        select(_cols?: string) {
          return {
            eq() {
              return {
                async maybeSingle(): Promise<MaybeSingleResult<ExistingProfile & { id?: string }>> {
                  state.reads += 1;
                  if (opts.readError) {
                    return { data: null, error: { message: opts.readError } };
                  }
                  if (!profileRow) return { data: null, error: null };
                  if (_cols === "id") {
                    return {
                      data: { id: profileRow.id, billing_type: null, schedule_type: null },
                      error: null,
                    };
                  }
                  return {
                    data: {
                      billing_type: profileRow.billing_type,
                      schedule_type: profileRow.schedule_type,
                      role: profileRow.role ?? null,
                    },
                    error: null,
                  };
                },
                is: async () => ({ error: null }),
              };
            },
          };
        },
        update: () => ({
          eq: () => ({
            is: async () => ({ error: null }),
          }),
        }),
        async insert(row: Record<string, unknown>) {
          state.inserts.push(row);
          if (insertError) {
            if (opts.racedProfileAfterInsertError) {
              profileRow = { id: ID_VALID, ...opts.racedProfileAfterInsertError };
            }
            return { data: null, error: { message: insertError } };
          }
          profileRow = {
            id: ID_VALID,
            billing_type: String(row.billing_type ?? "per_booking"),
            schedule_type: String(row.schedule_type ?? "on_demand"),
            role: typeof row.role === "string" ? row.role : "customer",
          };
          return { data: null, error: null };
        },
      };
    },
    auth: {
      admin: {
        async getUserById(id: string) {
          state.authGetCalls += 1;
          if (opts.authError) return { data: null, error: { message: opts.authError } };
          if (!opts.authMeta) return { data: null, error: { message: "not found" } };
          return {
            data: {
              user: {
                id,
                email: opts.authEmail ?? "customer@example.com",
                user_metadata: opts.authMeta,
              },
            },
            error: null,
          };
        },
      },
    },
  };

  return { admin, state };
}

const ID_VALID = "b5d7b82a-4b88-4fc9-b3fe-b1323d871aa2";

describe("ensureUserProfileForAuthUser", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns existing profile billing/schedule and does not insert", async () => {
    const { admin, state } = buildFakeAdmin({
      initialProfile: { billing_type: "monthly", schedule_type: "recurring", role: "customer" },
      authMeta: null,
    });
    const res = (await ensureUserProfileForAuthUser(admin as never, ID_VALID)) as {
      billing_type: string;
      schedule_type: string;
      created: boolean;
    };
    expect(res.billing_type).toBe("monthly");
    expect(res.schedule_type).toBe("recurring");
    expect(res.created).toBe(false);
    expect(state.inserts).toEqual([]);
    expect(state.authGetCalls).toBe(0);
  });

  it("creates a default per_booking / on_demand profile when missing, using auth metadata full_name", async () => {
    const { admin, state } = buildFakeAdmin({
      initialProfile: null,
      authMeta: { full_name: "Farai Chitekedza" },
    });
    const res = (await ensureUserProfileForAuthUser(admin as never, ID_VALID)) as {
      billing_type: string;
      schedule_type: string;
      created: boolean;
    };
    expect(res.created).toBe(true);
    expect(res.billing_type).toBe("per_booking");
    expect(res.schedule_type).toBe("on_demand");
    expect(state.authGetCalls).toBe(1);
    expect(state.inserts).toHaveLength(1);
    expect(state.inserts[0]).toMatchObject({
      id: ID_VALID,
      billing_type: "per_booking",
      schedule_type: "on_demand",
      tier: "regular",
      booking_count: 0,
      total_spent_cents: 0,
      full_name: "Farai Chitekedza",
      role: "customer",
    });
  });

  it("falls back to user_metadata.name when full_name is missing", async () => {
    const { admin, state } = buildFakeAdmin({
      initialProfile: null,
      authMeta: { name: "Walk-In Customer" },
    });
    await ensureUserProfileForAuthUser(admin as never, ID_VALID);
    expect(state.inserts[0]?.full_name).toBe("Walk-In Customer");
  });

  it("omits full_name when auth metadata has no usable name", async () => {
    const { admin, state } = buildFakeAdmin({
      initialProfile: null,
      authMeta: {},
    });
    await ensureUserProfileForAuthUser(admin as never, ID_VALID);
    expect(state.inserts[0]?.full_name).toBeUndefined();
  });

  it("rejects an obviously invalid user id without touching the database", async () => {
    const { admin, state } = buildFakeAdmin({ initialProfile: null, authMeta: null });
    const res = await ensureUserProfileForAuthUser(admin as never, "not-a-uuid");
    expect(res).toEqual({ error: "Invalid user id." });
    expect(state.reads).toBe(0);
    expect(state.inserts).toEqual([]);
    expect(state.authGetCalls).toBe(0);
  });

  it("returns the read error when the initial select fails", async () => {
    const { admin, state } = buildFakeAdmin({
      initialProfile: null,
      authMeta: null,
      readError: "select boom",
    });
    const res = await ensureUserProfileForAuthUser(admin as never, ID_VALID);
    expect(res).toEqual({ error: "select boom" });
    expect(state.inserts).toEqual([]);
  });

  it("surfaces an Auth-not-found error when no profile exists and auth lookup fails", async () => {
    const { admin } = buildFakeAdmin({
      initialProfile: null,
      authMeta: null,
      authError: "auth gone",
    });
    const res = await ensureUserProfileForAuthUser(admin as never, ID_VALID);
    expect(res).toEqual({ error: "Auth user not found." });
  });

  it("recovers gracefully when a concurrent write races the insert", async () => {
    const { admin, state } = buildFakeAdmin({
      initialProfile: null,
      authMeta: { full_name: "Race Winner" },
      insertError: "duplicate key value violates unique constraint",
      racedProfileAfterInsertError: { billing_type: "monthly", schedule_type: "recurring", role: "customer" },
    });
    const res = (await ensureUserProfileForAuthUser(admin as never, ID_VALID)) as {
      billing_type: string;
      schedule_type: string;
      created: boolean;
    };
    expect(res.created).toBe(false);
    expect(res.billing_type).toBe("monthly");
    expect(res.schedule_type).toBe("recurring");
    expect(state.reads).toBeGreaterThanOrEqual(2);
  });

  it("returns the insert error when no row is found after the failed insert", async () => {
    const { admin } = buildFakeAdmin({
      initialProfile: null,
      authMeta: { full_name: "x" },
      insertError: "permission denied",
      racedProfileAfterInsertError: null,
    });
    const res = await ensureUserProfileForAuthUser(admin as never, ID_VALID);
    expect(res).toEqual({ error: "permission denied" });
  });
});
