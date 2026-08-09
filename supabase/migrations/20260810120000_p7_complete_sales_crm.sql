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
