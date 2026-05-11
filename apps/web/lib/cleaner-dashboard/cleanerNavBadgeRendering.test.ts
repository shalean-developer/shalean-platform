import { describe, it, expect } from "vitest";
import {
  cleanerNavBadgeLabel,
  cleanerNavTabAriaLabel,
  pickCleanerNavTabBadge,
} from "@/lib/cleaner-dashboard/cleanerNavBadgeRendering";

describe("pickCleanerNavTabBadge", () => {
  it("returns null for tabs that don't carry a badge (Earnings, Profile)", () => {
    expect(pickCleanerNavTabBadge({ href: "/cleaner/earnings", openJobsCount: 5, pendingOffersCount: 2 })).toBeNull();
    expect(pickCleanerNavTabBadge({ href: "/cleaner/profile", openJobsCount: 5, pendingOffersCount: 2 })).toBeNull();
  });

  it("returns a 'jobs' badge on /cleaner/jobs when there are open jobs", () => {
    const badge = pickCleanerNavTabBadge({ href: "/cleaner/jobs", openJobsCount: 3, pendingOffersCount: 0 });
    expect(badge).toEqual({ kind: "jobs", count: 3 });
  });

  it("returns an 'offers' badge on /cleaner/dashboard when there are pending offers (SMS-failed surface)", () => {
    const badge = pickCleanerNavTabBadge({ href: "/cleaner/dashboard", openJobsCount: 0, pendingOffersCount: 1 });
    expect(badge).toEqual({ kind: "offers", count: 1 });
  });

  it("does NOT cross tabs (offers do not appear on Jobs, jobs do not appear on Home)", () => {
    expect(
      pickCleanerNavTabBadge({ href: "/cleaner/jobs", openJobsCount: 0, pendingOffersCount: 4 }),
    ).toBeNull();
    expect(
      pickCleanerNavTabBadge({ href: "/cleaner/dashboard", openJobsCount: 7, pendingOffersCount: 0 }),
    ).toBeNull();
  });

  it("treats negative / non-finite counts as zero", () => {
    expect(
      pickCleanerNavTabBadge({ href: "/cleaner/jobs", openJobsCount: -3, pendingOffersCount: 0 }),
    ).toBeNull();
    expect(
      pickCleanerNavTabBadge({ href: "/cleaner/dashboard", openJobsCount: 0, pendingOffersCount: Number.NaN }),
    ).toBeNull();
  });
});

describe("cleanerNavBadgeLabel", () => {
  it("renders single digits as-is", () => {
    expect(cleanerNavBadgeLabel(1)).toBe("1");
    expect(cleanerNavBadgeLabel(9)).toBe("9");
  });

  it("caps double digits at 9+", () => {
    expect(cleanerNavBadgeLabel(10)).toBe("9+");
    expect(cleanerNavBadgeLabel(42)).toBe("9+");
  });

  it("returns empty string for zero / negative / non-finite", () => {
    expect(cleanerNavBadgeLabel(0)).toBe("");
    expect(cleanerNavBadgeLabel(-2)).toBe("");
    expect(cleanerNavBadgeLabel(Number.NaN)).toBe("");
  });
});

describe("cleanerNavTabAriaLabel", () => {
  it("returns the bare label when there's no badge", () => {
    expect(cleanerNavTabAriaLabel("Home", null)).toBe("Home");
  });

  it("singular vs plural copy for the offers badge", () => {
    expect(cleanerNavTabAriaLabel("Home", { kind: "offers", count: 1 })).toBe("Home — 1 new offer waiting");
    expect(cleanerNavTabAriaLabel("Home", { kind: "offers", count: 3 })).toBe("Home — 3 new offers waiting");
  });

  it("singular vs plural copy for the jobs badge", () => {
    expect(cleanerNavTabAriaLabel("Jobs", { kind: "jobs", count: 1 })).toBe("Jobs — 1 open job");
    expect(cleanerNavTabAriaLabel("Jobs", { kind: "jobs", count: 4 })).toBe("Jobs — 4 open jobs");
  });
});
