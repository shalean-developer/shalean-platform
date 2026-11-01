import { describe, expect, it } from "vitest";
import { PROGRAMMATIC_POSTS, getProgrammaticFaqEntities } from "../programmaticPosts";

const revised = PROGRAMMATIC_POSTS.filter(
  (post) => post.service === "local-guide" &&
    ["pricing", "cleaning_frequency", "deep_checklist"].includes(post.guideVariant ?? ""),
);

describe("local guide FAQ accuracy", () => {
  it("covers the live regional guide variants", () => {
    expect(revised.some((post) => post.location === "Claremont")).toBe(true);
    expect(revised.some((post) => post.location === "Durbanville")).toBe(true);
    expect(revised.some((post) => post.location === "Sea Point")).toBe(true);
  });

  it.each(revised)("does not substitute coastal assumptions for $slug", (post) => {
    const faq = getProgrammaticFaqEntities(post);
    const copy = faq.map((item) => item.answer).join(" ");
    expect(copy).not.toMatch(/Atlantic Seaboard|R450|coastal dust load|Coastal grit|insured teams/);
    expect(faq[0].question).toContain(post.location);
    expect(faq).toHaveLength(4);
    expect(post.dateModified).toBe("2026-11-01T10:00:00+02:00");
    if (post.guideVariant === "pricing") {
      expect(faq[0].answer).toContain(post.location);
      expect(faq[0].answer).toContain("illustrative");
      expect(faq[0].answer).toContain("before payment");
    }
    if (post.guideVariant === "cleaning_frequency") {
      expect(faq[0].answer).toContain(post.location);
      expect(faq[0].answer).toContain("Household size");
    }
  });

  it("preserves publication dates and dates of untouched guide variants", () => {
    for (const post of PROGRAMMATIC_POSTS) {
      expect(post.publishedAt).not.toMatch(/^2026-11-01/);
      if (!revised.includes(post)) expect(post.dateModified).not.toBe("2026-11-01T10:00:00+02:00");
    }
  });
});
