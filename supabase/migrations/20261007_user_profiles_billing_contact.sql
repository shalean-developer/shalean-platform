-- Canonical customer billing contact on user_profiles (login email stays on auth.users).

alter table public.user_profiles
  add column if not exists billing_email text null,
  add column if not exists phone text null,
  add column if not exists phone_e164 text null;

comment on column public.user_profiles.billing_email is
  'Real customer email for invoices, Zoho, and lifecycle mail — never @cleaner.shalean.com / @walkin.shalean.com.';
comment on column public.user_profiles.phone is
  'Display/normalized phone for ops and billing contact resolution.';
comment on column public.user_profiles.phone_e164 is
  'Canonical SA mobile (+27…) when parseable; used for dedupe and contact lookup.';

create index if not exists user_profiles_billing_email_idx
  on public.user_profiles (lower(billing_email))
  where billing_email is not null;

create index if not exists user_profiles_phone_e164_idx
  on public.user_profiles (phone_e164)
  where phone_e164 is not null;
