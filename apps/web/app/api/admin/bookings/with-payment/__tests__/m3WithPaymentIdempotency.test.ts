import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * M-3: `POST /api/admin/bookings/with-payment` previously bypassed the
 * `admin_booking_create_idempotency` claim used by `POST /api/admin/bookings`,
 * so a double-click could create two `pending_payment` rows + two Paystack
 * `initialize` sessions for the same customer + slot.
 *
 * The fix wires the same {@link claimAdminBookingCreateIdempotency} /
 * {@link finalizeAdminBookingCreateIdempotency} / {@link abandonAdminBookingCreateIdempotency}
 * flow into the new-checkout path of `with-payment`, so identical retries
 * (matching `Idempotency-Key` + customer + slot + service + location fingerprint)
 * replay the cached response without re-running Paystack.
 *
 * Constraints preserved by these tests:
 *   - Response shape is unchanged (same keys: ok / reused / authorizationUrl /
 *     reference / bookingId / payment_status / payment_link_expires_at).
 *   - Paystack pipeline is not modified — `processPaystackInitializeBody` and
 *     `finalizeAdminPaystackCheckout` are still called exactly once per real
 *     booking creation.
 *   - The `bookingId` reuse path (already idempotent before M-3) is not gated
 *     by the new claim — it short-circuits earlier.
 */

const authState = vi.hoisted(() => ({
  userEmail: "ops@example.com",
}));

type IdempotencyRow = {
  id: string;
  idempotency_key: string;
  route: string;
  customer_user_id: string;
  service_date: string;
  service_time: string;
  service_slug: string;
  location_hash: string;
  pending: boolean;
  status_code: number | null;
  response_body: unknown;
  created_at: string;
};

const idempotencyState = vi.hoisted(() => ({
  rows: [] as Array<{
    id: string;
    idempotency_key: string;
    route: string;
    customer_user_id: string;
    service_date: string;
    service_time: string;
    service_slug: string;
    location_hash: string;
    pending: boolean;
    status_code: number | null;
    response_body: unknown;
    created_at: string;
  }>,
  bookings: [] as Array<{ id: string; user_id: string | null; status: string | null }>,
  rpcCalls: [] as Array<{ fn: string; args: Record<string, unknown> }>,
  insertCallCount: 0,
  updateCallCount: 0,
  deleteCallCount: 0,
  bookingsSelectCallCount: 0,
}));

const fakeAdminUuid = "00000000-0000-4000-8000-000000000099";
const fakeCustomerUid = "11111111-1111-4111-8111-111111111111";

const { processPaystackInitializeBodyMock, finalizeAdminPaystackCheckoutMock, sendAdminPaystackDeliveryForRowMock } =
  vi.hoisted(() => ({
    processPaystackInitializeBodyMock: vi.fn(),
    finalizeAdminPaystackCheckoutMock: vi.fn(),
    sendAdminPaystackDeliveryForRowMock: vi.fn(),
  }));

vi.mock("@/lib/booking/paystackInitializeCore", () => ({
  processPaystackInitializeBody: (...args: unknown[]) => processPaystackInitializeBodyMock(...args),
}));

vi.mock("@/lib/admin/adminPaystackPostInitialize", () => ({
  finalizeAdminPaystackCheckout: (...args: unknown[]) => finalizeAdminPaystackCheckoutMock(...args),
  sendAdminPaystackDeliveryForRow: (...args: unknown[]) => sendAdminPaystackDeliveryForRowMock(...args),
}));

vi.mock("@/lib/logging/systemLog", () => ({
  logSystemEvent: vi.fn(async () => undefined),
  reportOperationalIssue: vi.fn(async () => undefined),
}));

const adminClientMock = vi.hoisted(() => ({}));

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => adminClientMock,
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn(async () => ({
        data: {
          user: { id: fakeAdminUuid, email: authState.userEmail },
        },
        error: null,
      })),
    },
  })),
}));

function makeFromBookingsBuilder(bookingId: string) {
  const row = idempotencyState.bookings.find((b) => b.id === bookingId) ?? {
    id: bookingId,
    user_id: fakeCustomerUid,
    status: "pending_payment",
  };
  return {
    eq() {
      return this;
    },
    async maybeSingle() {
      idempotencyState.bookingsSelectCallCount += 1;
      return { data: { ...row, payment_status: "pending", payment_link: null } as Record<string, unknown>, error: null };
    },
  };
}

