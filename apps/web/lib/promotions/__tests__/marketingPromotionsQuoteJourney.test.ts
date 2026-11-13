// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { MarketingPromotions } from "@/components/promotions/MarketingPromotions";

const state = vi.hoisted(() => ({ pathname: "/quote", mounts: 0, cleanups: 0 }));
vi.mock("next/navigation", () => ({ usePathname: () => state.pathname }));
vi.mock("@/components/promotions/PromotionAnnouncementBar", () => ({ PromotionAnnouncementBar: () => React.createElement("aside", null, "Promotion bar") }));
vi.mock("@/components/promotions/PromotionPopup", async () => {
  const { useEffect } = await import("react");
  return { PromotionPopup: () => {
    useEffect(() => {
      state.mounts++;
      document.body.style.overflow = "hidden";
      return () => { state.cleanups++; document.body.style.overflow = ""; };
    }, []);
    return React.createElement("div", { role: "dialog" }, "Campaign");
  } };
});

const container = document.createElement("div");
const root = createRoot(container);
afterEach(async () => {
  await act(async () => root.render(null));
  document.body.style.overflow = "";
});

it("never mounts promotions on direct quote entry and cleans them up when navigating into the form", async () => {
  await act(async () => root.render(React.createElement(MarketingPromotions)));
  expect(container.textContent).toBe("");
  expect(state.mounts).toBe(0);
  state.pathname = "/services/move-out-cleaning-cape-town";
  await act(async () => root.render(React.createElement(MarketingPromotions)));
  expect(container.textContent).toContain("Promotion bar");
  expect(state.mounts).toBe(1);
  state.pathname = "/quote";
  await act(async () => root.render(React.createElement(MarketingPromotions)));
  expect(container.textContent).toBe("");
  expect(state.cleanups).toBe(1);
  expect(document.body.style.overflow).toBe("");
});
