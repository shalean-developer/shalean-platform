import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("AUDIT-02A03 staging-only repair verifier", () => {
  const src = readFileSync(
    join(process.cwd(), "app/api/test/a02-03-line-item-repair/route.ts"),
    "utf8",
  );

  it("is unavailable outside staging and uses the hardened production-route guard", () => {
    expect(src).toContain("isProductionTestRouteBlocked(request.url)");
    expect(src).toContain('resolveDeploymentEnvironment() !== "staging"');
    expect(src).toContain('{ status: 404 }');
  });

  it("fails closed unless the configured Supabase ref matches canonical staging", () => {
    expect(src).toContain("supabaseRefFromUrl");
    expect(src).toContain("expectedSupabaseRefForDeployment");
    expect(src).toContain('deployment === "staging"');
    expect(src).toContain("configuredSupabaseRef === expectedSupabaseRef");
    expect(src).toContain("Staging database identity mismatch.");
  });

  it("requires a timing-safe verifier secret before accepting a fixture id", () => {
    expect(src).toContain("DISPATCH_LOAD_TEST_SECRET");
    expect(src).toContain("timingSafeEqualString(provided, secret)");
    expect(src).toContain('{ status: 401 }');
  });

  it("provides governed staging-only fixture creation for both audit variants", () => {
    expect(src).toContain("export async function PUT(request: Request)");
    expect(src).toContain('body.variant === "discounted" || body.variant === "zero_placeholder"');
    expect(src).toContain('source: "audit_a02_03_fixture"');
    expect(src).toContain('booking_source: "audit_a02_03_fixture"');
    expect(src).toContain('payment_status: discounted ? "success" : "pending_monthly"');
    expect(src).toContain('payment_completed_at: new Date().toISOString()');
    expect(src).toContain("is_test: true");
    expect(src).toContain("lineItemsPricing: null");
    expect(src).toContain("initialLineCount: 0");
  });

  it("requires a true missing-ledger fixture before claiming repair", () => {
    expect(src).toContain('.from("booking_line_items")');
    expect(src).toContain('.select("id", { count: "exact", head: true })');
    expect(src).toContain('(existingLineCount ?? 0) !== 0');
    expect(src).toContain("Fixture must start with zero line items.");
  });

  it("accepts only fresh dedicated test fixtures and never performs stale takeover", () => {
    expect(src).toContain("booking.is_test !== true");
    expect(src).toContain('const source = String(booking.booking_source ?? "")');
    expect(src).toContain('source !== "audit_a02_03_fixture"');
    expect(src).toContain("create a fresh fixture");
    expect(src).not.toContain("staleRepairing");
  });

  it("claims fixtures in the database before invoking the real repair helper", () => {
    expect(src).toContain('booking_source: "audit_a02_03_fixture_repairing"');
    expect(src).toContain('.eq("booking_source", "audit_a02_03_fixture")');
    expect(src).toContain('select("id, updated_at")');
    expect(src).toContain("leaseUpdatedAt");
    expect(src).toContain("Fixture repair lease token missing.");
    expect(src).toContain('{ status: 409 }');
    expect(src).toContain("ensureBookingLineItemsForEarningsIfMissing(admin, bookingId)");
  });

  it("rejects unreconciled or vacuous ledger evidence before finalizing the fixture", () => {
    expect(src).toContain("expectedPayableCents");
    expect(src).toContain("expectedCleanerCents");
    expect(src).toContain("expectedCleanerCents > 0");
    expect(src).toContain("hasPositiveCleanerLine");
    expect(src).toContain("validCleanerEvidence");
    expect(src).toContain("lineTotalCents !== expectedPayableCents");
    expect(src).toContain("cleanerLineCents !== expectedCleanerCents");
    expect(src).toContain('booking_source: "audit_a02_03_fixture_failed"');
    expect(src).toContain("Repaired ledger did not reconcile.");
  });

  it("confirms the conditional repaired-state transition before returning success", () => {
    expect(src).toContain('booking_source: "audit_a02_03_fixture_repaired"');
    expect(src).toContain('.eq("updated_at", leaseUpdatedAt)');
    expect(src).toContain("finalizeError || !finalized");
    expect(src).toContain("Could not finalize fixture repair state.");
  });
});
