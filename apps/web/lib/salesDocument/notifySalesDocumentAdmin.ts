import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { sendAdminHtmlEmail } from "@/lib/email/sendBookingEmail";
import { tryClaimNotificationIdempotency } from "@/lib/notifications/notificationIdempotencyClaim";
import { absoluteCanonicalUrl } from "@/lib/site/canonical";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatZarFromCents(cents: number): string {
  const zar = Math.round(cents) / 100;
  return `R ${zar.toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

async function sendSalesDocumentAdminMail(
  admin: SupabaseClient,
  params: {
    reference: string;
    eventType: string;
    subject: string;
    html: string;
    context: Record<string, unknown>;
  },
): Promise<void> {
  if (!process.env.ADMIN_NOTIFICATION_EMAIL?.trim()) return;

  const claimed = await tryClaimNotificationIdempotency(admin, {
    reference: params.reference,
    eventType: params.eventType,
    channel: "email",
  });
  if (!claimed) return;

  await sendAdminHtmlEmail({
    subject: params.subject,
    html: params.html,
    context: { type: params.eventType, ...params.context },
  });
}

/** Notify ops when a customer submits the public /quote form. */
export async function notifyAdminCustomerQuoteRequest(
  admin: SupabaseClient,
  params: {
    documentId: string;
    customerName: string;
    customerEmail: string;
    customerPhone: string;
    requestDetails: {
      service_type?: string;
      property_type: string;
      bedrooms: number | null;
      bathrooms: number | null;
      suburb: string;
      preferred_date: string | null;
      message: string | null;
      selected_items?: Array<{ kind: string; name: string; quantity: number }>;
    };
  },
): Promise<void> {
  const name = params.customerName.trim() || "Customer";
  const email = params.customerEmail.trim();
  const phone = params.customerPhone.trim();
  const docUrl = absoluteCanonicalUrl(`/office/sales-documents/${params.documentId}`);
  const d = params.requestDetails;

  const detailLines = [
    d.selected_items?.length
      ? `Requested: ${d.selected_items.map((i) => escapeHtml(i.name)).join("; ")}`
      : d.service_type
        ? `Service: ${escapeHtml(d.service_type)}`
        : null,
    d.property_type && `Property: ${escapeHtml(d.property_type)}`,
    d.bedrooms != null ? `Bedrooms: ${d.bedrooms}` : null,
    d.bathrooms != null ? `Bathrooms: ${d.bathrooms}` : null,
    d.suburb && `Area: ${escapeHtml(d.suburb)}`,
    d.preferred_date && `Preferred date: ${escapeHtml(d.preferred_date)}`,
    d.message && `Notes: ${escapeHtml(d.message)}`,
  ]
    .filter(Boolean)
    .map((line) => `<li>${line}</li>`)
    .join("");

  const html = `
    <p>A customer submitted a quote request from the website.</p>
    <p><strong>Customer:</strong> ${escapeHtml(name)} (${escapeHtml(email)})<br/>
    <strong>Phone:</strong> ${escapeHtml(phone)}</p>
    <ul>${detailLines}</ul>
    <p><a href="${docUrl}">Review in Office → send quote</a></p>
  `;

  await sendSalesDocumentAdminMail(admin, {
    reference: `customer_quote_request:${params.documentId}`,
    eventType: "customer_quote_request",
    subject: `New quote request — ${name} — ${d.suburb}`,
    html,
    context: {
      documentId: params.documentId,
      customerEmail: email,
      suburb: d.suburb,
    },
  });
}

/** Notify ops when a customer accepts a quote (invoice is created automatically). */
export async function notifyAdminSalesQuoteAccepted(
  admin: SupabaseClient,
  params: {
    quoteId: string;
    invoiceId: string;
    customerName: string;
    customerEmail: string;
    totalCents: number;
  },
): Promise<void> {
  const name = params.customerName.trim() || "Customer";
  const email = params.customerEmail.trim();
  const amount = formatZarFromCents(params.totalCents);
  const quoteUrl = absoluteCanonicalUrl(`/office/sales-documents/${params.quoteId}`);
  const invoiceUrl = absoluteCanonicalUrl(`/office/sales-documents/${params.invoiceId}`);

  const html = `
    <p>A customer accepted a quote and an invoice was created automatically.</p>
    <p><strong>Customer:</strong> ${escapeHtml(name)}${email ? ` (${escapeHtml(email)})` : ""}</p>
    <p><strong>Amount:</strong> ${escapeHtml(amount)}</p>
    <p><a href="${quoteUrl}">View quote in Office</a> · <a href="${invoiceUrl}">View invoice in Office</a></p>
  `;

  await sendSalesDocumentAdminMail(admin, {
    reference: `sales_quote_accepted:${params.quoteId}`,
    eventType: "sales_quote_accepted",
    subject: `Quote accepted — ${name}`,
    html,
    context: {
      quoteId: params.quoteId,
      invoiceId: params.invoiceId,
      customerEmail: email,
      totalCents: params.totalCents,
    },
  });
}

/** Notify ops when a sales document invoice is paid (Paystack or manual mark-paid). */
export async function notifyAdminSalesDocumentInvoicePaid(
  admin: SupabaseClient,
  params: {
    documentId: string;
    customerName: string;
    customerEmail: string;
    totalCents: number;
    reference: string;
    source: "paystack" | "manual";
  },
): Promise<void> {
  const name = params.customerName.trim() || "Customer";
  const email = params.customerEmail.trim();
  const amount = formatZarFromCents(params.totalCents);
  const docUrl = absoluteCanonicalUrl(`/office/sales-documents/${params.documentId}`);
  const ref = params.reference.trim();
  const sourceLabel = params.source === "manual" ? "Marked paid in Office" : "Paystack";

  const html = `
    <p>A sales invoice was paid (${escapeHtml(sourceLabel)}).</p>
    <p><strong>Customer:</strong> ${escapeHtml(name)}${email ? ` (${escapeHtml(email)})` : ""}</p>
    <p><strong>Amount:</strong> ${escapeHtml(amount)}</p>
    ${ref ? `<p><strong>Reference:</strong> ${escapeHtml(ref)}</p>` : ""}
    <p><a href="${docUrl}">View invoice in Office</a></p>
  `;

  const dedupeRef =
    params.source === "manual"
      ? `sales_invoice_paid_manual:${params.documentId}`
      : `sales_invoice_paid:${ref}`;

  await sendSalesDocumentAdminMail(admin, {
    reference: dedupeRef,
    eventType: "sales_invoice_paid",
    subject: `Invoice paid — ${name} — ${amount}`,
    html,
    context: {
      documentId: params.documentId,
      customerEmail: email,
      totalCents: params.totalCents,
      paymentReference: ref,
      source: params.source,
    },
  });
}
