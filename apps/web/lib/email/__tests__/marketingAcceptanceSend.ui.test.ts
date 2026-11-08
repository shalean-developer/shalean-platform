// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
const m = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("@/hooks/useAdminData", () => ({ adminFetch: m.fetch }));
import { OwnerInboxReadiness } from "@/components/admin/email/OwnerInboxReadiness";
let host: HTMLDivElement, root: Root;
const first = "first@example.test", second = "second@example.test";
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); vi.clearAllMocks();
  host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });
async function render(enabled = true, status = "consent_recorded") {
  m.fetch.mockResolvedValueOnce({ ok: true, data: { recipients: [{ email: first, status }, { email: second, status: "consent_recorded" }], testSendEnabled: enabled, sendingEnabled: false, webhookConfigured: true } });
  await act(async () => root.render(React.createElement(OwnerInboxReadiness)));
}
const buttons = () => [...host.querySelectorAll("button")];
const authorize = async () => { await act(async () => (host.querySelector("input") as HTMLInputElement).click()); };
it("keeps delivery disabled until the owner authorizes a configured test", async () => {
  await render(); expect(buttons().every(b => b.disabled)).toBe(true);
  await authorize(); expect(buttons().every(b => !b.disabled)).toBe(true);
});
it("cannot authorize or send when the capability is paused", async () => {
  await render(false); expect((host.querySelector("input") as HTMLInputElement).disabled).toBe(true);
  expect(buttons().every(b => b.disabled)).toBe(true); expect(host.textContent).toContain("needs staging activation");
});
it("sends only the selected inbox, resets authorization, and distinguishes accepted from delivered", async () => {
  await render(); m.fetch.mockResolvedValueOnce({ ok: true, data: { outcome: "accepted" } });
  await authorize(); await act(async () => buttons()[1]!.click());
  expect(m.fetch.mock.calls[1]).toEqual(["/api/admin/email/acceptance/send", { method: "POST", body: JSON.stringify({ email: second, explicitTestSend: true }) }]);
  expect(host.textContent).toContain("Inbox receipt and delivery feedback still need verification");
  expect(buttons().every(b => b.disabled)).toBe(true);
});
it("keeps a customer without recorded consent blocked", async () => {
  await render(true, "consent_required"); await authorize(); expect(buttons()[0]!.disabled).toBe(true); expect(buttons()[1]!.disabled).toBe(false);
});
it("shows eligibility errors and requires a new deliberate action", async () => {
  await render(); m.fetch.mockResolvedValueOnce({ ok: false, error: "Delivery blocked: suppressed." });
  await authorize(); await act(async () => buttons()[0]!.click());
  expect(host.textContent).toContain("Delivery blocked: suppressed."); expect(buttons().every(b => b.disabled)).toBe(true);
});
it("does not describe a duplicate or an unknown outcome as successful delivery", async () => {
  await render(); m.fetch.mockResolvedValueOnce({ ok: true, data: { outcome: "submission_unknown" } });
  await authorize(); await act(async () => buttons()[0]!.click());
  expect(host.textContent).toContain("no automatic retry will run");
  m.fetch.mockResolvedValueOnce({ ok: true, data: { outcome: "already_requested" } });
  await authorize(); await act(async () => buttons()[0]!.click());
  expect(host.textContent).toContain("nothing was sent again");
});
