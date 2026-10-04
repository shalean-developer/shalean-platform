import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("cleaner dashboard current-job heading", () => {
  it("labels an in-progress booking as Current job and otherwise keeps Next job", () => {
    const source = readFileSync(
      join(process.cwd(), "components/cleaner/NextJobCard.tsx"),
      "utf8",
    );

    expect(source).toContain('const cardHeading = inProgress ? "Current job" : "Next job";');
    expect(source).toContain("{cardHeading}");
  });
});
