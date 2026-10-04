import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

describe("QUOTE-E2E-07 sales follow-up lifecycle", () => {
  it("schedules an initial follow-up for new website quote requests", () => {
    const src = readFileSync(
      join(root, "lib/salesDocument/createCustomerQuoteRequest.ts"),
      "utf8",
    );
    expect(src).toContain("crm_next_follow_up_at");
    expect(src).toContain("24 * 60 * 60_000");
  });

  it("moves sent quotes into follow_up and accepted quotes into won", () => {
    const send = readFileSync(
      join(root, "lib/salesDocument/sendSalesDocumentToCustomer.ts"),
      "utf8",
    );
    const mutations = readFileSync(
      join(root, "lib/salesDocument/salesDocumentMutations.ts"),
      "utf8",
    );
    const accept = readFileSync(
      join(root, "lib/salesDocument/acceptSalesQuote.ts"),
      "utf8",
    );

    expect(send).toContain('markQuoteOpportunityFollowUp(admin, row.id, "quote_sent")');
    expect(mutations).toContain('markQuoteOpportunityWon(admin, quoteId, "quote_accepted")');
    expect(accept).toContain('markQuoteOpportunityWon(admin, quoteId, "quote_accepted")');
  });

  it("converges customer views into follow_up without outbound messaging", () => {
    const sql = readFileSync(
      join(root, "../../supabase/migrations/20261002141000_quote_e2e_07_follow_up_lifecycle.sql"),
      "utf8",
    );

    expect(sql).toContain("create or replace function public.record_sales_document_view");
    expect(sql).toContain("crm_stage = 'follow_up'");
    expect(sql).toContain("now() + interval '24 hours'");
    expect(sql).not.toContain("sendSalesDocumentEmail");
  });

  it("backfills missing CRM stages and follow-up tasks", () => {
    const sql = readFileSync(
      join(root, "../../supabase/migrations/20261002141000_quote_e2e_07_follow_up_lifecycle.sql"),
      "utf8",
    );

    expect(sql).toContain("and crm_stage is null");
    expect(sql).toContain("status = 'requested'");
    expect(sql).toContain("status = 'sent'");
    expect(sql).toContain("interval '48 hours'");
  });

  it("classifies stale requests, unopened quotes, viewed-no-response and overdue follow-ups", () => {
    const src = readFileSync(
      join(root, "lib/salesDocument/loadSalesFollowUpQueue.ts"),
      "utf8",
    );

    expect(src).toContain('"stale_request"');
    expect(src).toContain('"sent_unviewed"');
    expect(src).toContain('"viewed_no_response"');
    expect(src).toContain('"overdue_follow_up"');
  });

  it("renders a read-only operational queue with no automatic customer outreach", () => {
    const page = readFileSync(
      join(root, "app/(ui-redesign)/office/sales-documents/page.tsx"),
      "utf8",
    );

    expect(page).toContain("Sales follow-up queue");
    expect(page).toContain("Shalean does not automatically email, WhatsApp or SMS these customers.");
    expect(page).toContain("Open &amp; follow up");
  });

  it("expires quotes only through an explicit confirmed admin action", () => {
    const route = readFileSync(
      join(root, "app/api/admin/sales-documents/[id]/expire/route.ts"),
      "utf8",
    );
    const service = readFileSync(
      join(root, "lib/salesDocument/expireSalesQuote.ts"),
      "utf8",
    );
    const page = readFileSync(
      join(root, "app/(ui-redesign)/office/sales-documents/[id]/page.tsx"),
      "utf8",
    );

    expect(route).toContain('"EXPIRE_QUOTE"');
    expect(service).toContain('status: "expired"');
    expect(service).toContain('crm_stage: "lost"');
    expect(service).toContain("customer_email_sent: false");
    expect(page).toContain("Expire quote");
    expect(page).toContain("No customer email will be sent.");
  });
});
