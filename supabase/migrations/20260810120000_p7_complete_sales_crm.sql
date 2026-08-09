-- P7: durable sales CRM controls without replacing canonical documents/bookings/payments.
alter table public.sales_documents
  add column if not exists crm_stage text,
  add column if not exists crm_owner_user_id uuid references auth.users(id) on delete set null,
  add column if not exists crm_next_follow_up_at timestamptz,
  add column if not exists crm_first_responded_at timestamptz,
  add column if not exists crm_won_at timestamptz,
  add column if not exists crm_lost_at timestamptz,
  add column if not exists crm_lost_reason text,
  add column if not exists lead_source text,
  add column if not exists utm_source text,
  add column if not exists utm_medium text,
  add column if not exists utm_campaign text,
  add column if not exists utm_term text,
  add column if not exists utm_content text;

alter table public.sales_documents drop constraint if exists sales_documents_crm_stage_check;
alter table public.sales_documents add constraint sales_documents_crm_stage_check
  check (crm_stage is null or crm_stage = any (array['lead','qualified','quote','follow_up','won','lost']));

update public.sales_documents
set
  crm_stage = case
    when status in ('void','expired','refunded') then 'lost'
    when status in ('paid','accepted') then 'won'
    when status = 'sent' or coalesce(view_count, 0) > 0 or first_viewed_at is not null then 'follow_up'
    when status = 'draft' then 'quote'
    else 'lead'
  end,
  lead_source = case when source = 'customer_request' then 'website' else 'office' end
where converted_from_id is null and (crm_stage is null or lead_source is null);

create index if not exists sales_documents_crm_stage_idx
  on public.sales_documents (crm_stage, created_at desc) where converted_from_id is null;
create index if not exists sales_documents_crm_follow_up_idx
  on public.sales_documents (crm_next_follow_up_at) where crm_next_follow_up_at is not null;
create index if not exists sales_documents_crm_owner_idx
  on public.sales_documents (crm_owner_user_id, crm_next_follow_up_at);

create table if not exists public.sales_opportunity_activities (
  id uuid primary key default gen_random_uuid(),
  sales_document_id uuid not null references public.sales_documents(id) on delete cascade,
  activity_type text not null check (activity_type = any (array['note','call','email','whatsapp','stage_change','follow_up'])),
  body text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check (body is null or char_length(body) <= 4000)
);

create index if not exists sales_opportunity_activities_document_idx
  on public.sales_opportunity_activities (sales_document_id, created_at desc);

alter table public.sales_opportunity_activities enable row level security;
revoke all on public.sales_opportunity_activities from anon, authenticated;
grant all on public.sales_opportunity_activities to service_role;

comment on table public.sales_opportunity_activities is
  'Auditable CRM activity for the root quote/opportunity; financial records remain canonical elsewhere.';

create or replace function public.set_sales_opportunity_crm(
  p_document_id uuid, p_stage text, p_next_follow_up_at timestamptz,
  p_lost_reason text, p_owner_user_id uuid, p_lead_source text, p_actor_user_id uuid
) returns void language plpgsql security invoker set search_path = public, pg_temp as $$
declare v_previous_stage text;
begin
  if p_stage is not null and p_stage <> all (array['lead','qualified','quote','follow_up','won','lost']) then
    raise exception 'invalid_stage';
  end if;
  if p_stage = 'lost' and nullif(trim(p_lost_reason), '') is null then raise exception 'lost_reason_required'; end if;

  select crm_stage into v_previous_stage from public.sales_documents
  where id = p_document_id and converted_from_id is null for update;
  if not found then raise exception 'opportunity_not_found'; end if;

  update public.sales_documents set
    crm_stage = coalesce(p_stage, crm_stage),
    crm_next_follow_up_at = p_next_follow_up_at,
    crm_owner_user_id = coalesce(p_owner_user_id, crm_owner_user_id),
    lead_source = coalesce(nullif(trim(p_lead_source), ''), lead_source),
    crm_lost_reason = case when p_stage = 'lost' then trim(p_lost_reason) when p_stage is not null then null else crm_lost_reason end,
    crm_won_at = case when p_stage = 'won' and v_previous_stage is distinct from 'won' then now() when p_stage is not null and p_stage <> 'won' then null else crm_won_at end,
    crm_lost_at = case when p_stage = 'lost' and v_previous_stage is distinct from 'lost' then now() when p_stage is not null and p_stage <> 'lost' then null else crm_lost_at end
  where id = p_document_id;

  if p_stage is not null and p_stage is distinct from v_previous_stage then
    insert into public.sales_opportunity_activities (sales_document_id, activity_type, body, metadata, created_by)
    values (p_document_id, 'stage_change', format('Stage changed from %s to %s', coalesce(v_previous_stage, 'unassigned'), p_stage), jsonb_build_object('from', v_previous_stage, 'to', p_stage), p_actor_user_id);
  end if;
end;
$$;

revoke all on function public.set_sales_opportunity_crm(uuid,text,timestamptz,text,uuid,text,uuid) from public, anon, authenticated;
grant execute on function public.set_sales_opportunity_crm(uuid,text,timestamptz,text,uuid,text,uuid) to service_role;
