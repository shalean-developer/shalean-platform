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

import { PUT } from "../route";

describe("PUT /api/admin/bookings/[id]/roster", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon";
    process.env.ADMIN_EMAIL = "ops@example.com";
  });

  it("returns 401 without authorization", async () => {
    const res = await PUT(
      new Request("http://localhost/test", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reason: "No-show",
          members: [
            { cleanerId: "00000000-0000-4000-8000-000000000010", role: "lead" },
            { cleanerId: "00000000-0000-4000-8000-000000000011", role: "member" },
          ],
        }),
      }),
      { params: Promise.resolve({ id: "00000000-0000-4000-8000-000000000002" }) },
    );
    expect(res.status).toBe(401);
  });

});
