import { describe, expect, it } from "vitest";
import {
  isPathDisallowedByRobots,
  pathMatchesRobotsPattern,
  robotsPatternToRegExp,
} from "@/lib/seo/robotsPathRules";

describe("robotsPathRules", () => {
  it("supports Google $ end anchors", () => {
    expect(pathMatchesRobotsPattern("/cleaner/apply", "/cleaner/apply$")).toBe(true);
    expect(pathMatchesRobotsPattern("/cleaner/apply/form", "/cleaner/apply$")).toBe(false);
    expect(robotsPatternToRegExp("/cleaner/apply$").test("/cleaner/apply/form")).toBe(false);
  });

  it("uses longest-match with Allow winning ties", () => {
    const rules = {
      allow: ["/", "/cleaner/apply$"],
      disallow: ["/cleaner/"],
    };
    expect(isPathDisallowedByRobots("/cleaner/apply", rules)).toBe(false);
    expect(isPathDisallowedByRobots("/cleaner/apply/form", rules)).toBe(true);
    expect(isPathDisallowedByRobots("/about", rules)).toBe(false);
  });
});
