import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "../route";

const { getUser, requireAdminUser, getSupabaseAdmin, readPagedRows } = vi.hoisted(() => ({
  getUser: vi.fn(),
  requireAdminUser: vi.fn(),
  getSupabaseAdmin: vi.fn(),
  readPagedRows: vi.fn(),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ auth: { getUser } }),
}));
vi.mock("@/lib/auth/evaluateAdminAccess", () => ({ requireAdminUser }));
vi.mock("@/lib/supabase/admin", () => ({ getSupabaseAdmin }));
vi.mock("@/lib/analytics/readPagedRows", () => ({ readPagedRows }));

const request = () => new Request("https://staging.example.test/api/admin/booking-funnel", {
  headers: { authorization: "Bearer synthetic-test-token" },
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://synthetic.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "synthetic-publishable-key");
  getUser.mockResolvedValue({ data: { user: { id: "synthetic-owner" } }, error: null });
  requireAdminUser.mockResolvedValue({ ok: true });
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const name of ["select", "gte", "order", "in", "or"]) {
    chain[name] = vi.fn(() => chain);
  }
  getSupabaseAdmin.mockReturnValue({ from: vi.fn(() => chain) });
});
afterEach(() => vi.unstubAllEnvs());

describe("booking funnel API source reliability", () => {
  it.each([
    { message: 'relation "public.booking_events" does not exist', code: "42P01" },
    { message: "Synthetic database failure", code: "42P01" },
  ])("returns 503, not false-zero metrics, when booking_events is missing ($message)", async (error) => {
    readPagedRows
      .mockResolvedValueOnce({ data: [], error })
      .mockResolvedValueOnce({ data: [], error: null })
      .mockResolvedValueOnce({ data: [], error: null });
    const response = await GET(request());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "Funnel analytics source unavailable." });
    expect(readPagedRows).toHaveBeenCalledTimes(3);
  });

  it("keeps an existing empty booking_events source as successful zero-activity reporting", async () => {
    readPagedRows.mockResolvedValue({ data: [], error: null });
    const response = await GET(request());
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).not.toHaveProperty("error");
    expect(body.rows).toBe(0);
    expect(body.viewsByStep).toEqual([]);
  });
});
