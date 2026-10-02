-- QUOTE-E2E-05 — durable public quote request dedupe.
--
-- Fingerprints are generated server-side from normalized request content plus
-- a short time bucket. Only customer-request quotes participate.

alter table public.sales_documents
  add column if not exists quote_request_fingerprint text;

create unique index if not exists sales_documents_quote_request_fingerprint_uidx
  on public.sales_documents (quote_request_fingerprint)
  where document_type = 'quote'
    and source = 'customer_request'
    and quote_request_fingerprint is not null;

comment on column public.sales_documents.quote_request_fingerprint is
  'QUOTE-E2E-05: server-generated short-window idempotency fingerprint for public quote requests.';
