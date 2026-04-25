import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: { id: "00000000-0000-4000-8000-000000000099", email: "user@example.com" } },
        error: null,
      })),
    },
  })),
}));

import { GET, POST } from "../route";

describe("POST /api/admin/bookings/[id]/assign-team", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon";
    process.env.ADMIN_EMAIL = "ops@example.com";
  });

  it("returns 401 without authorization", async () => {
    const res = await POST(
      new Request("http://localhost/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamId: "00000000-0000-4000-8000-000000000001" }),
      }),
      { params: Promise.resolve({ id: "00000000-0000-4000-8000-000000000002" }) },
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 when bearer token present but user is not admin", async () => {
    const res = await POST(
      new Request("http://localhost/test", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer fake-jwt",
        },
        body: JSON.stringify({ teamId: "00000000-0000-4000-8000-000000000001" }),
      }),
      { params: Promise.resolve({ id: "00000000-0000-4000-8000-000000000002" }) },
    );
    expect(res.status).toBe(403);
  });
});

describe("GET /api/admin/bookings/[id]/assign-team", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon";
    process.env.ADMIN_EMAIL = "ops@example.com";
  });

  it("returns 401 without authorization", async () => {
    const res = await GET(new Request("http://localhost/test"), {
      params: Promise.resolve({ id: "00000000-0000-4000-8000-000000000002" }),
    });
    expect(res.status).toBe(401);
  });
});
