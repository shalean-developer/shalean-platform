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