function makeIdempotencyBuilder() {
  let pendingInsert: Omit<IdempotencyRow, "id" | "created_at"> | null = null;
  let pendingMatch: Partial<IdempotencyRow> | null = null;
  let pendingUpdate: Partial<IdempotencyRow> | null = null;
  const pendingFilter: { eqId?: string } = {};
  let mode: "insert" | "select_match" | "update" | "delete" | null = null;

  const builder: Record<string, unknown> = {
    insert(row: Omit<IdempotencyRow, "id" | "created_at">) {
      mode = "insert";
      pendingInsert = row;
      idempotencyState.insertCallCount += 1;
      return builder;
    },
    select() {
      return builder;
    },
    update(patch: Partial<IdempotencyRow>) {
      mode = "update";
      pendingUpdate = patch;
      idempotencyState.updateCallCount += 1;
      return builder;
    },
    delete() {
      mode = "delete";
      idempotencyState.deleteCallCount += 1;
      return builder;
    },
    match(filter: Partial<IdempotencyRow>) {
      mode = "select_match";
      pendingMatch = filter;
      return builder;
    },
    eq(col: string, val: string) {
      if (col === "id") pendingFilter.eqId = val;
      return builder;
    },
    async maybeSingle() {
      if (mode === "insert" && pendingInsert) {
        const dup = idempotencyState.rows.find(
          (r) =>
            r.idempotency_key === pendingInsert!.idempotency_key &&
            r.route === pendingInsert!.route &&
            r.customer_user_id === pendingInsert!.customer_user_id &&
            r.service_date === pendingInsert!.service_date &&
            r.service_time === pendingInsert!.service_time &&
            r.service_slug === pendingInsert!.service_slug &&
            r.location_hash === pendingInsert!.location_hash,
        );
        if (dup) {
          return { data: null, error: { code: "23505", message: "duplicate" } };
        }
        const id = `claim-${idempotencyState.rows.length + 1}`;
        const newRow: IdempotencyRow = {
          ...pendingInsert,
          id,
          created_at: new Date().toISOString(),
        };
        idempotencyState.rows.push(newRow);
        return { data: { id }, error: null };
      }
      if (mode === "select_match" && pendingMatch) {
        const r = idempotencyState.rows.find((r) =>
          Object.entries(pendingMatch!).every(([k, v]) => (r as Record<string, unknown>)[k] === v),
        );
        return { data: r ?? null, error: null };
      }
      return { data: null, error: null };
    },
    async then(resolve: (v: unknown) => unknown) {
      if (mode === "update" && pendingUpdate && pendingFilter.eqId) {
        const r = idempotencyState.rows.find((row) => row.id === pendingFilter.eqId);
        if (r) Object.assign(r, pendingUpdate);
        return resolve({ data: null, error: null });
      }
      if (mode === "delete" && pendingFilter.eqId) {
        const idx = idempotencyState.rows.findIndex((row) => row.id === pendingFilter.eqId);
        if (idx >= 0) idempotencyState.rows.splice(idx, 1);
        return resolve({ data: null, error: null });
      }
      return resolve({ data: null, error: null });
    },
  };
  return builder;
}

