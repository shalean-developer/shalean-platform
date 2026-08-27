import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PAYSTACK_CHECKOUT_FINALIZER_ROUTE_FILES } from "@/lib/booking/paystackRouteResponsibilityContract";

function readApiRoute(...segments: string[]): string {
  const candidates = [
    join(process.cwd(), "app", "api", ...segments),
    join(process.cwd(), "apps", "web", "app", "api", ...segments),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return readFileSync(p, "utf8");
  }
  throw new Error(`Missing route file: ${segments.join("/")}`);
}

describe("paystackRouteResponsibilityContract guardrails", () => {
  it("lists checkout finalizer route files that exist and call the finalize gateway", () => {
    for (const rel of PAYSTACK_CHECKOUT_FINALIZER_ROUTE_FILES) {
      const dir = rel.replace(/\/route\.ts$/, "");
      const parts = dir.split("/").filter(Boolean);
      const src = readApiRoute(...parts, "route.ts");
      expect(src.length).toBeGreaterThan(100);
    }

    expect(readApiRoute("paystack", "webhook", "route.ts")).toContain("finalizePaidBooking");
    expect(readApiRoute("paystack", "verify", "route.ts")).toContain("runPaystackVerifyFinalizePipeline");
  });

  it("GET /api/booking/status is a 410 tombstone and cannot call Paystack or Supabase", () => {
    const src = readApiRoute("booking", "status", "route.ts");
    expect(src).toContain("LEGACY_BOOKING_STATUS_RETIRED");
    expect(src).toContain("status: 410");
    expect(src).not.toContain("api.paystack.co");
    expect(src).not.toContain("getSupabaseAdmin");
    expect(src).not.toContain("runPaystackVerifyFinalizePipeline");
  });

  it("POST /api/booking/complete is a 410 tombstone and cannot call Paystack or finalize bookings", () => {
    const src = readApiRoute("booking", "complete", "route.ts");
    expect(src).toContain("LEGACY_BOOKING_COMPLETE_RETIRED");
    expect(src).toContain("status: 410");
    expect(src).not.toContain("api.paystack.co");
    expect(src).not.toContain("getSupabaseAdmin");
    expect(src).not.toContain("runPaystackVerifyFinalizePipeline");
  });

  it("GET /api/paystack/status remains the active read-only status route", () => {
    const src = readApiRoute("paystack", "status", "route.ts");
    expect(src).toContain("findBookingIdStatusForPaystackReference");
    expect(src).not.toContain("runPaystackVerifyFinalizePipeline");
    expect(src).not.toContain("finalizePaidBooking");
  });

  it("POST /api/webhooks/paystack handles transfers only — not charge checkout finalization", () => {
    const src = readApiRoute("webhooks", "paystack", "route.ts");
    expect(src).toContain("transfer.success");
    expect(src).not.toContain("finalizePaidBooking");
    expect(src).not.toContain("runPaystackVerifyFinalizePipeline");
    expect(src).not.toMatch(/event\.event\s*===\s*["']charge\.success["']/);
  });

  it("contract module exports remain stable", () => {
    expect(PAYSTACK_CHECKOUT_FINALIZER_ROUTE_FILES).toContain("paystack/webhook/route.ts");
    expect(PAYSTACK_CHECKOUT_FINALIZER_ROUTE_FILES).toContain("paystack/verify/route.ts");
  });
});
