import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

describe("SALES-BOOKING-CONVERSION-01/01B/01C/01D/01E/01F/01G", () => {
  it("uses quoted total rather than unpaid collected amount for pending-payment bookings", () => {
    const src = readFileSync(
      join(root, "lib/salesDocument/createBookingFromSalesQuoteInvoice.ts"),
      "utf8",
    );

    expect(src).toContain("total_price: quotedTotalZar");
    expect(src).toContain("...(invoicePaid ? { total_paid_zar: collectedTotalZar } : {})");
    expect(src).not.toContain("total_paid_zar: collectedTotalZar,");
  });

  it("re-reads a linked booking after any insert failure before failing conversion", () => {
    const src = readFileSync(
      join(root, "lib/salesDocument/createBookingFromSalesQuoteInvoice.ts"),
      "utf8",
    );

    const failureStart = src.indexOf("if (!ins.ok)");
    const reread = src.indexOf('.eq("sales_document_id", invoiceId)', failureStart);
    const success = src.indexOf("alreadyExisted: true", reread);

    expect(failureStart).toBeGreaterThanOrEqual(0);
    expect(reread).toBeGreaterThan(failureStart);
    expect(success).toBeGreaterThan(reread);
    expect(src.slice(failureStart, reread)).not.toContain('pgCode === "23505"');
    expect(src).toContain("isSalesDocumentLineItemRollbackMarker(racedBooking.metadata)");
  });

  it("serializes conversion ownership before booking and Zoho work", () => {
    const src = readFileSync(
      join(root, "lib/salesDocument/salesDocumentMutations.ts"),
      "utf8",
    );

    const lease = src.indexOf("acquireSalesDocumentConversionLease");
    const booking = src.indexOf("createBookingFromSalesQuoteInvoice", lease);
    const zoho = src.indexOf("syncSalesDocumentToZoho(admin, invoiceId)", booking);
    const acceptance = src.indexOf("acceptQuoteTransition(admin, quoteId)", zoho);

    expect(lease).toBeGreaterThanOrEqual(0);
    expect(booking).toBeGreaterThan(lease);
    expect(zoho).toBeGreaterThan(booking);
    expect(acceptance).toBeGreaterThan(zoho);
    expect(src).toContain("releaseSalesDocumentConversionLease");
  });

  it("uses atomic database compensation instead of application delete", () => {
    const src = readFileSync(
      join(root, "lib/salesDocument/salesDocumentMutations.ts"),
      "utf8",
    );

    expect(src).toContain('admin.rpc("compensate_failed_sales_document_conversion"');
    expect(src).not.toContain("deleteSalesDocument(admin");
    expect(src).toContain("booking_create_failed_invoice_compensation_failed");
  });

  it("re-reads Zoho linkage under the lease and skips already-linked replays", () => {
    const src = readFileSync(
      join(root, "lib/salesDocument/salesDocumentMutations.ts"),
      "utf8",
    );

    expect(src).toContain('.select("id, zoho_invoice_id")');
    expect(src).toContain("const existingZohoInvoiceId");
    expect(src).toContain("if (!existingZohoInvoiceId)");
    expect(src).toContain("Renew immediately before the external call");
  });

  it("gates acceptance delivery on the request that wins the atomic status transition", () => {
    const mutations = readFileSync(
      join(root, "lib/salesDocument/salesDocumentMutations.ts"),
      "utf8",
    );
    const accept = readFileSync(
      join(root, "lib/salesDocument/acceptSalesQuote.ts"),
      "utf8",
    );

    expect(mutations).toContain('.update({ status: "accepted" })');
    expect(mutations).toContain('.select("id")');
    expect(mutations).toContain("acceptedNow: Boolean(data?.id)");
    expect(accept).toContain("if (converted.acceptedNow) {");
    expect(accept).not.toContain("if (!wasAccepted)");
  });

  it("defines a service-role-only conversion lease and token-owned release", () => {
    const sql = readFileSync(
      join(
        root,
        "../../supabase/migrations/20261013043000_sales_booking_conversion_01d_atomic_lease.sql",
      ),
      "utf8",
    );

    expect(sql).toContain("conversion_lease_token uuid");
    expect(sql).toContain("conversion_lease_until timestamptz");
    expect(sql).toContain("claim_sales_document_conversion");
    expect(sql).toContain("conversion_lease_token = p_token");
    expect(sql).toContain("release_sales_document_conversion");
    expect(sql).toContain("grant execute on function public.claim_sales_document_conversion");
    expect(sql).toContain("to service_role");
  });

  it("makes compensation transactional and refuses booking/Zoho/financial state deletion", () => {
    const sql = readFileSync(
      join(
        root,
        "../../supabase/migrations/20261013043000_sales_booking_conversion_01d_atomic_lease.sql",
      ),
      "utf8",
    );

    expect(sql).toContain("for update");
    expect(sql).toContain("conversion_lease_not_owned");
    expect(sql).toContain("linked_booking_exists");
    expect(sql).toContain("zoho_invoice_exists");
    expect(sql).toContain("invoice_financial_state_blocks_compensation");
    expect(sql).toContain("compensate_failed_sales_document_conversion");
  });
  it("requires canonical booking line items before accepting a raced booking", () => {
    const src = readFileSync(
      join(root, "lib/salesDocument/createBookingFromSalesQuoteInvoice.ts"),
      "utf8",
    );

    expect(src).toContain('.from("booking_line_items")');
    expect(src).toContain('.select("total_price_cents")');
    expect(src).toContain("racedLineItemsTotalCents");
    expect(src).toContain("racedLineItemsTotalCents === quotedTotalZar * 100");
  });

  it("reconciles a missing local Zoho link by deterministic reference before create", () => {
    const syncSrc = readFileSync(
      join(root, "lib/salesDocument/syncSalesDocumentToZoho.ts"),
      "utf8",
    );
    const zohoSrc = readFileSync(
      join(root, "lib/zoho/zohoBooksService.ts"),
      "utf8",
    );

    const lookup = syncSrc.indexOf("lookupZohoInvoiceByShaleanIdentity");
    const create = syncSrc.indexOf("createZohoInvoice({", lookup);

    expect(lookup).toBeGreaterThanOrEqual(0);
    expect(create).toBeGreaterThan(lookup);
    expect(syncSrc).toContain('formatZohoOrderReference(row.id, "sales")');
    expect(syncSrc).toContain(".is(\"zoho_invoice_id\", null)");
    expect(zohoSrc).toContain("/invoices?reference_number=");
    expect(zohoSrc).toContain("sameShortReference");
    expect(zohoSrc).toContain("fullIdentityMatches");
    expect(zohoSrc).toContain("if (!notes.includes(trace)) continue");
    expect(zohoSrc).toContain("candidateCustomerId !== contactResult.contactId");
    expect(zohoSrc).toContain('error: "full_identity_customer_conflict"');
    expect(zohoSrc).toContain("candidateTotalCents !== expectedTotalCents");
    expect(zohoSrc).toContain('error: "full_identity_total_conflict"');
    expect(zohoSrc).toContain("fullIdentityMatches.length === 0");
    expect(zohoSrc).toContain('error: "ambiguous_full_identity_match"');
    expect(syncSrc).toContain("zoho_invoice_linked_elsewhere");
    expect(syncSrc).toContain("zoho_reference_refresh");
    expect(syncSrc).toContain("updateZohoInvoice({");
  });
  it("converges CRM Won state and audit activity atomically on replay", () => {
    const lifecycle = readFileSync(
      join(root, "lib/salesDocument/salesOpportunityLifecycle.ts"),
      "utf8",
    );
    const mutations = readFileSync(
      join(root, "lib/salesDocument/salesDocumentMutations.ts"),
      "utf8",
    );
    const sql = readFileSync(
      join(
        root,
        "../../supabase/migrations/20261013063500_sales_booking_conversion_01f_crm_won_atomic.sql",
      ),
      "utf8",
    );

    expect(lifecycle).toContain('admin.rpc("mark_sales_quote_opportunity_won_atomic"');
    expect(mutations).toContain(
      'await markQuoteOpportunityWon(admin, quoteId, "quote_accepted")',
    );
    expect(mutations).not.toContain("if (accepted.acceptedNow) {\n      await markQuoteOpportunityWon");

    expect(sql).toContain("for update");
    expect(sql).toContain("crm_stage = 'won'");
    expect(sql).toContain("crm_won_at = coalesce(crm_won_at, now())");
    expect(sql).toContain("a.metadata->>'to' = 'won'");
    expect(sql).toContain("sales_opportunity_activities");
    expect(sql).toContain("grant execute on function public.mark_sales_quote_opportunity_won_atomic");
    expect(sql).toContain("to service_role");
  });
  it("normalizes Won metadata even when the stage is already won", () => {
    const sql = readFileSync(
      join(
        root,
        "../../supabase/migrations/20261013063500_sales_booking_conversion_01f_crm_won_atomic.sql",
      ),
      "utf8",
    );

    expect(sql).toContain("v_changed := v_previous_stage is distinct from 'won'");
    expect(sql).toContain("crm_stage = 'won'");
    expect(sql).toContain("crm_won_at = coalesce(crm_won_at, now())");
    expect(sql).toContain("crm_lost_at = null");
    expect(sql).toContain("crm_lost_reason = null");
    expect(sql).toContain("crm_next_follow_up_at = null");
    expect(sql).toContain("crm_won_at is null");
    expect(sql).toContain("crm_lost_at is not null");
  });
  it("preserves the full Zoho identity marker on invoice refresh", () => {
    const src = readFileSync(
      join(root, "lib/salesDocument/syncSalesDocumentToZoho.ts"),
      "utf8",
    );

    expect(src).toContain("const invoiceNotes");
    expect(src).toContain("Shalean id:");
    expect(src).toContain("notes: invoiceNotes");
  });

  it("treats unrelated short-reference Zoho collisions as not found", () => {
    const src = readFileSync(
      join(root, "lib/zoho/zohoBooksService.ts"),
      "utf8",
    );

    expect(src).toContain("sameShortReference");
    expect(src).toContain("fullIdentityMatches");
    expect(src).toContain("if (!notes.includes(trace)) continue");
    expect(src).toContain("candidateCustomerId !== contactResult.contactId");
    expect(src).toContain("candidateTotalCents !== expectedTotalCents");
    expect(src).toContain("fullIdentityMatches.length === 0");
    expect(src).toContain('error: "ambiguous_full_identity_match"');
  });

  it("records every real transition back to Won while keeping harmless replay repair idempotent", () => {
    const sql = readFileSync(
      join(
        root,
        "../../supabase/migrations/20261013102000_sales_booking_conversion_01g_crm_won_audit_forward.sql",
      ),
      "utf8",
    );

    expect(sql).toContain("if v_changed");
    expect(sql).toContain("or not exists (");
    expect(sql).toContain("a.metadata->>'to' = 'won'");
    expect(sql).toContain("create or replace function public.mark_sales_quote_opportunity_won_atomic");
  });
  it("recognizes the legacy full UUID Zoho identity marker", () => {
    const src = readFileSync(
      join(root, "lib/zoho/zohoBooksService.ts"),
      "utf8",
    );

    expect(src).toContain("const canonicalTrace");
    expect(src).toContain("const legacyTrace");
    expect(src).toContain("Shalean sales document");
    expect(src).toContain("notes.includes(canonicalTrace) || notes.includes(legacyTrace)");
    expect(src).toContain('error: "ambiguous_full_identity_match"');
  });
});