Object.assign(adminClientMock, {
  from(table: string) {
    if (table === "admin_booking_create_idempotency") return makeIdempotencyBuilder();
    if (table === "bookings") {
      let bookingId = "";
      const b: Record<string, unknown> = {
        select() {
          return b;
        },
        eq(col: string, val: string) {
          if (col === "id") bookingId = val;
          return b;
        },
        async maybeSingle() {
          return makeFromBookingsBuilder(bookingId).maybeSingle();
        },
      };
      return b;
    }
    return {
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
      insert: () => ({ select: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
      update: () => ({ eq: () => ({ then: (r: (v: unknown) => unknown) => r({ data: null, error: null }) }) }),
      delete: () => ({ eq: () => ({ then: (r: (v: unknown) => unknown) => r({ data: null, error: null }) }) }),
    };
  },
  async rpc(fn: string, args: Record<string, unknown>) {
    idempotencyState.rpcCalls.push({ fn, args });
    if (fn === "resolve_auth_user_id_by_email") {
      return { data: fakeCustomerUid, error: null };
    }
    return { data: null, error: null };
  },
});

import { POST } from "../route";

const sampleLocked = {
  locked: true,
  lockedAt: "2026-06-01T08:00:00.000Z",
  service: "standard",
  rooms: 2,
  bathrooms: 1,
  extras: [],
  location: "12 Main Street\nCape Town",
  date: "2026-06-01",
  time: "10:00",
  cleaningFrequency: "one_time" as const,
  finalPrice: 800,
  finalHours: 3,
  surge: 1,
  cleanersCount: 1,
};

function buildPayloadBody(): Record<string, unknown> {
  return {
    locked: sampleLocked,
    email: "customer@example.com",
    customer: {
      type: "guest",
      name: "Test Customer",
      email: "customer@example.com",
      phone: "0711111111",
    },
    tip: 0,
  };
}

function makeRequest(body: Record<string, unknown>, idemKey: string | null): Request {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: "Bearer fake-jwt",
  };
  if (idemKey) headers["Idempotency-Key"] = idemKey;
  return new Request("http://localhost/api/admin/bookings/with-payment", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

describe("M-3 POST /api/admin/bookings/with-payment idempotency", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon";
    process.env.ADMIN_EMAIL = "ops@example.com";
    authState.userEmail = "ops@example.com";

    idempotencyState.rows.length = 0;
    idempotencyState.bookings.length = 0;
    idempotencyState.rpcCalls.length = 0;
    idempotencyState.insertCallCount = 0;
    idempotencyState.updateCallCount = 0;
    idempotencyState.deleteCallCount = 0;
    idempotencyState.bookingsSelectCallCount = 0;

    processPaystackInitializeBodyMock.mockReset();
    finalizeAdminPaystackCheckoutMock.mockReset();
    sendAdminPaystackDeliveryForRowMock.mockReset();

    let createdCount = 0;
    processPaystackInitializeBodyMock.mockImplementation(async () => {
      createdCount += 1;
      const bookingId = `booking-${createdCount}`;
      idempotencyState.bookings.push({ id: bookingId, user_id: fakeCustomerUid, status: "pending_payment" });
      return {
        ok: true,
        bookingId,
        authorizationUrl: `https://paystack.example/${bookingId}`,
        reference: `ref-${bookingId}`,
        status: 200,
        access_code: `ac-${bookingId}`,
      };
    });

    finalizeAdminPaystackCheckoutMock.mockResolvedValue({
      ok: true,
      expiresAt: "2026-06-02T00:00:00.000Z",
    });
  });

  it("first submit creates one booking + payment link; second submit with same Idempotency-Key replays cached body", async () => {
    const body = buildPayloadBody();

    const r1 = await POST(makeRequest(body, "idem-key-001"));
    expect(r1.status).toBe(200);
    const j1 = (await r1.json()) as Record<string, unknown>;
    expect(j1).toMatchObject({
      ok: true,
      reused: false,
      bookingId: "booking-1",
      reference: "ref-booking-1",
      authorizationUrl: "https://paystack.example/booking-1",
      payment_link_expires_at: "2026-06-02T00:00:00.000Z",
    });
    expect(processPaystackInitializeBodyMock).toHaveBeenCalledTimes(1);
    expect(finalizeAdminPaystackCheckoutMock).toHaveBeenCalledTimes(1);

    const r2 = await POST(makeRequest(body, "idem-key-001"));
    expect(r2.status).toBe(200);
    expect(r2.headers.get("X-Idempotent-Replayed")).toBe("1");
    const j2 = (await r2.json()) as Record<string, unknown>;
    expect(j2).toMatchObject({
      ok: true,
      reused: false,
      bookingId: "booking-1",
      reference: "ref-booking-1",
      authorizationUrl: "https://paystack.example/booking-1",
      payment_link_expires_at: "2026-06-02T00:00:00.000Z",
    });
    expect(processPaystackInitializeBodyMock).toHaveBeenCalledTimes(1);
    expect(finalizeAdminPaystackCheckoutMock).toHaveBeenCalledTimes(1);

    expect(idempotencyState.bookings.length).toBe(1);
    expect(idempotencyState.rows.length).toBe(1);
    const stored = idempotencyState.rows[0];
    expect(stored.pending).toBe(false);
    expect(stored.status_code).toBe(200);
    expect((stored.response_body as Record<string, unknown>).bookingId).toBe("booking-1");
  });

  it("response shape is unchanged from pre-M-3 (same keys: ok / reused / authorizationUrl / reference / bookingId / payment_status / payment_link_expires_at)", async () => {
    const r = await POST(makeRequest(buildPayloadBody(), "idem-shape-1"));
    expect(r.status).toBe(200);
    const json = (await r.json()) as Record<string, unknown>;
    expect(Object.keys(json).sort()).toEqual(
      [
        "authorizationUrl",
        "bookingId",
        "ok",
        "payment_link_expires_at",
        "payment_status",
        "reference",
        "reused",
      ].sort(),
    );
    expect(json.reused).toBe(false);
  });

  it("replay returns the same cached response body even when Paystack mock is mutated to fail on retry (so second-attempt would have errored without idempotency)", async () => {
    const body = buildPayloadBody();
    const r1 = await POST(makeRequest(body, "idem-replay-mutate"));
    expect(r1.status).toBe(200);
    expect(processPaystackInitializeBodyMock).toHaveBeenCalledTimes(1);

    processPaystackInitializeBodyMock.mockImplementation(async () => ({
      ok: false,
      status: 503,
      errorCode: "PAYSTACK_DOWN",
      error: "Paystack unavailable",
    }));

    const r2 = await POST(makeRequest(body, "idem-replay-mutate"));
    expect(r2.status).toBe(200);
    expect(r2.headers.get("X-Idempotent-Replayed")).toBe("1");
    const j2 = (await r2.json()) as Record<string, unknown>;
    expect(j2.ok).toBe(true);
    expect(j2.bookingId).toBe("booking-1");
    expect(processPaystackInitializeBodyMock).toHaveBeenCalledTimes(1);
  });

  it("missing Idempotency-Key skips the claim — Paystack runs (legacy behavior preserved)", async () => {
    const r1 = await POST(makeRequest(buildPayloadBody(), null));
    expect(r1.status).toBe(200);
    const r2 = await POST(makeRequest(buildPayloadBody(), null));
    expect(r2.status).toBe(200);
    expect(processPaystackInitializeBodyMock).toHaveBeenCalledTimes(2);
    expect(finalizeAdminPaystackCheckoutMock).toHaveBeenCalledTimes(2);
    expect(idempotencyState.rows.length).toBe(0);
  });

  it("Paystack initialize failure abandons the claim so a follow-up retry with the same key can proceed (no permanent lockout)", async () => {
    processPaystackInitializeBodyMock.mockImplementationOnce(async () => ({
      ok: false,
      status: 400,
      errorCode: "LOCK_EXPIRED",
      error: "Pick your time again to refresh.",
    }));

    const r1 = await POST(makeRequest(buildPayloadBody(), "idem-fail-1"));
    expect(r1.status).toBe(400);
    expect(idempotencyState.deleteCallCount).toBeGreaterThanOrEqual(1);
    expect(idempotencyState.rows.length).toBe(0);

    const r2 = await POST(makeRequest(buildPayloadBody(), "idem-fail-1"));
    expect(r2.status).toBe(200);
    const j2 = (await r2.json()) as Record<string, unknown>;
    expect(j2.bookingId).toBe("booking-1");
    expect(processPaystackInitializeBodyMock).toHaveBeenCalledTimes(2);
  });

  it("uses the email-based RPC fallback to fingerprint the customer when body.customer.userId is absent", async () => {
    await POST(makeRequest(buildPayloadBody(), "idem-rpc-1"));
    expect(idempotencyState.rpcCalls.some((c) => c.fn === "resolve_auth_user_id_by_email")).toBe(true);
    expect(idempotencyState.rows.length).toBe(1);
    expect(idempotencyState.rows[0].customer_user_id).toBe(fakeCustomerUid);
  });
});

