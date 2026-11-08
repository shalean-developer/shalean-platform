import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

  it("excludes only explicitly evidenced fixtures from displayed revenue, while preserving recorded totals and session counts", async () => {
    const created_at = new Date().toISOString();
    const paid = (total_paid_zar: number, extras: Record<string, unknown> = {}) => ({
      created_at, payment_completed_at: created_at, status: "pending",
      payment_status: "success", total_paid_zar, amount_paid_cents: total_paid_zar * 100, ...extras,
    });
    readPagedRows
      .mockResolvedValueOnce({ data: [], error: null })
      .mockResolvedValueOnce({ data: [], error: null })
      .mockResolvedValueOnce({ data: [
        paid(310, { is_test: true, booking_source: "audit_a02_03_fixture_repaired" }),
        paid(550, { is_test: false, booking_source: "sales_document", customer_name: "STAGING R550 CONVERSION TEST" }),
        paid(420, { is_test: false, booking_source: "website" }),
        paid(460, { is_test: false, booking_source: "website" }),
        paid(925, { is_test: false, booking_source: "website" }),
        paid(955, { is_test: false, booking_source: "website" }),
        paid(925, { is_test: false, booking_source: "website" }),
      ], error: null });
    const response = await GET(request());
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.intelligence.revenue).toEqual({
      paidBookings: 7, totalZar: 3685, recordedTotalZar: 4545, excludedFixtureZar: 860,
    });
    expect(body.paidBookingsCount).toBe(7);
    expect(body.completedPaymentSessions).toBe(0);
    expect(body.viewsByStep).toHaveLength(5);
  });

  it("keeps legitimate non-test sales-document payments without provider verification claims", async () => {
    const created_at = new Date().toISOString();
    readPagedRows
      .mockResolvedValueOnce({ data: [], error: null })
      .mockResolvedValueOnce({ data: [], error: null })
      .mockResolvedValueOnce({ data: [
        { created_at, payment_completed_at: created_at, status: "pending", payment_status: "success",
          total_paid_zar: 550, is_test: false, booking_source: "sales_document", customer_name: "Legitimate customer" },
      ], error: null });
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect((await response.json()).intelligence.revenue).toEqual({
      paidBookings: 1, totalZar: 550, recordedTotalZar: 550, excludedFixtureZar: 0,
    });
  });

  it("keeps an existing empty booking_events source as successful zero-activity reporting", async () => {
    readPagedRows.mockResolvedValue({ data: [], error: null });
    const response = await GET(request());
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).not.toHaveProperty("error");
    expect(body.rows).toBe(0);
    expect(body.viewsByStep).toEqual(["entry", "quote", "datetime", "details", "payment"].map((step) => ({ step, views: 0 })));
  });
});

it("exposes screen diagnostics without inflating coarse-stage session counts", async () => {
  const created_at = new Date().toISOString();
  const metadata={service:"regular-cleaning",flow:"booking_v2",section:"address"};
  readPagedRows.mockResolvedValueOnce({data:[
    {session_id:"a",analytics_session_id:"a",step:"quote",event_type:"view",created_at,metadata},
    {session_id:"a",analytics_session_id:"a",step:"quote",event_type:"view",created_at,metadata:{...metadata,section:"rooms"}},
    {session_id:"a",analytics_session_id:"a",step:"quote",event_type:"exit",created_at,metadata:{...metadata,section:"rooms"}},
  ],error:null}).mockResolvedValueOnce({data:[],error:null}).mockResolvedValueOnce({data:[],error:null});
  const response=await GET(request());
  const body=await response.json();
  expect(body.viewsByStep.find((r:{step:string})=>r.step==="quote").views).toBe(1);
  expect(body.sectionDiagnostics).toMatchObject([
    {section:"address",viewedSessions:1,exitSessions:0},
    {section:"rooms",viewedSessions:1,exitSessions:1},
  ]);
});
