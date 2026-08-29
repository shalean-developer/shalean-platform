import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const shellPath = join(process.cwd(), "src/features/office/OfficeShell.tsx");
const source = readFileSync(shellPath, "utf8");

describe("SR-12C Office mobile dialog accessible-name contract", () => {
  it("names the modal Office navigation dialog", () => {
    expect(source).toContain('role="dialog"');
    expect(source).toContain('aria-modal="true"');
    expect(source).toContain('aria-label="Office navigation"');
  });

  it("preserves the close-menu control and sidebar content", () => {
    expect(source).toContain('aria-label="Close menu"');
    expect(source).toContain('onClick={() => setMobileOpen(false)}');
    expect(source).toContain("<OfficeSidebarContent");
  });

  it("preserves earlier SR-12 accessibility contracts", () => {
    expect(source).toContain('aria-live="polite"');
    expect(source).toContain('aria-busy="true"');
    expect(source).toContain("Loading Office workspace…");
    expect(source).toContain("focus-visible:ring-2");
  });
});
