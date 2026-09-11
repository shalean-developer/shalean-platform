import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  join(process.cwd(), "src/features/office/OfficeShell.tsx"),
  "utf8",
);
const mobileDrawer = source.slice(
  source.indexOf("{/* Mobile drawer */}"),
  source.indexOf("{/* Main content */}"),
);

describe("SR-12C Office mobile dialog accessible-name convergence", () => {
  it("keeps the mobile navigation drawer named as a modal dialog", () => {
    expect(mobileDrawer).toContain('role="dialog"');
    expect(mobileDrawer).toContain('aria-modal="true"');
    expect(mobileDrawer).toContain('aria-label="Office navigation"');
    expect(mobileDrawer.match(/role="dialog"/g)).toHaveLength(1);
    expect(mobileDrawer.match(/aria-label="Office navigation"/g)).toHaveLength(1);
  });

  it("preserves the existing drawer open and close controls", () => {
    expect(source).toContain("const [mobileOpen, setMobileOpen] = useState(false)");
    expect(source).toContain("onMenuOpen={() => setMobileOpen(true)}");
    expect(mobileDrawer).toContain("{mobileOpen ? (");
    expect(mobileDrawer).toContain('aria-label="Close menu"');
    expect(mobileDrawer.match(/setMobileOpen\(false\)/g)).toHaveLength(2);
    expect(source).toContain("globalThis.setTimeout(() => setMobileOpen(false), 0)");
    expect(source).toContain("}, [pathname])");
  });
});
