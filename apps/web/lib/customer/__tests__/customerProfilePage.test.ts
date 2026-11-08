// @vitest-environment jsdom
import React, { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import AccountProfilePage from "@/app/(ui-redesign)/account/profile/page";
const mocks = vi.hoisted(() => ({ viewer: { id: "synthetic-customer", email: "jane@example.com", user_metadata: { full_name: "Jane Doe", phone: "0821234567", whatsapp: "0821234567" } }, load: vi.fn(), update: vi.fn(), authUpdate: vi.fn(), toast: vi.fn() }));
vi.mock("@/hooks/useUser", () => ({ useUser: () => ({ user: mocks.viewer, loading: false }) }));
vi.mock("@/hooks/useCustomerAvatar", () => ({ useCustomerAvatar: () => undefined }));
vi.mock("@/components/account/MarketingEmailPreferences", () => ({ MarketingEmailPreferences: () => createElement("section", null, "Marketing email preferences") }));
vi.mock("@/components/dashboard/dashboard-toast-context", () => ({ useDashboardToast: () => mocks.toast }));
vi.mock("next/link", () => ({ default: ({ children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => createElement("a", props, children) }));
vi.mock("@/lib/supabaseClient", () => ({ getSupabaseClient: () => ({ from: () => ({
  select: () => ({ eq: () => ({ maybeSingle: mocks.load }) }),
  update: (patch: unknown) => { mocks.update(patch); return { eq: () => ({ select: () => ({ single: async () => ({ data: { id: "synthetic-customer" }, error: null }) }) }) }; },
}), auth: { updateUser: mocks.authUpdate } }) }));
let root: Root; let container: HTMLDivElement;
const byId = (id: string) => container.querySelector<HTMLInputElement>(`#${id}`)!;
async function fill(id: string, value: string) { await act(async () => { const input = byId(id); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value); input.dispatchEvent(new Event("input", { bubbles: true })); }); }
async function submit(form = 0) { await act(async () => container.querySelectorAll("form")[form]!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))); }
async function openPassword() { await act(async () => [...container.querySelectorAll("button")].find(button => button.textContent === "Update password")!.click()); }
beforeEach(async () => {
  vi.stubGlobal("React", React); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); vi.clearAllMocks();
  mocks.load.mockResolvedValue({ data: { full_name: "Jane Doe", phone: "0821234567", date_of_birth: null, preferred_notification_channel: "email" }, error: null }); mocks.authUpdate.mockResolvedValue({ error: null });
  container = document.createElement("div"); document.body.append(container); root = createRoot(container); await act(async () => root.render(createElement(AccountProfilePage)));
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
it("renders a compact editor with unchanged details disabled and password form closed", () => {
  expect(container.textContent).toContain("My details"); expect(container.textContent).not.toContain("Total bookings"); expect(container.querySelectorAll("form")).toHaveLength(1);
  expect([...container.querySelectorAll("button")].find(button => button.textContent?.includes("Save changes"))!.disabled).toBe(true); expect(byId("profile-email").readOnly).toBe(true);
});
it("validates before any writes and focuses the invalid field", async () => {
  await fill("profile-phone", "082123456789"); await submit(); expect(mocks.update).not.toHaveBeenCalled(); expect(mocks.authUpdate).not.toHaveBeenCalled(); expect(container.textContent).toContain("Enter a valid South African number"); expect(document.activeElement?.id).toBe("profile-phone");
});
it("clears database phone values and auth fallback and preserves unsaved changes through refresh", async () => {
  await fill("profile-phone", ""); await act(async () => root.render(createElement(AccountProfilePage))); expect(byId("profile-phone").value).toBe(""); await submit();
  expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ phone: null, phone_e164: null })); expect(mocks.authUpdate).toHaveBeenCalledWith({ data: expect.objectContaining({ phone: "" }) }); expect(container.textContent).toContain("Your details have been saved.");
});
it("keeps unsaved contact edits separate from password validation", async () => {
  await fill("profile-name", "Jane Updated"); await openPassword(); expect(byId("profile-name").value).toBe("Jane Updated"); await fill("profile-password-new", "abcdef"); await fill("profile-password-confirm", "different"); await submit(1);
  expect(mocks.update).not.toHaveBeenCalled(); expect(mocks.authUpdate).not.toHaveBeenCalled(); expect(container.textContent).toContain("The passwords do not match.");
});
it("saves exact passwords independently without trimming or writing profile fields", async () => {
  await openPassword(); await fill("profile-password-new", " spaced password "); await fill("profile-password-confirm", " spaced password "); await submit(1);
  expect(mocks.authUpdate).toHaveBeenCalledWith({ password: " spaced password " }); expect(mocks.update).not.toHaveBeenCalled(); expect(container.textContent).toContain("Your password has been updated.");
});
it("shows recoverable load errors rather than editable blank defaults", async () => {
  mocks.load.mockResolvedValue({ data: null, error: { message: "unavailable" } }); await act(async () => { root.unmount(); root = createRoot(container); root.render(createElement(AccountProfilePage)); });
  expect(container.textContent).toContain("Your details could not be loaded"); expect(container.querySelector("form")).toBeNull(); expect(container.textContent).toContain("Try again");
});
it("reports partial contact sync failures and keeps Save available for retry", async () => {
  mocks.authUpdate.mockResolvedValue({ error: { message: "unavailable" } }); await fill("profile-name", "Jane Updated"); await submit(); expect(container.textContent).toContain("contact syncing failed"); expect([...container.querySelectorAll("button")].find(button => button.textContent === "Save changes")!.disabled).toBe(false);
});
