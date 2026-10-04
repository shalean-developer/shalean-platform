import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const seed = readFileSync(
  join(process.cwd(), "../../supabase/seeds/nonprod/env03_catalog_and_fixtures.sql"),
  "utf8",
);
const rootPackage = readFileSync(
  join(process.cwd(), "../../package.json"),
  "utf8",
);
const localSqlRunner = readFileSync(
  join(process.cwd(), "../../scripts/run-local-supabase-sql.mjs"),
  "utf8",
);

describe("local ENV-03 booking catalog parity", () => {
  it("executes the multi-statement catalog seed through the local Docker Postgres runner", () => {
    expect(rootPackage).toContain(
      "node scripts/run-local-supabase-sql.mjs supabase/seeds/nonprod/env03_catalog_and_fixtures.sql",
    );
    expect(rootPackage).not.toContain(
      "supabase db query --local -f supabase/seeds/nonprod/env03_catalog_and_fixtures.sql",
    );
    expect(localSqlRunner).toContain('name.startsWith("supabase_db_")');
    expect(localSqlRunner).toContain("54322->5432");
    expect(localSqlRunner).toContain('"ON_ERROR_STOP=1"');
  });

  it("uses the current service base prices for manual local UAT", () => {
    expect(seed).toContain("'standard', 'TEST Regular Cleaning', 250");
    expect(seed).toContain("'deep', 'TEST Deep Cleaning', 1200");
    expect(seed).toContain("'move', 'TEST Moving Cleaning', 1200");
    expect(seed).toContain("'office', 'TEST Office Cleaning', 300");
    expect(seed).toContain("'airbnb', 'TEST Airbnb Cleaning', 250");
    expect(seed).toContain("'carpet', 'TEST Carpet Cleaning', 500");
  });

  it("uses the production booking service fees for the three tested services", () => {
    expect(seed).toContain("'standard', 'TEST Regular Cleaning', 250, 80, 60, 30, 30");
    expect(seed).toContain("'deep', 'TEST Deep Cleaning', 1200, 100, 80, 40, 60");
    expect(seed).toContain("'move', 'TEST Moving Cleaning', 1200, 120, 90, 45, 60");
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
