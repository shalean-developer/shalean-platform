import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(join(process.cwd(), "components/booking/BookIndexHeader.tsx"), "utf8");

describe("book index header", () => {
  it("uses the account dropdown without exposing a phone action", () => {
    expect(source).toContain("<HeaderLoginButton avatarOnly />");
    expect(source).not.toContain("087 153 5250");
    expect(source).not.toContain("tel:");
    expect(source).not.toContain("Phone");
  });
});
