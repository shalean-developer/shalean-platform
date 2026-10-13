-- SALES-BOOKING-CONVERSION-01F
-- Atomically converge quote CRM Won state and its audit activity.
-- Replays repair either side without duplicating the stage-change history.

create or replace function public.mark_sales_quote_opportunity_won_atomic(
  p_quote_id uuid,
  p_source text default 'quote_accepted'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_quote public.sales_documents%rowtype;
  v_previous_stage text;
  v_changed boolean := false;
  v_activity_inserted boolean := false;
begin
  select *
  into v_quote
  from public.sales_documents
  where id = p_quote_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'quote_not_found');
  end if;

  if v_quote.document_type <> 'quote' or v_quote.converted_from_id is not null then
    return jsonb_build_object('ok', false, 'error', 'not_root_quote');
  end if;

  v_previous_stage := nullif(trim(coalesce(v_quote.crm_stage, '')), '');

  if v_previous_stage is distinct from 'won' then
    update public.sales_documents
    set
      crm_stage = 'won',
      crm_won_at = coalesce(crm_won_at, now()),
      crm_lost_at = null,
      crm_lost_reason = null,
      crm_next_follow_up_at = null,
      updated_at = now()
    where id = p_quote_id;

    v_changed := true;
  end if;

  if not exists (
    select 1
    from public.sales_opportunity_activities a
    where a.sales_document_id = p_quote_id
      and a.activity_type = 'stage_change'
      and a.metadata->>'to' = 'won'
  ) then
    insert into public.sales_opportunity_activities (
      sales_document_id,
      activity_type,
      body,
      metadata,
      created_by
    )
    values (
      p_quote_id,
      'stage_change',
      'Stage changed from ' || coalesce(v_previous_stage, 'unassigned') || ' to won',
      jsonb_build_object(
        'from', v_previous_stage,
        'to', 'won',
        'source', coalesce(nullif(trim(p_source), ''), 'quote_accepted')
      ),
      null
    );

    v_activity_inserted := true;
  end if;

  return jsonb_build_object(
    'ok', true,
    'changed', v_changed,
    'activity_inserted', v_activity_inserted
  );
end;
$fn$;

comment on function public.mark_sales_quote_opportunity_won_atomic(uuid, text) is
  'Atomically converges a root quote to CRM Won and guarantees one Won stage-change activity; replay-safe under a quote row lock.';

revoke all on function public.mark_sales_quote_opportunity_won_atomic(uuid, text) from public;
grant execute on function public.mark_sales_quote_opportunity_won_atomic(uuid, text) to service_role;
