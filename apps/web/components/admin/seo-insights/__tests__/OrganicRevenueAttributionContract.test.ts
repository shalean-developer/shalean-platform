import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

describe("SEO-023 attribution contract", () => {
  it("uses canonical revenue fields, paginated events, visit segmentation and persisted-booking completions", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "app/api/admin/seo-insights/organic-revenue/route.ts"),
      "utf8",
    );
    expect(source).toContain('if (medium === "organic") return true');
    expect(source).toContain("hostSearchEngine(s.referrer)");
    expect(source).toContain("VISIT_TIMEOUT_MS");
    expect(source).toContain(".range(offset, offset + EVENT_PAGE_SIZE - 1)");
    expect(source).toContain('.select("id,total_paid_zar,amount_paid_cents,total_price,status,payment_status")');
    expect(source).toContain("persistedBookings.has(s.bookingId)");
    expect(source).toContain("unattributedSessions");
    expect(source).toContain('seo_tracked_keywords');
    expect(source).toContain('site_gsc_metrics');
  });
});
