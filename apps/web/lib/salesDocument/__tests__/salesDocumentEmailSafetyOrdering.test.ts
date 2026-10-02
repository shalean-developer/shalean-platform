import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

describe("QUOTE-E2E-04 sales document email safety and send ordering", () => {
  it("routes customer delivery through safeResendSend only", () => {
    const src = readFileSync(
      join(root, "lib/salesDocument/sendSalesDocumentEmail.ts"),
      "utf8",
    );

    expect(src).toContain("safeResendSend");
    expect(src).not.toContain("getResend");
    expect(src).not.toContain("resend.emails.send");
    expect(src).toContain('messageType: params.documentType === "quote" ? "sales_quote" : "sales_invoice"');
  });

  it("prepares Zoho before email and marks Zoho sent only after Shalean sent state", () => {
    const src = readFileSync(
      join(root, "lib/salesDocument/sendSalesDocumentToCustomer.ts"),
      "utf8",
    );

    const prepare = src.indexOf("const zohoPrepared = await syncSalesDocumentToZoho");
    const mail = src.indexOf("sendSalesDocumentEmail", prepare);
    const persist = src.indexOf('.update({ status: nextStatus, sent_at: nowIso })', mail);
    const reconcile = src.indexOf("const zohoSent = await syncSalesDocumentToZoho", persist);

    expect(prepare).toBeGreaterThanOrEqual(0);
    expect(mail).toBeGreaterThan(prepare);
    expect(persist).toBeGreaterThan(mail);
    expect(reconcile).toBeGreaterThan(persist);
    expect(src).toContain("markSent: false");
    expect(src).toContain("markSent: true");
  });

  it("dedupes delivery retries using the prior sent_at generation", () => {
    const src = readFileSync(
      join(root, "lib/salesDocument/sendSalesDocumentToCustomer.ts"),
      "utf8",
    );

    expect(src).toContain("tryClaimNotificationIdempotency");
    expect(src).toContain("releaseNotificationIdempotencyClaim");
    expect(src).toContain('row.sent_at ?? "initial"');
    expect(src).toContain("sales_document_email_idempotent_replay");
  });

  it("releases the delivery claim when the email provider fails", () => {
    const src = readFileSync(
      join(root, "lib/salesDocument/sendSalesDocumentToCustomer.ts"),
      "utf8",
    );

    const mailFailure = src.indexOf("if (!mail.sent)");
    const release = src.indexOf("releaseNotificationIdempotencyClaim", mailFailure);
    const failureReturn = src.indexOf('return { ok: false, error: mail.error ?? "email_failed" }', release);

    expect(mailFailure).toBeGreaterThanOrEqual(0);
    expect(release).toBeGreaterThan(mailFailure);
    expect(failureReturn).toBeGreaterThan(release);
  });

  it("never marks Zoho sent before customer delivery", () => {
    const src = readFileSync(
      join(root, "lib/salesDocument/sendSalesDocumentToCustomer.ts"),
      "utf8",
    );

    const prepareCall = src.indexOf("const zohoPrepared");
    const prepareBlock = src.slice(prepareCall, src.indexOf("const deliveryClaim", prepareCall));
    expect(prepareBlock).toContain("markSent: false");
    expect(prepareBlock).not.toContain("markSent: true");
  });

  it("surfaces non-benign Zoho sent reconciliation errors", () => {
    const src = readFileSync(
      join(root, "lib/salesDocument/syncSalesDocumentToZoho.ts"),
      "utf8",
    );

    expect(src).toContain("isBenignZohoAlreadySentError");
    expect(src).toContain("mark_estimate_sent_failed:");
    expect(src).toContain("mark_invoice_sent_failed:");
  });

  it("blocks resend of accepted quotes at the service layer", () => {
    const src = readFileSync(
      join(root, "lib/salesDocument/sendSalesDocumentToCustomer.ts"),
      "utf8",
    );

    expect(src).toContain('row.document_type === "quote" && row.status === "accepted"');
    expect(src).toContain('"accepted_quote_is_immutable"');
  });
});
