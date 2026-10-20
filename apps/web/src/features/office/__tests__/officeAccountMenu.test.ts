// @vitest-environment jsdom
import React, { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OfficeAccountMenu } from "@/components/office/OfficeAccountMenu";
vi.stubGlobal("React", React);
vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
let root: Root;
let container: HTMLDivElement;
beforeEach(() => { container = document.createElement("div"); document.body.append(container); root = createRoot(container); });
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.clearAllMocks(); });

describe("Office account menu", () => {
  it("opens with the keyboard without signing out, then signs out only on explicit selection", async () => {
    const onLogout = vi.fn();
    await act(async () => root.render(createElement(OfficeAccountMenu, { userLabel: "editor@example.com", initials: "ED", onLogout })));
    const trigger = container.querySelector("button")!;
    expect(trigger.getAttribute("aria-label")).toBe("Open account menu");
    trigger.focus();
    await act(async () => trigger.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
    expect(onLogout).not.toHaveBeenCalled();
    const item = document.querySelector('[role="menuitem"]') as HTMLElement;
    expect(item.textContent).toContain("Sign out");
    await act(async () => item.click());
    expect(onLogout).toHaveBeenCalledTimes(1);
  });
  it("closes on Escape without signing out", async () => {
    const onLogout = vi.fn();
    await act(async () => root.render(createElement(OfficeAccountMenu, { userLabel: "editor@example.com", initials: "ED", onLogout })));
    const trigger = container.querySelector("button")!; trigger.focus();
    await act(async () => trigger.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })));
    const menu = document.querySelector('[role="menu"]')!;
    await act(async () => menu.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(document.querySelector('[role="menu"]')).toBeNull();
    expect(onLogout).not.toHaveBeenCalled();
  });
});
