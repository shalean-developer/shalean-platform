-- QUOTE-E2E-07 — operational sales follow-up lifecycle.
--
-- Backfill missing CRM stages/follow-up tasks on root quote opportunities and
-- keep customer-view activity converged into the CRM follow-up stage.

update public.sales_documents
set
  crm_stage = case
    when status in ('void','expired','refunded') then 'lost'
    when status in ('paid','accepted') then 'won'
    when status = 'sent' then 'follow_up'
    when status = 'draft' then 'quote'
    else 'lead'
  end,
  crm_won_at = case
    when status in ('paid','accepted') then coalesce(crm_won_at, updated_at, now())
    else crm_won_at
  end,
  crm_lost_at = case
    when status in ('void','expired','refunded') then coalesce(crm_lost_at, updated_at, now())
    else crm_lost_at
  end
where converted_from_id is null
  and document_type = 'quote'
  and crm_stage is null;

update public.sales_documents
set crm_next_follow_up_at = created_at + interval '24 hours'
where converted_from_id is null
  and document_type = 'quote'
  and status = 'requested'
  and coalesce(crm_stage, 'lead') not in ('won','lost')
  and crm_next_follow_up_at is null;

update public.sales_documents
set crm_next_follow_up_at = coalesce(sent_at, updated_at, created_at) + interval '48 hours'
where converted_from_id is null
  and document_type = 'quote'
  and status = 'sent'
  and coalesce(crm_stage, 'follow_up') not in ('won','lost')
  and crm_next_follow_up_at is null;

create or replace function public.record_sales_document_view(doc_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  root_id uuid;
  previous_stage text;
begin
  update public.sales_documents
  set
    view_count = view_count + 1,
    last_viewed_at = now(),
    first_viewed_at = coalesce(first_viewed_at, now())
  where id = doc_id
  returning coalesce(converted_from_id, id) into root_id;

  if root_id is null then
    return;
  end if;

  select crm_stage
  into previous_stage
  from public.sales_documents
  where id = root_id
    and converted_from_id is null
    and document_type = 'quote'
  for update;

  if not found then
    return;
  end if;

  if coalesce(previous_stage, 'lead') not in ('won','lost') then
    update public.sales_documents
    set
      crm_stage = 'follow_up',
      crm_next_follow_up_at = coalesce(crm_next_follow_up_at, now() + interval '24 hours')
    where id = root_id;

    if previous_stage is distinct from 'follow_up' then
      insert into public.sales_opportunity_activities (
        sales_document_id,
        activity_type,
        body,
        metadata,
        created_by
      )
      values (
        root_id,
        'stage_change',
        format('Stage changed from %s to follow_up after customer opened the document',
          coalesce(previous_stage, 'unassigned')),
        jsonb_build_object(
          'from', previous_stage,
          'to', 'follow_up',
          'source', 'customer_view'
        ),
        null
      );
    end if;
  end if;
end;
$$;

revoke all on function public.record_sales_document_view(uuid) from public, anon, authenticated;
grant execute on function public.record_sales_document_view(uuid) to service_role;

comment on function public.record_sales_document_view(uuid) is
  'QUOTE-E2E-07: records document views and converges the root quote opportunity into follow_up without sending customer outreach.';
