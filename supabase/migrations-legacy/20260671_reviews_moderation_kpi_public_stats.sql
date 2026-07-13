-- Reviews: moderation flag, public aggregate for marketing, notification dedupe for SMS review prompt,
-- user_events KPI types, cleaner stats exclude hidden reviews.

-- ---------------------------------------------------------------------------
-- Moderation: hide from public without delete
-- ---------------------------------------------------------------------------
alter table public.reviews add column if not exists is_hidden boolean not null default false;

comment on column public.reviews.is_hidden is 'When true, review is excluded from public aggregates and customer-facing snippets; admin-only.';

create index if not exists reviews_cleaner_public_idx
  on public.reviews (cleaner_id, created_at desc)
  where coalesce(is_hidden, false) = false;

-- ---------------------------------------------------------------------------
-- Cleaner rating / review_count: only non-hidden reviews
-- ---------------------------------------------------------------------------
create or replace function public.refresh_cleaner_rating(p_cleaner_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  avg_r double precision;
  cnt int;
begin
  select coalesce(avg(rating::double precision), 5), count(*)::int
    into avg_r, cnt
  from public.reviews
  where cleaner_id = p_cleaner_id
    and coalesce(is_hidden, false) = false;

  update public.cleaners
  set
    rating = round(avg_r::numeric, 2)::real,
    review_count = cnt
  where id = p_cleaner_id;
end;
$$;

drop trigger if exists reviews_refresh_cleaner_rating on public.reviews;
create trigger reviews_refresh_cleaner_rating
  after insert or delete or update of rating, is_hidden
  on public.reviews
  for each row execute function public.trg_reviews_refresh_cleaner();

-- Recompute all cleaners (counts/ratings now exclude hidden)
do $$
declare
  r record;
begin
  for r in (select id from public.cleaners)
  loop
    perform public.refresh_cleaner_rating(r.id);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Public marketing stats (anon-safe via SECURITY DEFINER)
-- ---------------------------------------------------------------------------
create or replace function public.public_review_banner_stats()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'avg_rating',
      case
        when count(*) = 0 then null
        else round(avg(rating::numeric), 1)
      end,
    'review_count',
    count(*)::bigint
  )
  from public.reviews
  where coalesce(is_hidden, false) = false;
$$;

revoke all on function public.public_review_banner_stats() from public;
grant execute on function public.public_review_banner_stats() to anon, authenticated, service_role;

comment on function public.public_review_banner_stats is 'Marketing homepage: avg rating and count of non-hidden reviews.';

-- ---------------------------------------------------------------------------
-- Notification dedupe: SMS review prompt (once per booking)
-- ---------------------------------------------------------------------------
drop index if exists public.idx_notification_dedupe;

with ranked as (
  select
    id,
    row_number() over (
      partition by
        source,
        coalesce(context->>'bookingId', ''),
        coalesce(context->>'cleanerId', '')
      order by created_at desc
    ) as rn
  from public.system_logs
  where source in (
    'reminder_2h_sent',
    'assigned_sent',
    'completed_sent',
    'sla_breach_sent',
    'review_prompt_sms_sent'
  )
)
delete from public.system_logs s
using ranked r
where s.id = r.id
  and r.rn > 1;

create unique index idx_notification_dedupe
  on public.system_logs (
    source,
    (context->>'bookingId'),
    coalesce(context->>'cleanerId', '')
  )
  where source in (
    'reminder_2h_sent',
    'assigned_sent',
    'completed_sent',
    'sla_breach_sent',
    'review_prompt_sms_sent'
  );

comment on index public.idx_notification_dedupe is
  'At most one system_logs claim per (source, bookingId, cleaner-or-empty) for outbound notification idempotency.';

-- ---------------------------------------------------------------------------
-- user_events: review KPI types
-- ---------------------------------------------------------------------------
alter table public.user_events drop constraint if exists user_events_event_type_check;

alter table public.user_events
  add constraint user_events_event_type_check
  check (
    event_type in (
      'booking_created',
      'booking_completed',
      'slot_selected',
      'extra_added',
      'recommendation_clicked',
      'flow_step_viewed',
      'flow_drop_off',
      'booking_agent_quote',
      'booking_agent_confirm',
      'page_view',
      'start_booking',
      'view_price',
      'select_time',
      'complete_booking',
      'referral_created',
      'referral_completed',
      'referral_rewarded',
      'growth_retention_reminder',
      'growth_win_back',
      'growth_ltv_message',
      'cleaners_loaded',
      'times_loaded',
      'price_calculated',
      'booking_started',
      'booking_upsell_interaction',
      'homepage_continue_booking',
      'homepage_cta_click',
      'homepage_service_select',
      'pricing_loaded',
      'homepage_abandon',
      'homepage_scroll',
      'price_updated',
      'review_submitted',
      'review_prompt_sent',
      'review_prompt_clicked'
    )
  );
