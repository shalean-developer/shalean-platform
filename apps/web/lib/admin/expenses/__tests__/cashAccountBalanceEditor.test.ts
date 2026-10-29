// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CashAccountBalanceEditor } from "@/components/admin/finance/CashAccountBalanceEditor";

const { getAdminToken } = vi.hoisted(() => ({ getAdminToken: vi.fn() }));
vi.mock("@/hooks/useAdminData", () => ({ getAdminToken }));
let container: HTMLDivElement;
let root: Root;
const onSaved = vi.fn();
const fetchMock = vi.fn();
const account = {
  id: "synthetic-bank", name: "Test bank", account_type: "bank", balance_cents: 12345,
  updated_at: new Date().toISOString(), stale: false,
};
function reply(body: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => body };
}
async function render(stale = false) {
  await act(async () => root.render(createElement(CashAccountBalanceEditor, {
    accounts: [{ ...account, updated_at: stale ? "2020-01-01T00:00:00Z" : new Date().toISOString(), stale }], onSaved,
  })));
}
async function click(label: string) {
  const button = [...container.querySelectorAll("button")].find((b) => b.textContent?.includes(label));
  expect(button).toBeDefined();
  await act(async () => button!.click());
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("fetch", fetchMock);
  getAdminToken.mockResolvedValue("synthetic-session");
  fetchMock.mockReset(); onSaved.mockReset();
  fetchMock.mockResolvedValue(reply({ can_manage: true }));
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

describe("cash-account authenticated requests", () => {
  it("authenticates permission lookup and automatic stale-bank sync", async () => {
    fetchMock.mockResolvedValueOnce(reply({ can_manage: true }))
      .mockResolvedValueOnce(reply({ ok: true, balance_cents: 23456 }));
    await render(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    for (const [, options] of fetchMock.mock.calls) {
      expect(options.headers.get("Authorization")).toBe("Bearer synthetic-session");
      expect(options.cache).toBe("no-store");
    }
    expect(fetchMock.mock.calls[1][1].method).toBe("POST");
    expect(onSaved).toHaveBeenCalledOnce();
    expect(container.textContent).toContain("Bank balance synced from Zoho");
  });
  it("authenticates explicit sync and manual save, preserving the JSON payload", async () => {
    await render();
    getAdminToken.mockResolvedValue("renewed-session");
    fetchMock.mockResolvedValue(reply({ ok: true, balance_cents: 12345 }));
    await click("Sync bank from Zoho");
    await click("Manual save");
    const [url, options] = fetchMock.mock.calls[2];
    expect(url).toBe("/api/admin/finance-accounts/balance");
    expect(options.method).toBe("PATCH");
    expect(options.headers.get("Authorization")).toBe("Bearer renewed-session");
    expect(options.headers.get("content-type")).toBe("application/json");
    expect(JSON.parse(options.body)).toEqual({ account_id: account.id, balance_cents: 12345 });
    expect(fetchMock.mock.calls[1][1].headers.get("Authorization")).toBe("Bearer renewed-session");
    expect(onSaved).toHaveBeenCalledTimes(2);
  });
  it("keeps genuine permission denials read-only without syncing", async () => {
    fetchMock.mockResolvedValue(reply({ error: "Forbidden.", requiredAnyPermission: ["expense.manage"] }, 403));
    await render(true);
    expect(container.textContent).toContain("read-only for your role");
    expect(container.querySelector("input")?.disabled).toBe(true);
    expect(fetchMock).toHaveBeenCalledOnce();
  });
  it.each([
    [401, { error: "Invalid or expired session." }],
    [403, { error: "Office email verification is required.", code: "office_email_verification_required" }],
    [503, { error: "Authorization unavailable." }],
  ])("shows authentication/service errors (%s) instead of claiming the role is read-only", async (status, body) => {
    fetchMock.mockResolvedValue(reply(body, status));
    await render(true);
    expect(container.querySelector('[role="alert"]')?.textContent).toBe(body.error);
    expect(container.textContent).not.toContain("read-only for your role");
    expect(fetchMock).toHaveBeenCalledOnce();
  });
  it("does not issue requests without a session", async () => {
    getAdminToken.mockResolvedValue(null);
    await render(true);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Sign in again");
  });
  it("reports a network failure without claiming the user lacks permission", async () => {
    fetchMock.mockRejectedValue(new Error("Network unavailable"));
    await render(true);
    expect(container.querySelector('[role="alert"]')?.textContent).toBe("Network unavailable");
    expect(container.textContent).not.toContain("read-only for your role");
  });
  it("surfaces a Zoho failure and leaves balances unchanged", async () => {
    await render();
    fetchMock.mockResolvedValue(reply({ error: "Zoho bank feed is stale." }, 409));
    await click("Sync bank from Zoho");
    expect(container.textContent).toContain("Zoho bank feed is stale.");
    expect(onSaved).not.toHaveBeenCalled();
    expect(container.querySelector("input")?.value).toBe("123.45");
  });
});
