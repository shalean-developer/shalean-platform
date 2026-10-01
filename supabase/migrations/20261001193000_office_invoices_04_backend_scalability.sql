-- OFFICE-INVOICES-04 — backend scalability for /office/invoices.
--
-- Moves list search/filtering, KPI summaries, booking/adjustment/event aggregation,
-- and calendar-month pagination into PostgreSQL. The RPC is service-role only.
-- It performs no customer messaging or financial mutation.

create or replace function public.admin_monthly_invoice_list_v1(
  p_status text default 'all',
  p_search text default '',
  p_balance_gt0 boolean default false,
  p_has_discount_lines boolean default false,
  p_has_missed_visit_lines boolean default false,
  p_page integer default 1,
  p_months_per_page integer default 3,
  p_paginate boolean default true
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
    (now() at time zone 'Africa/Johannesburg')::date as today_jhb,
    greatest(1, least(12, coalesce(p_months_per_page, 3)))::int as months_per_page,
    greatest(1, coalesce(p_page, 1))::int as requested_page,
    lower(trim(coalesce(p_status, 'all'))) as status_filter,
    lower(trim(coalesce(p_search, ''))) as search_q
),
booking_stats as (
  select
    b.monthly_invoice_id as invoice_id,
    count(*) filter (where lower(coalesce(b.status, '')) <> 'cancelled')::int as booking_count,
    max(b.date) filter (where lower(coalesce(b.status, '')) <> 'cancelled') as last_visit,
    count(*) filter (
      where lower(coalesce(b.status, '')) not in ('completed', 'cancelled')
    )::int as open_count,
    bool_or(
      lower(coalesce(b.customer_email, '')) <> ''
      and lower(coalesce(b.customer_email, '')) not like '%@walkin.shalean.com'
      and lower(coalesce(b.customer_email, '')) not like '%@cleaner.shalean.com'
    ) as has_real_booking_email
  from public.bookings b
  where b.monthly_invoice_id is not null
  group by b.monthly_invoice_id
),
adjustment_stats as (
  select
    ia.applied_to_invoice_id as invoice_id,
    bool_or(lower(coalesce(ia.category, '')) = 'discount') as has_discount_lines,
    bool_or(lower(coalesce(ia.category, '')) = 'missed_visit') as has_missed_visit_lines
  from public.invoice_adjustments ia
  where ia.applied_to_invoice_id is not null
  group by ia.applied_to_invoice_id
),
event_stats as (
  select
    e.invoice_id,
    max(e.created_at) as last_activity_at,
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
base as (
  select
    mi.id,
    mi.customer_id,
    mi.month,
    lower(coalesce(mi.status, 'draft')) as status,
    greatest(0, coalesce(mi.total_amount_cents, 0))::bigint as total_amount_cents,
    greatest(0, coalesce(mi.amount_paid_cents, 0))::bigint as amount_paid_cents,
    greatest(0, coalesce(mi.balance_cents, mi.total_amount_cents - mi.amount_paid_cents, 0))::bigint as balance_cents,
    coalesce(mi.is_closed, false) as is_closed,
    mi.due_date,
    coalesce(nullif(mi.currency_code, ''), 'ZAR') as currency_code,
    greatest(0, coalesce(mi.view_count, 0))::int as view_count,
    mi.first_viewed_at,
    nullif(trim(coalesce(mi.zoho_invoice_number, '')), '') as zoho_invoice_number,
    mi.closure_reason,
    up.full_name as customer_name,
    case
      when lower(coalesce(up.account_billing_risk, 'ok')) = 'at_risk' then 'at_risk'
      else 'ok'
    end as account_billing_risk,
    coalesce(bs.booking_count, 0) as booking_count,
    coalesce(bs.open_count, 0) as open_count,
    bs.last_visit,
    coalesce(adj.has_discount_lines, false) as has_discount_lines,
    coalesce(adj.has_missed_visit_lines, false) as has_missed_visit_lines,
    ev.last_activity_at,
    coalesce(ev.payment_event_kinds, array[]::text[]) as payment_event_kinds,
    exists (
      select 1
      from public.monthly_invoice_paystack_charge_dedup d
      where d.invoice_id = mi.id
    ) or exists (
      select 1
      from public.payment_transactions pt
      where pt.entity_type = 'monthly_invoice'
        and pt.entity_id = mi.id
        and lower(coalesce(pt.gateway, '')) = 'paystack'
    ) as has_paystack_evidence,
    coalesce(
      nullif(trim(up.billing_email), ''),
      case
        when au.email is not null
          and lower(au.email) not like '%@walkin.shalean.com'
          and lower(au.email) not like '%@cleaner.shalean.com'
        then au.email
        else null
      end
    ) is not null
      or coalesce(bs.has_real_booking_email, false) as has_real_email,
    exists (
      select 1
      from public.recurring_bookings rb
      where rb.customer_id = mi.customer_id
        and lower(coalesce(rb.status, '')) = 'active'
        and rb.start_date <= ((to_date(mi.month || '-01', 'YYYY-MM-DD') + interval '1 month - 1 day')::date)
        and (rb.end_date is null or rb.end_date >= to_date(mi.month || '-01', 'YYYY-MM-DD'))
    ) as has_active_recurring_plan
  from public.monthly_invoices mi
  left join public.user_profiles up on up.id = mi.customer_id
  left join auth.users au on au.id = mi.customer_id
  left join booking_stats bs on bs.invoice_id = mi.id
  left join adjustment_stats adj on adj.invoice_id = mi.id
  left join event_stats ev on ev.invoice_id = mi.id
),
derived as (
  select
    b.*,
    case
      when b.status = 'draft'
        and b.last_visit is not null
        and to_char(b.last_visit, 'YYYY-MM') = b.month
      then b.last_visit
      else b.due_date
    end as effective_date,
    coalesce(b.zoho_invoice_number, 'MI-' || upper(left(b.id::text, 8))) as display_reference,
    case
      when b.status in ('paid', 'refunded') or b.balance_cents <= 0 then false
      when (
        (
          case
            when b.status = 'draft'
              and b.last_visit is not null
              and to_char(b.last_visit, 'YYYY-MM') = b.month
            then b.last_visit
            else b.due_date
          end
        ) + 5
      ) < r.today_jhb then true
      else false
    end as display_overdue,
    case
      when b.status = 'draft' and not b.is_closed and b.total_amount_cents > 0 then
        case
          when b.open_count > 0 then 'Open booking'
          when b.booking_count = 0 then 'Not ready'
          when not b.has_active_recurring_plan
            and r.today_jhb < (
              to_date(b.month || '-01', 'YYYY-MM-DD') + interval '1 month - 1 day'
            )::date
          then 'Month still open'
          when b.has_active_recurring_plan
            and b.last_visit is not null
            and r.today_jhb < b.last_visit
          then 'Upcoming visit'
          when not b.has_real_email then 'Contact required'
          else null
        end
      else null
    end as sync_hold_reason
  from base b
  cross join runtime r
),
filtered as (
  select d.*
  from derived d
  cross join runtime r
  where
    (
      r.status_filter = 'all'
      or (r.status_filter = 'paid' and d.status = 'paid')
      or (r.status_filter = 'draft' and d.status = 'draft')
      or (
        r.status_filter = 'sent'
        and d.status in ('sent', 'partially_paid')
        and not d.display_overdue
      )
      or (
        r.status_filter = 'unpaid'
        and d.status in ('sent', 'partially_paid', 'overdue')
      )
      or (r.status_filter = 'overdue' and d.display_overdue)
      or (
        r.status_filter = 'held'
        and d.status = 'draft'
        and d.sync_hold_reason is not null
      )
      or (
        r.status_filter = 'unviewed'
        and d.status in ('sent', 'partially_paid', 'overdue')
        and d.view_count = 0
      )
    )
    and (not p_balance_gt0 or d.balance_cents > 0)
    and (not p_has_discount_lines or d.has_discount_lines)
    and (not p_has_missed_visit_lines or d.has_missed_visit_lines)
    and (
      r.search_q = ''
      or lower(coalesce(d.customer_name, '')) like '%' || r.search_q || '%'
      or lower(d.customer_id::text) like '%' || r.search_q || '%'
      or lower(d.id::text) like '%' || r.search_q || '%'
      or lower(d.display_reference) like '%' || r.search_q || '%'
      or lower(coalesce(d.zoho_invoice_number, '')) like '%' || r.search_q || '%'
      or lower(d.month) like '%' || r.search_q || '%'
    )
),
ranked as (
  select
    f.*,
    dense_rank() over (order by f.month desc) as month_rank
  from filtered f
),
totals as (
  select
    count(*)::int as total_invoices,
    count(distinct month)::int as total_months,
    count(*) filter (where status = 'paid')::int as paid_count,
    count(*) filter (
      where status not in ('paid', 'refunded')
        and balance_cents > 0
        and display_overdue
    )::int as overdue_count,
    coalesce(sum(balance_cents) filter (
      where not is_closed
        and status in ('sent', 'partially_paid', 'overdue')
    ), 0)::bigint as collectible_outstanding_cents,
    coalesce(sum(balance_cents) filter (
      where not is_closed
        and status = 'draft'
    ), 0)::bigint as draft_forecast_cents,
    coalesce(sum(balance_cents) filter (
      where not is_closed
    ), 0)::bigint as total_outstanding_cents
  from filtered
),
page_meta as (
  select
    t.*,
    r.months_per_page,
    case
      when not p_paginate then 1
      else least(
        r.requested_page,
        greatest(1, ceil(t.total_months::numeric / r.months_per_page)::int)
      )
    end as resolved_page,
    greatest(1, ceil(t.total_months::numeric / r.months_per_page)::int) as total_pages
  from totals t
  cross join runtime r
),
page_rows as (
  select x.*
  from ranked x
  cross join page_meta pm
  where
    not p_paginate
    or (
      x.month_rank > (pm.resolved_page - 1) * pm.months_per_page
      and x.month_rank <= pm.resolved_page * pm.months_per_page
    )
),
page_counts as (
  select
    count(*)::int as page_invoice_count,
    count(*) filter (
      where month_rank <= (pm.resolved_page - 1) * pm.months_per_page
    )::int as invoice_offset
  from ranked
  cross join page_meta pm
  where p_paginate
),
rows_json as (
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', pr.id,
        'customer_id', pr.customer_id,
        'month', pr.month,
        'status', pr.status,
        'total_amount_cents', pr.total_amount_cents,
        'amount_paid_cents', pr.amount_paid_cents,
        'balance_cents', pr.balance_cents,
        'is_overdue', pr.display_overdue,
        'is_closed', pr.is_closed,
        'due_date', pr.effective_date,
        'customer_name', pr.customer_name,
        'currency_code', pr.currency_code,
        'account_billing_risk', pr.account_billing_risk,
        'days_overdue',
          case
            when pr.display_overdue and pr.effective_date is not null
            then greatest(0, (r.today_jhb - pr.effective_date) - 5)
            else 0
          end,
        'last_activity_at', pr.last_activity_at,
        'booking_count', pr.booking_count,
        'has_discount_lines', pr.has_discount_lines,
        'has_missed_visit_lines', pr.has_missed_visit_lines,
        'view_count', pr.view_count,
        'first_viewed_at', pr.first_viewed_at,
        'zoho_invoice_number', pr.zoho_invoice_number,
        'display_reference', pr.display_reference,
        'sync_hold_reason', pr.sync_hold_reason,
        'date_context', case when pr.status = 'draft' then 'last_visit' else 'due' end,
        'payment_event_kinds', to_jsonb(pr.payment_event_kinds),
        'has_paystack_evidence', pr.has_paystack_evidence,
        'closure_reason', pr.closure_reason
      )
      order by pr.month desc, lower(coalesce(pr.customer_name, '')), pr.id
    ),
    '[]'::jsonb
  ) as rows
  from page_rows pr
  cross join runtime r
)
select jsonb_build_object(
  'rows', rj.rows,
  'summary', jsonb_build_object(
    'total_invoices', pm.total_invoices,
    'paid_count', pm.paid_count,
    'overdue_count', pm.overdue_count,
    'collectible_outstanding_cents', pm.collectible_outstanding_cents,
    'draft_forecast_cents', pm.draft_forecast_cents,
    'total_outstanding_cents', pm.total_outstanding_cents
  ),
  'pagination',
    case
      when not p_paginate then null
      else jsonb_build_object(
        'page', pm.resolved_page,
        'pageSize', pm.months_per_page,
        'total', pm.total_invoices,
        'totalMonths', pm.total_months,
        'totalPages', pm.total_pages,
        'from',
          case
            when coalesce(pc.page_invoice_count, 0) = 0 then 0
            else coalesce(pc.invoice_offset, 0) + 1
          end,
        'to',
          case
            when coalesce(pc.page_invoice_count, 0) = 0 then 0
            else coalesce(pc.invoice_offset, 0) + coalesce(pc.page_invoice_count, 0)
          end,
        'hasNextPage', pm.resolved_page < pm.total_pages,
        'hasPreviousPage', pm.resolved_page > 1
      )
    end
)
from page_meta pm
cross join rows_json rj
left join page_counts pc on true;
$$;

revoke all on function public.admin_monthly_invoice_list_v1(
  text, text, boolean, boolean, boolean, integer, integer, boolean
) from public, anon, authenticated;

grant execute on function public.admin_monthly_invoice_list_v1(
  text, text, boolean, boolean, boolean, integer, integer, boolean
) to service_role;

comment on function public.admin_monthly_invoice_list_v1(
  text, text, boolean, boolean, boolean, integer, integer, boolean
) is
  'Service-role-only scalable monthly invoice list: SQL search/filtering, KPI summaries, booking/adjustment/payment evidence aggregation, and calendar-month pagination.';
