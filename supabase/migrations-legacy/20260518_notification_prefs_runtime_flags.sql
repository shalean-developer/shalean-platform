-- Customer outbound preference + global WhatsApp pause (service role from Next.js).

alter table public.user_profiles
  add column if not exists preferred_notification_channel text;

alter table public.user_profiles
  drop constraint if exists user_profiles_preferred_notification_channel_check;

alter table public.user_profiles
  add constraint user_profiles_preferred_notification_channel_check
  check (
    preferred_notification_channel is null
    or preferred_notification_channel in ('whatsapp', 'sms', 'email')
  );

comment on column public.user_profiles.preferred_notification_channel is
  'Outbound preference for booking comms: whatsapp | sms | email | null (null = default: try WhatsApp then SMS fallback where applicable).';

-- Singleton row (id = 1) for ops-controlled runtime switches.
create table if not exists public.notification_runtime_flags (
  id smallint primary key default 1 check (id = 1),
  whatsapp_disabled_until timestamptz,
  updated_at timestamptz not null default now()
);

insert into public.notification_runtime_flags (id, whatsapp_disabled_until)
values (1, null)
on conflict (id) do nothing;

comment on table public.notification_runtime_flags is
  'Global outbound switches; written by cron/health checks (service role). Row id must stay 1.';

alter table public.notification_runtime_flags enable row level security;
