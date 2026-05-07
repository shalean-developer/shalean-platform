import { describe, expect, it } from "vitest";
import {
  computeSeoMomentumMovers,
  partitionSeoMomentumRisersFallers,
  signedTrajectoryScore,
  type SeoMomentumMover,
} from "./compute-seo-momentum-movers";

describe("computeSeoMomentumMovers", () => {
  it("ranks slugs with combined movement and builds a signal line", () => {
    const curBook = new Map([
      ["a", 5],
      ["b", 1],
    ]);
    const prevBook = new Map([
      ["a", 2],
      ["b", 1],
    ]);
    const curScroll = new Map([
      ["a", { slug: "a", pct_to_100: 40 }],
      ["b", { slug: "b", pct_to_100: 10 }],
    ]);
    const prevScroll = new Map([
      ["a", { slug: "a", pct_to_100: 30 }],
      ["b", { slug: "b", pct_to_100: 10 }],
    ]);
    const curHealth = new Map([
      ["a", 70],
      ["b", 50],
    ]);
    const prevHealth = new Map([
      ["a", 60],
      ["b", 50],
    ]);
    const out = computeSeoMomentumMovers({
      slugs: ["a", "b"],
      curBook,
      prevBook,
      curScroll,
      prevScroll,
      curHealth,
      prevHealth,
    });
    expect(out[0]?.slug).toBe("a");
    expect(out[0]?.signalLine).toContain("Health +10");
    expect(out[0]?.signalLine).toContain("Bookings +3");
    expect(out[0]?.signalLine).toContain("Scroll");
    expect(out.find((r) => r.slug === "b")).toBeUndefined();
  });
});

describe("signedTrajectoryScore", () => {
  it("treats null health delta as zero", () => {
    const m: SeoMomentumMover = {
      slug: "x",
      momentum: 1,
      healthDelta: null,
      bookingsDelta: 1,
      scrollPointsDelta: 0,
      signalLine: "",
    };
    expect(signedTrajectoryScore(m)).toBe(3);
  });
});

describe("partitionSeoMomentumRisersFallers", () => {
  it("splits positive vs negative trajectory", () => {
    const up: SeoMomentumMover = {
      slug: "up",
      momentum: 10,
      healthDelta: 5,
      bookingsDelta: 1,
      scrollPointsDelta: 0,
      signalLine: "",
    };
    const down: SeoMomentumMover = {
      slug: "down",
      momentum: 12,
      healthDelta: -4,
      bookingsDelta: -2,
      scrollPointsDelta: null,
      signalLine: "",
    };
    const { risers, fallers } = partitionSeoMomentumRisersFallers([down, up], 5, 0);
    expect(risers.map((r) => r.slug)).toEqual(["up"]);
    expect(fallers.map((r) => r.slug)).toEqual(["down"]);
  });

  it("excludes low-magnitude movers from risers when default min momentum applies", () => {
    const weak: SeoMomentumMover = {
      slug: "weak",
      momentum: 2,
      healthDelta: 1,
      bookingsDelta: 0,
      scrollPointsDelta: 0,
      signalLine: "",
    };
    const { risers } = partitionSeoMomentumRisersFallers([weak], 5);
    expect(risers).toHaveLength(0);
    const { risers: withOverride } = partitionSeoMomentumRisersFallers([weak], 5, 0);
    expect(withOverride.map((r) => r.slug)).toEqual(["weak"]);
  });
});
