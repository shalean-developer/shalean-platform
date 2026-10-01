-- OFFICE-INVOICES-04B — unified invoice registry.
--
-- One scalable service-role registry across:
--   - monthly invoices
--   - paid per-booking invoices
--   - sales-document invoices
--   - quotes (visible as a distinct document type, excluded from invoice-money KPIs)
--
-- No financial mutation or customer messaging.

create or replace function public.admin_invoice_registry_v1(
  p_kind text default 'all',
  p_status text default 'all',
  p_search text default '',
  p_page integer default 1,
  p_page_size integer default 50
)
returns jsonb
language sql
stable
security definer
set search_path = public, auth
as $$
with
runtime as (
  select
    lower(trim(coalesce(p_kind, 'all'))) as kind_filter,
    lower(trim(coalesce(p_status, 'all'))) as status_filter,
    lower(trim(coalesce(p_search, ''))) as search_q,
    greatest(1, coalesce(p_page, 1))::int as requested_page,
    greatest(10, least(100, coalesce(p_page_size, 50)))::int as page_size,
    (now() at time zone 'Africa/Johannesburg')::date as today_jhb
),
monthly_event_stats as (
  select
    e.invoice_id,
    array_agg(e.kind order by e.created_at) filter (
      where e.kind in (
        'payment_received',
        'payment_applied',
        'admin_mark_paid',
        'admin_revert_to_draft',
        'cleaning_credit_applied',
        'cleaning_credit_settled'
      )
    ) as payment_event_kinds
  from public.monthly_invoice_events e
  group by e.invoice_id
),
monthly_docs as (
  select
    'monthly_invoice'::text as kind,
    mi.id as entity_id,
    ('monthly_invoice:' || mi.id::text) as registry_id,
    'monthly'::text as origin,
    coalesce(nullif(trim(mi.zoho_invoice_number), ''), 'MI-' || upper(left(mi.id::text, 8))) as reference,
    coalesce(nullif(trim(up.full_name), ''), 'Customer') as customer_name,
    coalesce(nullif(trim(up.billing_email), ''), '') as customer_email,
    greatest(0, coalesce(mi.total_amount_cents, 0))::bigint as amount_cents,
    greatest(0, coalesce(mi.amount_paid_cents, 0))::bigint as amount_paid_cents,
    greatest(0, coalesce(mi.balance_cents, mi.total_amount_cents - mi.amount_paid_cents, 0))::bigint as balance_cents,
    lower(coalesce(mi.status, 'draft')) as status,
    coalesce(mi.is_closed, false) as is_closed,
    case
      when lower(coalesce(mi.status, '')) in ('paid','refunded')
        or coalesce(mi.balance_cents, 0) <= 0
      then false
      when nullif(left(coalesce(mi.due_date::text, ''), 10), '') is not null
        and to_date(left(mi.due_date::text, 10), 'YYYY-MM-DD') + 5 < r.today_jhb
      then true
      else false
    end as is_overdue,
    mi.created_at as sort_at,
    mi.created_at as created_at,
    nullif(left(coalesce(mi.due_date::text, ''), 10), '') as due_date,
    coalesce(mi.view_count, 0)::int as view_count,
    mi.first_viewed_at,
    mi.zoho_invoice_id is not null as zoho_linked,
    mi.zoho_invoice_id as zoho_id,
    mi.zoho_invoice_number as zoho_number,
    ais.invoice_status as zoho_status,
    ais.outstanding_balance_cents as zoho_balance_cents,
    '/office/invoices/' || mi.id::text as href,
    case when mi.zoho_invoice_id is not null
      then '/api/admin/invoices/' || mi.id::text || '/pdf'
      else null
    end as pdf_href,
    case
      when lower(coalesce(mi.status, '')) = 'paid'
        and coalesce(mi.total_amount_cents, 0) = 0
      then 'Zero-value closure'
      when coalesce(me.payment_event_kinds, array[]::text[]) @> array['payment_received']::text[]
        or exists (
          select 1
          from public.payment_transactions pt
          where pt.entity_type = 'monthly_invoice'
            and pt.entity_id = mi.id
            and lower(coalesce(pt.gateway, '')) = 'paystack'
        )
      then 'Paystack'
      when coalesce(me.payment_event_kinds, array[]::text[]) @> array['admin_mark_paid']::text[]
        and not (
          array_position(coalesce(me.payment_event_kinds, array[]::text[]), 'admin_revert_to_draft') is not null
          and array_position(coalesce(me.payment_event_kinds, array[]::text[]), 'admin_revert_to_draft')
            > array_position(coalesce(me.payment_event_kinds, array[]::text[]), 'admin_mark_paid')
        )
      then 'Manual / EFT'
      when lower(coalesce(mi.status, '')) = 'paid' then 'Unknown'
      else 'Not paid'
    end as payment_source,
    false as is_quote,
    true as is_invoice,
    case
      when mi.zoho_invoice_id is not null then false
      when greatest(0, coalesce(mi.total_amount_cents, 0)) <= 0 then false
      when lower(coalesce(mi.status, '')) = 'draft' then false
      else true
    end as sync_eligible,
    case
      when mi.zoho_invoice_id is not null then null
      when greatest(0, coalesce(mi.total_amount_cents, 0)) <= 0 then 'No billable amount'
      when lower(coalesce(mi.status, '')) = 'draft' then 'Monthly invoice not finalized'
      else null
    end as sync_hold_reason,
    mi.month as period_label
  from public.monthly_invoices mi
  cross join runtime r
  left join public.user_profiles up on up.id = mi.customer_id
  left join monthly_event_stats me on me.invoice_id = mi.id
  left join public.accounting_invoice_sync ais
    on ais.entity_type = 'monthly_invoice'
   and ais.entity_id = mi.id
),
booking_docs as (
  select
    'booking_invoice'::text as kind,
    b.id as entity_id,
    ('booking_invoice:' || b.id::text) as registry_id,
    coalesce(nullif(lower(trim(b.booking_source)), ''), 'website') as origin,
    coalesce(nullif(trim(b.zoho_invoice_number), ''), 'BK-' || upper(left(b.id::text, 8))) as reference,
    coalesce(nullif(trim(b.customer_name), ''), 'Customer') as customer_name,
    coalesce(nullif(trim(b.customer_email), ''), '') as customer_email,
    greatest(
      0,
      coalesce(
        nullif(b.amount_paid_cents, 0),
        round(coalesce(b.total_paid_zar, 0) * 100)::bigint,
        round(coalesce(b.total_price, 0) * 100)::bigint,
        0
      )
    )::bigint as amount_cents,
    greatest(
      0,
      coalesce(
        nullif(b.amount_paid_cents, 0),
        round(coalesce(b.total_paid_zar, 0) * 100)::bigint,
        0
      )
    )::bigint as amount_paid_cents,
    0::bigint as balance_cents,
    case
      when lower(coalesce(b.payment_status, '')) = 'success' then 'paid'
      else lower(coalesce(b.payment_status, b.status, 'paid'))
    end as status,
    true as is_closed,
    false as is_overdue,
    coalesce(b.payment_completed_at, b.created_at) as sort_at,
    b.created_at,
    b.date::text as due_date,
    0::int as view_count,
    null::timestamptz as first_viewed_at,
    b.zoho_invoice_id is not null as zoho_linked,
    b.zoho_invoice_id as zoho_id,
    b.zoho_invoice_number as zoho_number,
    ais.invoice_status as zoho_status,
    ais.outstanding_balance_cents as zoho_balance_cents,
    '/office/bookings/' || b.id::text as href,
    case when b.zoho_invoice_id is not null
      then '/api/admin/bookings/' || b.id::text || '/invoice-pdf'
      else null
    end as pdf_href,
    case
      when b.paystack_reference is not null then 'Paystack'
      when lower(coalesce(b.payment_method, '')) = 'eft' then 'Manual / EFT'
      when lower(coalesce(b.payment_method, '')) = 'cash' then 'Cash'
      when lower(coalesce(b.payment_method, '')) = 'zoho' then 'Zoho'
      when lower(coalesce(b.payment_method, '')) = 'card' then 'Card'
      else 'Unknown'
    end as payment_source,
    false as is_quote,
    true as is_invoice,
    case
      when b.zoho_invoice_id is not null then false
      when coalesce(b.is_test, false) then false
      when lower(coalesce(b.status, '')) = 'cancelled' then false
      else true
    end as sync_eligible,
    case
      when b.zoho_invoice_id is not null then null
      when coalesce(b.is_test, false) then 'Test booking'
      when lower(coalesce(b.status, '')) = 'cancelled' then 'Cancelled'
      else null
    end as sync_hold_reason,
    left(coalesce(b.date::text, ''), 7) as period_label
  from public.bookings b
  left join public.accounting_invoice_sync ais
    on ais.entity_type = 'booking'
   and ais.entity_id = b.id
  where
    coalesce(b.is_test, false) = false
    and coalesce(b.is_monthly_billing_booking, false) = false
    and b.monthly_invoice_id is null
    and b.sales_document_id is null
    and (
      b.payment_completed_at is not null
      or b.zoho_invoice_id is not null
    )
),
sales_docs as (
  select
    case when lower(coalesce(sd.document_type, '')) = 'quote'
      then 'quote' else 'sales_invoice' end as kind,
    sd.id as entity_id,
    (
      case when lower(coalesce(sd.document_type, '')) = 'quote'
        then 'quote:' else 'sales_invoice:' end
      || sd.id::text
    ) as registry_id,
    case
      when sd.source = 'customer_request' then 'website'
      else coalesce(nullif(lower(trim(sd.source)), ''), 'admin')
    end as origin,
    case
      when lower(coalesce(sd.document_type, '')) = 'quote'
      then coalesce(nullif(trim(sd.zoho_estimate_number), ''), 'QT-' || upper(left(sd.id::text, 8)))
      else coalesce(nullif(trim(sd.zoho_invoice_number), ''), 'SD-' || upper(left(sd.id::text, 8)))
    end as reference,
    coalesce(nullif(trim(sd.customer_name), ''), 'Customer') as customer_name,
    coalesce(nullif(trim(sd.customer_email), ''), '') as customer_email,
    greatest(0, coalesce(sd.total_cents, 0))::bigint as amount_cents,
    greatest(0, coalesce(sd.amount_paid_cents, 0))::bigint as amount_paid_cents,
    greatest(0, coalesce(sd.balance_cents, sd.total_cents - sd.amount_paid_cents, 0))::bigint as balance_cents,
    lower(coalesce(sd.status, 'draft')) as status,
    lower(coalesce(sd.status, '')) in ('paid','refunded','void','expired') as is_closed,
    case
      when lower(coalesce(sd.document_type, '')) = 'quote' then false
      when lower(coalesce(sd.status, '')) in ('paid','refunded','void') then false
      when coalesce(sd.balance_cents, 0) <= 0 then false
      when sd.due_date is not null and sd.due_date::date < r.today_jhb then true
      else false
    end as is_overdue,
    sd.created_at as sort_at,
    sd.created_at,
    sd.due_date::text as due_date,
    coalesce(sd.view_count, 0)::int as view_count,
    sd.first_viewed_at,
    case
      when lower(coalesce(sd.document_type, '')) = 'quote'
      then sd.zoho_estimate_id is not null
      else sd.zoho_invoice_id is not null
    end as zoho_linked,
    case
      when lower(coalesce(sd.document_type, '')) = 'quote'
      then sd.zoho_estimate_id
      else sd.zoho_invoice_id
    end as zoho_id,
    case
      when lower(coalesce(sd.document_type, '')) = 'quote'
      then sd.zoho_estimate_number
      else sd.zoho_invoice_number
    end as zoho_number,
    ais.invoice_status as zoho_status,
    ais.outstanding_balance_cents as zoho_balance_cents,
    '/office/sales-documents/' || sd.id::text as href,
    case
      when lower(coalesce(sd.document_type, '')) = 'quote' and sd.zoho_estimate_id is not null
      then '/api/admin/sales-documents/' || sd.id::text || '/pdf'
      when lower(coalesce(sd.document_type, '')) <> 'quote' and sd.zoho_invoice_id is not null
      then '/api/admin/sales-documents/' || sd.id::text || '/pdf'
      else null
    end as pdf_href,
    case
      when coalesce(sd.amount_paid_cents, 0) <= 0 then 'Not paid'
      when sd.paystack_reference is not null then 'Paystack'
      else 'Manual / EFT'
    end as payment_source,
    lower(coalesce(sd.document_type, '')) = 'quote' as is_quote,
    lower(coalesce(sd.document_type, '')) <> 'quote' as is_invoice,
    case
      when lower(coalesce(sd.document_type, '')) = 'quote'
        and sd.zoho_estimate_id is null
        and coalesce(sd.total_cents, 0) > 0
        and lower(coalesce(sd.status, '')) <> 'requested'
      then true
      when lower(coalesce(sd.document_type, '')) <> 'quote'
        and sd.zoho_invoice_id is null
        and coalesce(sd.total_cents, 0) > 0
        and lower(coalesce(sd.status, '')) <> 'requested'
      then true
      else false
    end as sync_eligible,
    case
      when coalesce(sd.total_cents, 0) <= 0 then 'No billable amount'
      when lower(coalesce(sd.status, '')) = 'requested' then 'Awaiting quote preparation'
      else null
    end as sync_hold_reason,
    left(sd.created_at::date::text, 7) as period_label
  from public.sales_documents sd
  cross join runtime r
  left join public.accounting_invoice_sync ais
    on ais.entity_type = 'sales_document'
   and ais.entity_id = sd.id
),
all_docs as (
  select * from monthly_docs
  union all
  select * from booking_docs
  union all
  select * from sales_docs
),
filtered as (
  select d.*
  from all_docs d
  cross join runtime r
  where
    (
      r.kind_filter = 'all'
      or (r.kind_filter = 'invoices' and d.is_invoice)
      or r.kind_filter = d.kind
    )
    and (
      r.status_filter = 'all'
      or (r.status_filter = 'paid' and d.status = 'paid')
      or (r.status_filter = 'unpaid' and d.is_invoice and d.balance_cents > 0 and d.status <> 'paid')
      or (r.status_filter = 'draft' and d.status in ('draft','requested'))
      or (r.status_filter = 'sent' and d.status in ('sent','accepted'))
      or (r.status_filter = 'overdue' and d.is_overdue)
      or (r.status_filter = 'missing_zoho' and not d.zoho_linked and d.sync_eligible)
    )
    and (
      r.search_q = ''
      or lower(d.reference) like '%' || r.search_q || '%'
      or lower(d.entity_id::text) like '%' || r.search_q || '%'
      or lower(d.customer_name) like '%' || r.search_q || '%'
      or lower(d.customer_email) like '%' || r.search_q || '%'
      or lower(d.kind) like '%' || r.search_q || '%'
      or lower(d.origin) like '%' || r.search_q || '%'
      or lower(coalesce(d.zoho_number, '')) like '%' || r.search_q || '%'
    )
),
totals as (
  select
    count(*)::int as total_documents,
    count(*) filter (where is_invoice)::int as invoice_count,
    count(*) filter (where is_quote)::int as quote_count,
    count(*) filter (where is_invoice and status = 'paid')::int as paid_count,
    count(*) filter (where is_invoice and is_overdue)::int as overdue_count,
    count(*) filter (where zoho_linked)::int as zoho_linked_count,
    count(*) filter (where not zoho_linked and sync_eligible)::int as missing_zoho_count,
    coalesce(sum(balance_cents) filter (
      where is_invoice and status not in ('paid','refunded','void')
    ), 0)::bigint as outstanding_cents,
    coalesce(sum(amount_cents) filter (where is_invoice), 0)::bigint as invoiced_cents
  from filtered
),
kind_counts as (
  select coalesce(jsonb_object_agg(kind, cnt), '{}'::jsonb) as by_kind
  from (
    select kind, count(*)::int as cnt
    from filtered
    group by kind
  ) x
),
page_meta as (
  select
    t.*,
    k.by_kind,
    r.page_size,
    least(
      r.requested_page,
      greatest(1, ceil(t.total_documents::numeric / r.page_size)::int)
    ) as resolved_page,
    greatest(1, ceil(t.total_documents::numeric / r.page_size)::int) as total_pages
  from totals t
  cross join kind_counts k
  cross join runtime r
),
paged as (
  select d.*
  from filtered d
  cross join page_meta pm
  order by d.sort_at desc, d.registry_id desc
  offset ((pm.resolved_page - 1) * pm.page_size)
  limit (select page_size from page_meta)
),
rows_json as (
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'registry_id', p.registry_id,
        'entity_id', p.entity_id,
        'kind', p.kind,
        'origin', p.origin,
        'reference', p.reference,
        'customer_name', p.customer_name,
        'customer_email', p.customer_email,
        'amount_cents', p.amount_cents,
        'amount_paid_cents', p.amount_paid_cents,
        'balance_cents', p.balance_cents,
        'status', p.status,
        'is_closed', p.is_closed,
        'is_overdue', p.is_overdue,
        'created_at', p.created_at,
        'due_date', p.due_date,
        'view_count', p.view_count,
        'first_viewed_at', p.first_viewed_at,
        'zoho_linked', p.zoho_linked,
        'zoho_id', p.zoho_id,
        'zoho_number', p.zoho_number,
        'zoho_status', p.zoho_status,
        'zoho_balance_cents', p.zoho_balance_cents,
        'href', p.href,
        'pdf_href', p.pdf_href,
        'payment_source', p.payment_source,
        'is_quote', p.is_quote,
        'is_invoice', p.is_invoice,
        'sync_eligible', p.sync_eligible,
        'sync_hold_reason', p.sync_hold_reason,
        'period_label', p.period_label
      )
      order by p.sort_at desc, p.registry_id desc
    ),
    '[]'::jsonb
  ) as rows
  from paged p
)
select jsonb_build_object(
  'rows', rj.rows,
  'summary', jsonb_build_object(
    'total_documents', pm.total_documents,
    'invoice_count', pm.invoice_count,
    'quote_count', pm.quote_count,
    'paid_count', pm.paid_count,
    'overdue_count', pm.overdue_count,
    'zoho_linked_count', pm.zoho_linked_count,
    'missing_zoho_count', pm.missing_zoho_count,
    'outstanding_cents', pm.outstanding_cents,
    'invoiced_cents', pm.invoiced_cents,
    'by_kind', pm.by_kind
  ),
  'pagination', jsonb_build_object(
    'page', pm.resolved_page,
    'page_size', pm.page_size,
    'total_filtered', pm.total_documents,
    'total_pages', pm.total_pages,
    'from', case
      when pm.total_documents = 0 then 0
      else ((pm.resolved_page - 1) * pm.page_size) + 1
    end,
    'to', least(pm.total_documents, pm.resolved_page * pm.page_size),
    'has_next_page', pm.resolved_page < pm.total_pages,
    'has_previous_page', pm.resolved_page > 1
  )
)
from page_meta pm
cross join rows_json rj;
$$;

revoke all on function public.admin_invoice_registry_v1(
  text, text, text, integer, integer
) from public, anon, authenticated;

grant execute on function public.admin_invoice_registry_v1(
  text, text, text, integer, integer
) to service_role;

comment on function public.admin_invoice_registry_v1(
  text, text, text, integer, integer
) is
  'Unified service-role invoice/document registry across monthly invoices, paid booking invoices, sales invoices and quotes.';
