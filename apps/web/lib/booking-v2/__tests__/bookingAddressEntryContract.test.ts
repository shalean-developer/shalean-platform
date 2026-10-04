import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const bookHubSource = readFileSync(
  join(process.cwd(), "app/(ui-redesign)/book/page.tsx"),
  "utf8",
);
const contextSource = readFileSync(
  join(process.cwd(), "src/features/booking-v2/BookingV2Context.tsx"),
  "utf8",
);

describe("booking address entry navigation", () => {
  it("links Regular Cleaning service selection directly to the referenced address section", () => {
    expect(bookHubSource).toContain('`/book/${slug}?step=details&section=address`');
  });

  it("keeps the active details section represented in the booking URL", () => {
    expect(contextSource).toContain('searchParams.get("section")');
    expect(contextSource).toContain('params.set("section", section)');
    expect(contextSource).toContain('router.replace(`/book/${serviceSlug}?${params.toString()}`)');
    expect(contextSource).toContain('params.set("section", detailsSectionOverride ?? "address")');
  });
});
