import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";
import { GET, POST } from "../route";
const { auth, admin, sync } = vi.hoisted(() => ({ auth: vi.fn(), admin: vi.fn(), sync: vi.fn() }));
vi.mock("@/lib/admin/requirePermission", () => ({ requireAdminPermissionFromRequest: auth }));
vi.mock("@/lib/supabase/admin", () => ({ getSupabaseAdmin: admin }));
vi.mock("@/lib/zoho/syncZohoBankBalance", () => ({ syncZohoBankBalance: sync }));
beforeEach(() => { vi.clearAllMocks(); vi.stubEnv("SHALEAN_APP_ENV", "production"); });
afterEach(() => vi.unstubAllEnvs());
describe("bank sync authorization", () => {
  it.each([401, 403, 503])("preserves authorization failures (%s) and never syncs", async (status) => {
    auth.mockResolvedValue({ ok: false, response: NextResponse.json({ error: "Access failed" }, { status }) });
    const response = await GET(new Request("https://example.com/api/admin/finance-accounts/zoho-sync"));
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ error: "Access failed" });
    expect(auth.mock.calls[0][1]).toBe("expense.manage");
    expect(sync).not.toHaveBeenCalled(); expect(admin).not.toHaveBeenCalled();
  });
  it("reports authorized management without modifying any balance", async () => {
    auth.mockResolvedValue({ ok: true, user: { id: "synthetic-owner" } });
    const response = await GET(new Request("https://example.com/api/admin/finance-accounts/zoho-sync"));
    expect(await response.json()).toEqual({ can_manage: true, can_sync: true });
    expect(sync).not.toHaveBeenCalled(); expect(admin).not.toHaveBeenCalled();
  });
  it("reports bank synchronization disabled in staging without touching the provider", async () => {
    vi.stubEnv("SHALEAN_APP_ENV", "staging");
    auth.mockResolvedValue({ ok: true, user: { id: "synthetic-owner" } });
    const response = await GET(new Request("https://example.com/api/admin/finance-accounts/zoho-sync"));
    expect(await response.json()).toEqual({ can_manage: true, can_sync: false });
    expect(sync).not.toHaveBeenCalled();
    expect(admin).not.toHaveBeenCalled();
  });
  it("retains permission enforcement on the mutation", async () => {
    auth.mockResolvedValue({ ok: false, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) });
    const response = await POST(new Request("https://example.com/api/admin/finance-accounts/zoho-sync", { method: "POST" }));
    expect(response.status).toBe(403);
    expect(sync).not.toHaveBeenCalled(); expect(admin).not.toHaveBeenCalled();
  });
});
