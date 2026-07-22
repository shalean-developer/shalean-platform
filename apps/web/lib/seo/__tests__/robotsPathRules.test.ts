import { describe, expect, it } from "vitest";
import {
  isPathDisallowedByRobots,
  pathMatchesRobotsPattern,
  robotsPatternToRegExp,
} from "@/lib/seo/robotsPathRules";
import { seoRobotsAllowPaths, seoRobotsDisallowPaths } from "@/lib/seo/seoRebuildPhase1";

describe("robotsPathRules", () => {
  it("supports Google $ end anchors without inventing trailing-slash variants", () => {
    expect(pathMatchesRobotsPattern("/cleaner/apply", "/cleaner/apply$")).toBe(true);
    expect(pathMatchesRobotsPattern("/cleaner/apply/", "/cleaner/apply$")).toBe(false);
    expect(pathMatchesRobotsPattern("/cleaner/apply/form", "/cleaner/apply$")).toBe(false);
    expect(robotsPatternToRegExp("/cleaner/apply$").test("/cleaner/apply/form")).toBe(false);
  });

  it("uses longest-match with Allow winning ties for Disallow: /cleaner", () => {
    const rules = {
      allow: ["/", "/cleaner/apply$"],
      disallow: ["/cleaner"],
    };
    expect(isPathDisallowedByRobots("/cleaner/apply", rules)).toBe(false);
    expect(isPathDisallowedByRobots("/cleaner/apply/", rules)).toBe(true);
    expect(isPathDisallowedByRobots("/cleaner/apply/form", rules)).toBe(true);
    expect(isPathDisallowedByRobots("/about", rules)).toBe(false);
  });

  it("evaluates the actual requested URL only (no manufactured trailing-slash candidate)", () => {
    // Disallow: /cleaner/ must NOT match exact /cleaner when we do not invent /cleaner/.
    expect(pathMatchesRobotsPattern("/cleaner", "/cleaner/")).toBe(false);
    expect(pathMatchesRobotsPattern("/cleaner/", "/cleaner/")).toBe(true);
    // Disallow: /cleaner (prefix) matches both.
    expect(pathMatchesRobotsPattern("/cleaner", "/cleaner")).toBe(true);
    expect(pathMatchesRobotsPattern("/cleaner/", "/cleaner")).toBe(true);
  });
});

describe("cleaner robots longest-match regression matrix", () => {
  const rules = {
    allow: seoRobotsAllowPaths(),
    disallow: seoRobotsDisallowPaths(),
  };

  it.each([
    ["/cleaner", true],
    ["/cleaner/", true],
    ["/cleaner/login", true],
    ["/cleaner/dashboard", true],
    ["/cleaner/apply", false],
    ["/cleaner/apply/", true],
    ["/cleaner/apply/form", true],
    ["/cleaner/apply/anything", true],
  ] as const)("%s → disallowed=%s", (pathname, disallowed) => {
    expect(isPathDisallowedByRobots(pathname, rules)).toBe(disallowed);
  });
});
