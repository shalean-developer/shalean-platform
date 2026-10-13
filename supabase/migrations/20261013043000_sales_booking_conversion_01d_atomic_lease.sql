-- SALES-BOOKING-CONVERSION-01D
-- Serialize quote->invoice conversion/recovery across booking creation, Zoho sync,
-- and quote acceptance. Compensation is allowed only while the caller owns the
-- invoice lease and only when no linked booking exists.

alter table public.sales_documents
  add column if not exists conversion_lease_token uuid,
  add column if not exists conversion_lease_until timestamptz;

create index if not exists sales_documents_conversion_lease_until_idx
  on public.sales_documents (conversion_lease_until)
  where conversion_lease_until is not null;

create or replace function public.claim_sales_document_conversion(
  p_invoice_id uuid,
  p_token uuid,
  p_lease_seconds integer default 180
)
returns table(claimed boolean, lease_until timestamptz)
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_seconds integer;
  v_until timestamptz;
  v_claimed boolean := false;
begin
  v_seconds := greatest(60, least(300, coalesce(nullif(p_lease_seconds, 0), 180)));

  update public.sales_documents
  set
    conversion_lease_token = p_token,
    conversion_lease_until = now() + make_interval(secs => v_seconds),
    updated_at = now()
  where id = p_invoice_id
    and document_type = 'invoice'
    and (
      conversion_lease_token = p_token
      or conversion_lease_until is null
      or conversion_lease_until < now()
    )
  returning conversion_lease_until into v_until;

  v_claimed := found;
  return query select v_claimed, v_until;
end;
$fn$;

comment on function public.claim_sales_document_conversion(uuid, uuid, integer) is
  'Atomically claims/renews an invoice conversion lease for booking+Zoho+acceptance recovery.';

revoke all on function public.claim_sales_document_conversion(uuid, uuid, integer) from public;
grant execute on function public.claim_sales_document_conversion(uuid, uuid, integer) to service_role;

create or replace function public.release_sales_document_conversion(
  p_invoice_id uuid,
  p_token uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $fn$
begin
  update public.sales_documents
  set
    conversion_lease_token = null,
    conversion_lease_until = null,
    updated_at = now()
  where id = p_invoice_id
    and conversion_lease_token = p_token;

  return found;
end;
$fn$;

comment on function public.release_sales_document_conversion(uuid, uuid) is
  'Releases an invoice conversion lease only when the caller still owns the lease token.';

revoke all on function public.release_sales_document_conversion(uuid, uuid) from public;
grant execute on function public.release_sales_document_conversion(uuid, uuid) to service_role;

create or replace function public.compensate_failed_sales_document_conversion(
  p_invoice_id uuid,
  p_token uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_invoice public.sales_documents%rowtype;
begin
  select *
  into v_invoice
  from public.sales_documents
  where id = p_invoice_id
    and document_type = 'invoice'
  for update;

  if not found then
    return jsonb_build_object('ok', true, 'deleted', false, 'reason', 'invoice_missing');
  end if;

  if v_invoice.conversion_lease_token is distinct from p_token
     or v_invoice.conversion_lease_until is null
     or v_invoice.conversion_lease_until < now() then
    return jsonb_build_object('ok', false, 'error', 'conversion_lease_not_owned');
  end if;

  if coalesce(v_invoice.amount_paid_cents, 0) > 0
     or lower(coalesce(v_invoice.status, '')) in ('paid', 'refunded', 'void') then
    return jsonb_build_object('ok', false, 'error', 'invoice_financial_state_blocks_compensation');
  end if;

  if exists (
    select 1
    from public.bookings b
    where b.sales_document_id = p_invoice_id
  ) then
    return jsonb_build_object('ok', false, 'error', 'linked_booking_exists');
  end if;

  if nullif(trim(coalesce(v_invoice.zoho_invoice_id, '')), '') is not null then
    return jsonb_build_object('ok', false, 'error', 'zoho_invoice_exists');
  end if;

  delete from public.sales_documents
  where id = p_invoice_id
    and conversion_lease_token = p_token;

  return jsonb_build_object('ok', true, 'deleted', found);
end;
$fn$;

comment on function public.compensate_failed_sales_document_conversion(uuid, uuid) is
  'Atomically deletes a failed local-only invoice only when the caller owns the conversion lease and no booking/Zoho/paid state exists.';

revoke all on function public.compensate_failed_sales_document_conversion(uuid, uuid) from public;
grant execute on function public.compensate_failed_sales_document_conversion(uuid, uuid) to service_role;
