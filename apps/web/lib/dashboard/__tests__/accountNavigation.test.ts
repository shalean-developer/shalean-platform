// @vitest-environment jsdom
import React, { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AccountMobileNav, AccountSidebar } from "@/src/features/account/AccountNav";

const route = vi.hoisted(() => ({ pathname: "/account" }));
vi.mock("next/navigation", () => ({ usePathname: () => route.pathname, useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/hooks/useUser", () => ({ useUser: () => ({ user: { email: "test@example.com", user_metadata: { full_name: "Test Customer" } } }) }));
vi.mock("@/lib/auth/authClient", () => ({ signOut: vi.fn(), reportSignOutFailure: vi.fn() }));
vi.stubGlobal("React", React);
vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
let root: Root;
let container: HTMLDivElement;
const scrollIntoView = vi.fn();
beforeEach(() => {
  route.pathname = "/account";
  Element.prototype.scrollIntoView = scrollIntoView;
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.clearAllMocks(); });

describe("customer account navigation", () => {
  it("selects nested routes and brings the selected item into view", async () => {
    route.pathname = "/account/bookings/booking-1";
    await act(async () => root.render(createElement(AccountSidebar)));
    const current = container.querySelectorAll('[aria-current="page"]');
    expect(current).toHaveLength(1);
    expect(current[0].textContent).toBe("Bookings");
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest" });
    expect(container.querySelector('a[href="/account/book"]')?.textContent).toBe("Book a clean");
    expect(container.querySelectorAll('a[href="/account/profile"]')).toHaveLength(1);
    expect(container.querySelector('nav')?.tabIndex).toBe(0);
  });

  it("exposes the full navigation on mobile and closes after choosing a destination", async () => {
    await act(async () => root.render(createElement(AccountMobileNav)));
    const trigger = container.querySelector('button[aria-label="Open account navigation"]') as HTMLButtonElement;
    await act(async () => trigger.click());
    const dialog = document.querySelector('[role="dialog"]')!;
    for (const path of ["payments", "addresses", "recurring", "referrals", "rewards", "sales-documents", "help", "profile"]) {
      expect(dialog.querySelector(`a[href="/account/${path}"]`)).not.toBeNull();
    }
    dialog.addEventListener("click", event => event.preventDefault());
    await act(async () => (dialog.querySelector('a[href="/account/addresses"]') as HTMLElement).click());
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  });
});