describe("M-3 with-payment route source structure (regression guard)", () => {
  const root = process.cwd();
  const src = readFileSync(join(root, "app/api/admin/bookings/with-payment/route.ts"), "utf8");

  it("imports the same idempotency helpers used by POST /api/admin/bookings", () => {
    expect(src).toMatch(/import\s*\{[\s\S]*claimAdminBookingCreateIdempotency[\s\S]*\}\s*from\s*"@\/lib\/admin\/adminBookingCreateIdempotency"/);
    expect(src).toMatch(/finalizeAdminBookingCreateIdempotency/);
    expect(src).toMatch(/abandonAdminBookingCreateIdempotency/);
  });

  it("imports the shared fingerprint helpers (service slug + location hash) so fingerprint matches the main route", () => {
    expect(src).toMatch(/adminBookingServiceSlug/);
    expect(src).toMatch(/adminBookingLocationFingerprint/);
  });

  it("claims the idempotency slot before processPaystackInitializeBody", () => {
    const claimIdx = src.indexOf("claimAdminBookingCreateIdempotency(admin, request");
    const initIdx = src.indexOf("processPaystackInitializeBody(body)");
    expect(claimIdx).toBeGreaterThan(-1);
    expect(initIdx).toBeGreaterThan(-1);
    expect(claimIdx).toBeLessThan(initIdx);
  });

  it("finalizes the claim with the response body on success", () => {
    expect(src).toMatch(/finalizeAdminBookingCreateIdempotency\(admin,\s*claimId,\s*200,\s*responseBody\)/);
  });

  it("abandons the claim on Paystack initialize failure and finalize failure (so retries can re-attempt)", () => {
    expect(src).toMatch(/return\s+bail\(\s*NextResponse\.json\(\s*\{\s*error:\s*result\.error/);
    expect(src).toMatch(/return\s+bail\(NextResponse\.json\(\{\s*error:\s*finalized\.error\s*\}/);
  });

  it("does not gate the bookingId reuse path with the new claim (the early-return for stored, non-expired links must remain a fast path)", () => {
    const reusePathIdx = src.indexOf("if (isStoredPaymentLinkUsable(row)");
    const claimIdx = src.indexOf("claimAdminBookingCreateIdempotency(admin, request");
    expect(reusePathIdx).toBeGreaterThan(-1);
    expect(claimIdx).toBeGreaterThan(-1);
    expect(reusePathIdx).toBeLessThan(claimIdx);
  });
});
