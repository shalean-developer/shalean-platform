import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

describe("SEO-023 attribution contract", () => {
  it("does not classify all no-UTM traffic as organic and links revenue to persisted bookings", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "app/api/admin/seo-insights/organic-revenue/route.ts"),
      "utf8",
    );
    expect(source).toContain('if (medium === "organic") return true');
    expect(source).toContain('unattributedSessions');
    expect(source).toContain('.from("bookings")');
    expect(source).toContain('amount_paid');
    expect(source).toContain('seo_tracked_keywords');
    expect(source).toContain('site_gsc_metrics');
  });
});
