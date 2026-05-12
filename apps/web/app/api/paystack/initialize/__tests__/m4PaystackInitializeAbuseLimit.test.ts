import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * M-4: customer Paystack initialize abuse protection.
 *
 * Asserts:
 *   1. Normal checkout still works (200 response shape preserved).
 *   2. IP-flood from a single source trips the IP bucket and returns 429 with `Retry-After`.
 *   3. Email-flood from rotating IPs trips the email bucket and returns 429.
 *   4. BookingId-flood (legitimate retry-existing-pending-payment path used past saturation)
 *      trips the bookingId bucket and returns 429.
 *   5. After bucket reset (simulating window expiry), legitimate retries succeed.
 *   6. Response shape on 429 includes `error` + `Retry-After` + `X-RateLimit-Reason` header.
 *   7. Response shape on 200 still matches the pre-M-4 contract: `authorizationUrl`,
 *      `reference`, optional `bookingId`.
 *   8. Admin Paystack initialize path (`/api/admin/bookings/with-payment`,
 *      `/api/admin/bookings`) imports `processPaystackInitializeBody` directly and does NOT
 *      route through this limiter (verified via static source check on the M-4 helper module).
 *   9. AI booking-agent path is also unaffected (static source check).
 */

vi.mock("@/lib/booking/paystackInitializeCore", () => ({
  processPaystackInitializeBody: vi.fn(),
}));

import { processPaystackInitializeBody } from "@/lib/booking/paystackInitializeCore";
import { POST } from "@/app/api/paystack/initialize/route";
import {
  PAYSTACK_INITIALIZE_ABUSE_LIMITS,
  __resetPaystackInitializeAbuseBuckets,
} from "@/lib/rateLimit/paystackInitializeAbuseLimit";

const sampleLockedSnapshot = {
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

function buildBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    locked: sampleLockedSnapshot,
    email: "customer@example.com",
    customer: {
      type: "guest",
      name: "Test Customer",
      email: "customer@example.com",
      phone: "0711111111",
    },
    tip: 0,
    ...overrides,
  };
}

function buildRequest(body: Record<string, unknown>, headers: Record<string, string> = {}): Request {
  return new Request("https://example.com/api/paystack/initialize", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  __resetPaystackInitializeAbuseBuckets();
  vi.mocked(processPaystackInitializeBody).mockReset();
  vi.mocked(processPaystackInitializeBody).mockResolvedValue({
    ok: true,
    status: 200,
    authorizationUrl: "https://checkout.paystack.com/authorize/abc123",
    reference: "pay_abc123",
    bookingId: "00000000-0000-4000-8000-000000000001",
  } as Awaited<ReturnType<typeof processPaystackInitializeBody>>);
});

afterEach(() => {
  __resetPaystackInitializeAbuseBuckets();
});

