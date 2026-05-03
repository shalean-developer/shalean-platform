import { describe, expect, it } from "vitest";
import { normalizeRequestedPreferredAreas } from "@/lib/cleaner/normalizeRequestedPreferredAreas";

describe("normalizeRequestedPreferredAreas", () => {
  it("accepts a valid single area", () => {
    const r = normalizeRequestedPreferredAreas({ requested_locations: ["Claremont"] });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toEqual(["Claremont"]);
  });

  it("dedupes case-insensitively", () => {
    const r = normalizeRequestedPreferredAreas({ requested_locations: ["claremont", "Claremont"] });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toEqual(["Claremont"]);
  });

  it("rejects more than three", () => {
    const r = normalizeRequestedPreferredAreas({
      requested_locations: ["Claremont", "Newlands", "Observatory", "Sea Point"],
    });
    expect(r.ok).toBe(false);
  });

  it("maps legacy requested_location string", () => {
    const r = normalizeRequestedPreferredAreas({ requested_location: "Kenilworth" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toEqual(["Kenilworth"]);
  });

  it("rejects unknown names", () => {
    const r = normalizeRequestedPreferredAreas({ requested_locations: ["Atlantis"] });
    expect(r.ok).toBe(false);
  });

  it("accepts three distinct areas", () => {
    const r = normalizeRequestedPreferredAreas({
      requested_locations: ["Claremont", "Newlands", "Observatory"],
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toHaveLength(3);
  });
});
