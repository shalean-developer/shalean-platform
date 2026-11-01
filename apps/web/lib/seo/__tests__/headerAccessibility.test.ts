// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SiteHeader } from "@/components/nav/SiteHeader";

const mocks = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: () => "/", useRouter: () => ({ push: mocks.push }) }));
vi.mock("next/link", () => ({ default: ({ children, ...props }: React.ComponentProps<"a">) => React.createElement("a", props, children) }));
vi.mock("@/components/nav/SiteTopBarAccount", () => ({ SiteTopBarAccount: () => null }));
vi.mock("@/components/brand/ShaleanNavLogo", () => ({ ShaleanNavLogo: () => React.createElement("span", null, "Shalean") }));
vi.mock("@/components/growth/GrowthCtaLink", () => ({ GrowthCtaLink: () => null }));
vi.mock("@/components/marketing/GetFreeQuoteLink", () => ({ GetFreeQuoteLink: () => null }));
vi.mock("@/components/marketing-home/MarketingMobileHeaderBookButton", () => ({ MarketingMobileHeaderBookButton: () => null }));

let root: Root;
let container: HTMLDivElement;
function button(label: string): HTMLButtonElement {
  const found = [...container.querySelectorAll("button")].find(b => b.getAttribute("aria-label") === label || b.textContent?.trim() === label);
  if (!found) throw new Error(`Missing button: ${label}`);
  return found;
}
function click(el: HTMLElement) { act(() => el.click()); }
function escape(el: HTMLElement) { act(() => el.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }))); }
function mount(actionMode: "growth" | "auth" = "growth") {
  act(() => root.render(React.createElement(SiteHeader, {
    bookingHref: "/book", mobileNavId: "test-mobile-nav", visualMode: "dribbble", actionMode,
    tracking: { desktopQuote: "test", desktopBook: "test", mobileBook: "test", mobileQuote: "test" },
  })));
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mocks.push.mockClear();
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); vi.unstubAllGlobals(); });

describe("header disclosure keyboard behavior", () => {
  it.each(["growth", "auth"] as const)("closes the %s mobile drawer and restores focus", mode => {
    mount(mode); click(button("Open menu"));
    const link = container.querySelector<HTMLAnchorElement>('#test-mobile-nav a[href="/cleaning-prices-cape-town"]')!;
    link.focus(); escape(link);
    expect(button("Open menu").getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(button("Open menu"));
    expect(container.querySelector("#test-mobile-nav")?.getAttribute("aria-hidden")).toBe("true");
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("closes desktop Services and returns focus to its disclosure", () => {
    mount(); const trigger = container.querySelector<HTMLButtonElement>('nav[aria-label="Primary"] button')!;
    click(trigger); const link = trigger.parentElement!.querySelector<HTMLAnchorElement>('a[href="/services/deep-cleaning-cape-town"]')!;
    link.focus(); escape(link);
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(trigger);
  });

  it("places expansion state on the search disclosure button, preserving search input semantics", () => {
    mount(); const input = container.querySelector<HTMLInputElement>('input[placeholder="Search cleaning services"]')!;
    expect(input.hasAttribute("aria-expanded")).toBe(false);
    const toggle = button("Show service search results");
    expect(toggle.getAttribute("aria-controls")).toBe("shalean-header-service-search-results");
    click(toggle); expect(button("Hide service search results").getAttribute("aria-expanded")).toBe("true");
    const result = container.querySelector<HTMLButtonElement>('#shalean-header-service-search-results button')!;
    result.focus(); escape(result);
    expect(document.activeElement).toBe(input);
    expect(button("Show service search results").getAttribute("aria-expanded")).toBe("false");
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("retains Enter navigation to the first service", () => {
    mount(); const input = container.querySelector<HTMLInputElement>('input[placeholder="Search cleaning services"]')!;
    act(() => input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true })));
    expect(mocks.push).toHaveBeenCalledWith("/services/standard-cleaning-cape-town");
  });

  it("preserves the filtered query on Escape and navigates to its matching service on Enter", () => {
    mount(); const input = container.querySelector<HTMLInputElement>('input[placeholder="Search cleaning services"]')!;
    act(() => {
      input.focus();
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "Deep");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(container.querySelector("#shalean-header-service-search-results")?.textContent).not.toContain("Regular Cleaning");
    escape(input);
    expect(input.value).toBe("Deep");
    expect(button("Show service search results").getAttribute("aria-expanded")).toBe("false");
    act(() => input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true })));
    expect(mocks.push).toHaveBeenCalledWith("/services/deep-cleaning-cape-town");
  });

  it("does not steal focus when Escape comes from outside the open header", () => {
    mount(); click(button("Open menu"));
    const outside = document.createElement("button"); document.body.append(outside); outside.focus();
    escape(outside); expect(document.activeElement).toBe(outside); outside.remove();
    expect(button("Open menu").getAttribute("aria-expanded")).toBe("false");
  });
});