describe("M-4 customer Paystack initialize abuse limiter", () => {
  it("normal checkout: returns 200 with the unchanged success response shape", async () => {
    const req = buildRequest(buildBody(), { "x-forwarded-for": "203.0.113.10" });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = (await res.json()) as Record<string, unknown>;
    expect(json).toEqual({
      authorizationUrl: "https://checkout.paystack.com/authorize/abc123",
      reference: "pay_abc123",
      bookingId: "00000000-0000-4000-8000-000000000001",
    });
    expect(vi.mocked(processPaystackInitializeBody)).toHaveBeenCalledTimes(1);
  });

  it("legitimate retry pattern: a few rapid clicks from the same IP/email all succeed within the budget", async () => {
    const ip = "203.0.113.20";
    const expectedSuccess = Math.min(
      PAYSTACK_INITIALIZE_ABUSE_LIMITS.ipPerWindow,
      PAYSTACK_INITIALIZE_ABUSE_LIMITS.emailPerWindow,
    );
    expect(expectedSuccess).toBeGreaterThanOrEqual(3);

    for (let i = 0; i < 3; i++) {
      const res = await POST(buildRequest(buildBody({ email: `legit${i}@example.com` }), { "x-forwarded-for": ip }));
      expect(res.status).toBe(200);
    }
    expect(vi.mocked(processPaystackInitializeBody)).toHaveBeenCalledTimes(3);
  });

  it("IP-flood: exceeding the per-IP cap returns 429 with Retry-After + X-RateLimit-Reason", async () => {
    const ip = "203.0.113.30";
    for (let i = 0; i < PAYSTACK_INITIALIZE_ABUSE_LIMITS.ipPerWindow; i++) {
      const res = await POST(
        buildRequest(buildBody({ email: `flood${i}@example.com` }), { "x-forwarded-for": ip }),
      );
      expect(res.status).toBe(200);
    }
    const blockedRes = await POST(
      buildRequest(buildBody({ email: "flood-extra@example.com" }), { "x-forwarded-for": ip }),
    );
    expect(blockedRes.status).toBe(429);
    const retryAfter = blockedRes.headers.get("Retry-After");
    expect(retryAfter).not.toBeNull();
    expect(Number(retryAfter)).toBeGreaterThanOrEqual(1);
    expect(blockedRes.headers.get("X-RateLimit-Reason")).toBe("paystack-initialize:ip");
    const json = (await blockedRes.json()) as { error: string };
    expect(typeof json.error).toBe("string");
    expect(json.error.length).toBeGreaterThan(0);
    expect(vi.mocked(processPaystackInitializeBody)).toHaveBeenCalledTimes(
      PAYSTACK_INITIALIZE_ABUSE_LIMITS.ipPerWindow,
    );
  });

  it("email-flood: rotating IPs but reusing the same email trips the email bucket", async () => {
    const email = "abuse-target@example.com";
    for (let i = 0; i < PAYSTACK_INITIALIZE_ABUSE_LIMITS.emailPerWindow; i++) {
      const res = await POST(
        buildRequest(buildBody({ email }), { "x-forwarded-for": `198.51.100.${i + 1}` }),
      );
      expect(res.status).toBe(200);
    }
    const blockedRes = await POST(
      buildRequest(buildBody({ email }), { "x-forwarded-for": "198.51.100.99" }),
    );
    expect(blockedRes.status).toBe(429);
    expect(blockedRes.headers.get("X-RateLimit-Reason")).toBe("paystack-initialize:email");
  });

  it("bookingId-flood: hammering retry of a single pending_payment row trips the bookingId bucket", async () => {
    const bookingId = "11111111-1111-4111-8111-111111111111";
    for (let i = 0; i < PAYSTACK_INITIALIZE_ABUSE_LIMITS.bookingIdPerWindow; i++) {
      const res = await POST(
        buildRequest(buildBody({ bookingId, email: `retry${i}@example.com` }), {
          "x-forwarded-for": `198.51.100.${100 + i}`,
        }),
      );
      expect(res.status).toBe(200);
    }
    const blockedRes = await POST(
      buildRequest(buildBody({ bookingId, email: "retry-extra@example.com" }), {
        "x-forwarded-for": "198.51.100.150",
      }),
    );
    expect(blockedRes.status).toBe(429);
    expect(blockedRes.headers.get("X-RateLimit-Reason")).toBe("paystack-initialize:bookingId");
  });

  it("retry after window: clearing the bucket allows a previously-blocked client to proceed again", async () => {
    const ip = "203.0.113.40";
    for (let i = 0; i < PAYSTACK_INITIALIZE_ABUSE_LIMITS.ipPerWindow; i++) {
      await POST(
        buildRequest(buildBody({ email: `r${i}@example.com` }), { "x-forwarded-for": ip }),
      );
    }
    const blocked = await POST(
      buildRequest(buildBody({ email: "blocked@example.com" }), { "x-forwarded-for": ip }),
    );
    expect(blocked.status).toBe(429);

    __resetPaystackInitializeAbuseBuckets();

    const allowedAgain = await POST(
      buildRequest(buildBody({ email: "allowed-again@example.com" }), { "x-forwarded-for": ip }),
    );
    expect(allowedAgain.status).toBe(200);
  });

  it("response shape on 429 contains a string error and a non-zero Retry-After", async () => {
    const ip = "203.0.113.50";
    for (let i = 0; i < PAYSTACK_INITIALIZE_ABUSE_LIMITS.ipPerWindow; i++) {
      await POST(buildRequest(buildBody({ email: `s${i}@example.com` }), { "x-forwarded-for": ip }));
    }
    const blocked = await POST(
      buildRequest(buildBody({ email: "shape@example.com" }), { "x-forwarded-for": ip }),
    );
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("Retry-After")).not.toBeNull();
    expect(Number(blocked.headers.get("Retry-After"))).toBeGreaterThanOrEqual(1);
    const body = (await blocked.json()) as Record<string, unknown>;
    expect(typeof body.error).toBe("string");
    // 429 path must NOT leak Paystack's `authorizationUrl` / `reference` keys.
    expect(body).not.toHaveProperty("authorizationUrl");
    expect(body).not.toHaveProperty("reference");
  });

  it("IP limiter runs before body parsing: malformed JSON still consumes the IP bucket", async () => {
    const ip = "203.0.113.60";
    for (let i = 0; i < PAYSTACK_INITIALIZE_ABUSE_LIMITS.ipPerWindow; i++) {
      const badReq = new Request("https://example.com/api/paystack/initialize", {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": ip },
        body: "{not-json",
      });
      const res = await POST(badReq);
      expect([400, 429]).toContain(res.status);
    }
    const blocked = await POST(
      buildRequest(buildBody({ email: "after-bad@example.com" }), { "x-forwarded-for": ip }),
    );
    expect(blocked.status).toBe(429);
  });

  it("error response shape from processPaystackInitializeBody is NOT replaced by the limiter when allowed", async () => {
    vi.mocked(processPaystackInitializeBody).mockResolvedValueOnce({
      ok: false,
      status: 400,
      error: "A valid email address is required.",
    } as Awaited<ReturnType<typeof processPaystackInitializeBody>>);
    const res = await POST(
      buildRequest(buildBody(), { "x-forwarded-for": "203.0.113.70" }),
    );
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toBe("A valid email address is required.");
  });
});

