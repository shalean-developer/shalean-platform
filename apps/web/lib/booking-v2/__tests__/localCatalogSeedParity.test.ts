import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const seed = readFileSync(
  join(process.cwd(), "../../supabase/seeds/nonprod/env03_catalog_and_fixtures.sql"),
  "utf8",
);

describe("local ENV-03 booking catalog parity", () => {
  it("uses the current service base prices for manual local UAT", () => {
    expect(seed).toContain("'standard', 'TEST Regular Cleaning', 250");
    expect(seed).toContain("'deep', 'TEST Deep Cleaning', 1200");
    expect(seed).toContain("'move', 'TEST Moving Cleaning', 1200");
    expect(seed).toContain("'office', 'TEST Office Cleaning', 300");
    expect(seed).toContain("'airbnb', 'TEST Airbnb Cleaning', 250");
    expect(seed).toContain("'carpet', 'TEST Carpet Cleaning', 500");
  });

  it("seeds the approved Regular, Deep and Moving extras with service assignments", () => {
    expect(seed).toContain(
      "ARRAY['regular-cleaning']::text[], true, true, 10",
    );
    expect(seed).toContain(
      "ARRAY['deep-cleaning','moving-cleaning']::text[], false, true, 60",
    );
    expect(seed).toContain(
      "ARRAY['deep-cleaning']::text[], false, true, 70",
    );
    expect(seed).toContain(
      "ARRAY['moving-cleaning']::text[], false, true, 100",
    );
    expect(seed).toContain(
      "ARRAY['moving-cleaning']::text[], false, true, 110",
    );
  });

  it("updates service_slugs on repeat seeding so stale local rows are repaired", () => {
    expect(seed).toContain("service_slugs = EXCLUDED.service_slugs");
  });
});
