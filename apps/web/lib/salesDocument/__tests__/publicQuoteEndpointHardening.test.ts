import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildCustomerQuoteRequestFingerprint } from "@/lib/salesDocument/customerQuoteRequestFingerprint";
import {
  __resetPublicQuoteAbuseBuckets,
  checkPublicQuoteEmailLimit,
  checkPublicQuoteIpLimit,
} from "@/lib/rateLimit/publicQuoteRequestLimit";

const root = process.cwd();

describe("QUOTE-E2E-05 public quote endpoint hardening", () => {
  it("builds stable fingerprints for equivalent normalized submissions in one window", () => {
    const base = {
      customerName: "  Jane   Doe ",
      customerEmail: "JANE@example.com",
      customerPhone: "+27 82 123 4567",
      propertyType: "house",
      bedrooms: 3,
      bathrooms: 2,
      suburb: " Claremont ",
      preferredDate: "2026-10-20",
      message: "  Please   call first ",
      selectedItems: [
        { kind: "extra" as const, slug: "inside-oven", name: "Inside Oven", quantity: 1 },
        { kind: "service" as const, slug: "standard", name: "Regular Cleaning", quantity: 1 },
      ],
      nowMs: 1_000_000,
    };

    const a = buildCustomerQuoteRequestFingerprint(base);
    const b = buildCustomerQuoteRequestFingerprint({
      ...base,
      customerName: "jane doe",
      customerEmail: "jane@example.com",
      suburb: "claremont",
      message: "please call first",
      selectedItems: [...base.selectedItems].reverse(),
    });

    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it("changes fingerprint outside the dedupe window", () => {
    const input = {
      customerName: "Jane Doe",
      customerEmail: "jane@example.com",
      customerPhone: "0821234567",
      propertyType: "house",
      bedrooms: 3,
      bathrooms: 2,
      suburb: "Claremont",
      preferredDate: null,
      message: null,
      selectedItems: [
        { kind: "service" as const, slug: "standard", name: "Regular Cleaning", quantity: 1 },
      ],
    };
    const a = buildCustomerQuoteRequestFingerprint({ ...input, nowMs: 0 });
    const b = buildCustomerQuoteRequestFingerprint({ ...input, nowMs: 11 * 60_000 });
    expect(a).not.toBe(b);
  });

  it("rate limits repeated public requests by IP and email", () => {
    __resetPublicQuoteAbuseBuckets();
    const request = new Request("https://shalean.co.za/api/public/quote-request", {
      headers: { "x-forwarded-for": "203.0.113.10" },
    });

    for (let i = 0; i < 12; i += 1) {
      expect(checkPublicQuoteIpLimit(request).allowed).toBe(true);
    }
    expect(checkPublicQuoteIpLimit(request).allowed).toBe(false);

    __resetPublicQuoteAbuseBuckets();
    for (let i = 0; i < 4; i += 1) {
      expect(checkPublicQuoteEmailLimit("same@example.com").allowed).toBe(true);
    }
    expect(checkPublicQuoteEmailLimit("same@example.com").allowed).toBe(false);
  });

  it("enforces a database unique fingerprint for customer-request quotes", () => {
    const sql = readFileSync(
      join(root, "../../supabase/migrations/20261002130000_quote_e2e_05_public_quote_dedupe.sql"),
      "utf8",
    );

    expect(sql).toContain("quote_request_fingerprint text");
    expect(sql).toContain("create unique index if not exists sales_documents_quote_request_fingerprint_uidx");
    expect(sql).toContain("source = 'customer_request'");
  });

  it("dedupes before customer-account and admin-notification side effects", () => {
    const src = readFileSync(
      join(root, "lib/salesDocument/createCustomerQuoteRequest.ts"),
      "utf8",
    );

    const existingLookup = src.indexOf('.eq("quote_request_fingerprint", fingerprint)');
    const customerSideEffect = src.indexOf("ensureCustomerAccount");
    const adminNotification = src.indexOf("notifyAdminCustomerQuoteRequest");

    expect(existingLookup).toBeGreaterThanOrEqual(0);
    expect(customerSideEffect).toBeGreaterThan(existingLookup);
    expect(adminNotification).toBeGreaterThan(existingLookup);
    expect(src).toContain('error?.code === "23505"');
    expect(src).toContain("reused: true");
  });

  it("keeps catalog validation and adds bounded public input checks", () => {
    const route = readFileSync(
      join(root, "app/api/public/quote-request/route.ts"),
      "utf8",
    );

    expect(route).toContain("loadQuotePricingCatalog");
    expect(route).toContain("resolveQuoteRequestSelection");
    expect(route).toContain("MAX_BODY_BYTES");
    expect(route).toContain("MAX_SELECTED_ITEMS");
    expect(route).toContain("checkPublicQuoteIpLimit");
    expect(route).toContain("checkPublicQuoteEmailLimit");
    expect(route).toContain("input_too_long");
    expect(route).toContain("request_too_large");
  });

  it("aligns browser input limits with server bounds", () => {
    const page = readFileSync(
      join(root, "components/quote/QuoteRequestForm.tsx"),
      "utf8",
    );

    expect(page).toContain("maxLength={120}");
    expect(page).toContain("maxLength={254}");
    expect(page).toContain("maxLength={32}");
    expect(page).toContain("maxLength={2000}");
    expect(page).toContain('json.error === "rate_limited"');
  });
});