describe("M-4 limiter is NOT applied to admin / AI booking-agent Paystack initialize paths", () => {
  it("the customer initialize route is the ONLY caller of paystackInitializeAbuseLimit helpers", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const fileURL = await import("node:url");
    const __dirname = path.dirname(fileURL.fileURLToPath(import.meta.url));
    // __tests__ → initialize → paystack → api → app → web → apps → repo-root
    const repoRoot = path.resolve(__dirname, "../../../../../../..");
    const candidates = [
      "apps/web/app/api/admin/bookings/with-payment/route.ts",
      "apps/web/app/api/admin/bookings/route.ts",
      "apps/web/app/api/ai/booking-agent/route.ts",
    ];
    for (const rel of candidates) {
      const abs = path.join(repoRoot, ...rel.split("/"));
      const src = fs.readFileSync(abs, "utf8");
      expect(src, `${rel} must NOT import the customer-only abuse limiter`).not.toMatch(
        /paystackInitializeAbuseLimit/,
      );
      expect(src, `${rel} must NOT import the customer-only IP-limit helper`).not.toMatch(
        /checkPaystackInitializeIpLimit/,
      );
    }
  });

  it("the customer initialize route imports the limiter helpers and gates BOTH IP + body checks", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const fileURL = await import("node:url");
    const __dirname = path.dirname(fileURL.fileURLToPath(import.meta.url));
    // __tests__ → initialize/route.ts
    const routePath = path.resolve(__dirname, "..", "route.ts");
    const src = fs.readFileSync(routePath, "utf8");
    expect(src).toMatch(/checkPaystackInitializeIpLimit\s*\(/);
    expect(src).toMatch(/checkPaystackInitializeBodyLimits\s*\(/);
    // IP check must precede body parse; body check must precede processPaystackInitializeBody.
    const ipIdx = src.indexOf("checkPaystackInitializeIpLimit(");
    const parseIdx = src.indexOf("await request.json()");
    const bodyIdx = src.indexOf("checkPaystackInitializeBodyLimits(");
    const processIdx = src.indexOf("processPaystackInitializeBody(");
    expect(ipIdx).toBeGreaterThan(-1);
    expect(parseIdx).toBeGreaterThan(ipIdx);
    expect(bodyIdx).toBeGreaterThan(parseIdx);
    expect(processIdx).toBeGreaterThan(bodyIdx);
  });
});
