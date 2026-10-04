import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  join(process.cwd(), "src/features/office/OfficeShell.tsx"),
  "utf8",
);
const escapeEffect = source.slice(
  source.indexOf("if (!mobileOpen || commandOpen) return;"),
  source.indexOf("}, [mobileOpen, commandOpen]);") +
    "}, [mobileOpen, commandOpen]);".length,
);
const mobileDrawer = source.slice(
  source.indexOf("{/* Mobile drawer */}"),
  source.indexOf("{/* Main content */}"),
);

describe("SR-12D Office mobile dialog Escape convergence", () => {
  it("listens for Escape only while the drawer is the topmost open dialog", () => {
    expect(escapeEffect).toContain("if (!mobileOpen || commandOpen) return;");
    expect(escapeEffect).toContain('if (event.key === "Escape")');
    expect(escapeEffect).toContain("event.preventDefault();");
    expect(escapeEffect).toContain("setMobileOpen(false);");
    expect(escapeEffect).toContain('document.addEventListener("keydown", down);');
    expect(escapeEffect).toContain(
      'return () => document.removeEventListener("keydown", down);',
    );
    expect(escapeEffect).toContain("}, [mobileOpen, commandOpen]);");
  });

  it("leaves the drawer open when Escape dismisses the command palette", () => {
    expect(source).toContain("const [commandOpen, setCommandOpen] = useState(false)");
    expect(source).toContain("<OfficeCommandPalette open={commandOpen}");
    expect(escapeEffect).toContain("|| commandOpen");
  });

  it("preserves the named modal and existing open and close paths", () => {
    expect(source).toContain("onMenuOpen={() => setMobileOpen(true)}");
    expect(mobileDrawer).toContain('role="dialog"');
    expect(mobileDrawer).toContain('aria-modal="true"');
    expect(mobileDrawer).toContain('aria-label="Office navigation"');
    expect(mobileDrawer).toContain('aria-label="Close menu"');
    expect(mobileDrawer.match(/setMobileOpen\(false\)/g)).toHaveLength(2);
    expect(source).toContain("globalThis.setTimeout(() => setMobileOpen(false), 0)");
  });
});
