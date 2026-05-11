import { describe, it, expect } from "vitest";
import {
  classifyDashboardFanOutSettlements,
  decideDashboardErrorRender,
} from "@/lib/cleaner-dashboard/dashboardErrorFanOut";

describe("classifyDashboardFanOutSettlements", () => {
  it("returns nulls when both fetches succeed", () => {
    const r = classifyDashboardFanOutSettlements({
      offers: { status: "fulfilled", value: undefined },
      dashboard: { status: "fulfilled", value: undefined },
    });
    expect(r).toEqual({ offersError: null, dashboardError: null });
  });

  it("captures only the dashboard error when offers succeed (the reproduced bug shape)", () => {
    const r = classifyDashboardFanOutSettlements({
      offers: { status: "fulfilled", value: undefined },
      dashboard: { status: "rejected", reason: new Error("503: backend slow") },
    });
    expect(r.offersError).toBeNull();
    expect(r.dashboardError).toBe("503: backend slow");
  });

  it("captures only the offers error when dashboard succeeds", () => {
    const r = classifyDashboardFanOutSettlements({
      offers: { status: "rejected", reason: new Error("offers parse failed") },
      dashboard: { status: "fulfilled", value: undefined },
    });
    expect(r.offersError).toBe("offers parse failed");
    expect(r.dashboardError).toBeNull();
  });

  it("captures both errors independently when both fail", () => {
    const r = classifyDashboardFanOutSettlements({
      offers: { status: "rejected", reason: new Error("a") },
      dashboard: { status: "rejected", reason: new Error("b") },
    });
    expect(r).toEqual({ offersError: "a", dashboardError: "b" });
  });

  it("falls back to a default message for non-Error reasons", () => {
    const r = classifyDashboardFanOutSettlements({
      offers: { status: "rejected", reason: 42 },
      dashboard: { status: "rejected", reason: { weird: true } },
    });
    expect(r.offersError).toBe("Could not load offers.");
    expect(r.dashboardError).toBe("Could not load dashboard.");
  });

  it("treats blank string reasons as fallback", () => {
    const r = classifyDashboardFanOutSettlements({
      offers: { status: "rejected", reason: "" },
      dashboard: { status: "rejected", reason: "    " },
    });
    expect(r.offersError).toBe("Could not load offers.");
    expect(r.dashboardError).toBe("Could not load dashboard.");
  });
});

describe("decideDashboardErrorRender", () => {
  it("collapses to error view ONLY for catastrophic identity errors", () => {
    const r = decideDashboardErrorRender({
      catastrophicError: "Not signed in.",
      dashboardError: null,
      offersError: null,
      hasPendingOffers: true,
    });
    expect(r.collapseToErrorView).toBe(true);
    expect(r.pendingOffersStillVisible).toBe(false);
    expect(r.showDashboardErrorStrip).toBe(false);
    expect(r.showOffersErrorStrip).toBe(false);
  });

  it("REGRESSION: keeps pending offers visible when dashboard fetch fails", () => {
    const r = decideDashboardErrorRender({
      catastrophicError: null,
      dashboardError: "503: dashboard slow",
      offersError: null,
      hasPendingOffers: true,
    });
    expect(r.collapseToErrorView).toBe(false);
    expect(r.pendingOffersStillVisible).toBe(true);
    expect(r.showDashboardErrorStrip).toBe(true);
  });

  it("REGRESSION: keeps page rendered when offers refresh fails (last good list survives)", () => {
    const r = decideDashboardErrorRender({
      catastrophicError: null,
      dashboardError: null,
      offersError: "Could not refresh offers.",
      hasPendingOffers: true,
    });
    expect(r.collapseToErrorView).toBe(false);
    expect(r.pendingOffersStillVisible).toBe(true);
    expect(r.showOffersErrorStrip).toBe(true);
  });

  it("does not show strips when their respective error is null", () => {
    const r = decideDashboardErrorRender({
      catastrophicError: null,
      dashboardError: null,
      offersError: null,
      hasPendingOffers: false,
    });
    expect(r).toEqual({
      collapseToErrorView: false,
      showDashboardErrorStrip: false,
      showOffersErrorStrip: false,
      pendingOffersStillVisible: false,
    });
  });

  it("does not show partial-error strips while collapsed for catastrophic error", () => {
    const r = decideDashboardErrorRender({
      catastrophicError: "Not signed in.",
      dashboardError: "x",
      offersError: "y",
      hasPendingOffers: true,
    });
    expect(r.collapseToErrorView).toBe(true);
    // Strips would be redundant under the takeover screen.
    expect(r.showDashboardErrorStrip).toBe(false);
    expect(r.showOffersErrorStrip).toBe(false);
  });
});
