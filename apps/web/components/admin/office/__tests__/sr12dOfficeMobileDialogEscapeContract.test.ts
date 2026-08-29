import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const shellPath = path.join(root, "src/features/office/OfficeShell.tsx");
const shell = fs.readFileSync(shellPath, "utf8");

describe("SR-12D Office mobile dialog Escape contract", () => {
  it("closes the mobile drawer with Escape only while it is open", () => {
    expect(shell).toContain("if (!mobileOpen) return;");
    expect(shell).toContain('if (e.key === "Escape")');
    expect(shell).toContain("setMobileOpen(false);");
    expect(shell).toContain('document.addEventListener("keydown", down);');
    expect(shell).toContain('return () => document.removeEventListener("keydown", down);');
    expect(shell).toContain("}, [mobileOpen]);");
  });

  it("preserves the named modal and existing close path", () => {
    expect(shell).toContain('role="dialog"');
    expect(shell).toContain('aria-modal="true"');
    expect(shell).toContain('aria-label="Office navigation"');
    expect(shell).toContain('aria-label="Close menu"');
    expect(shell).toContain('onClick={() => setMobileOpen(false)}');
  });

  it("preserves earlier SR-12 accessibility contracts", () => {
    expect(shell).toContain('aria-live="polite"');
    expect(shell).toContain("Loading Office workspace…");
    expect(shell).toContain("focus-visible:ring-2");
  });
});
