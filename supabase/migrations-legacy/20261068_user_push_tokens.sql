-- Customer (and future cleaner) Expo push token registry for mobile apps.
-- Ownership: user_id always set from JWT in API routes (service role writes).

create table if not exists public.user_push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  token text not null,
  platform text,
  app text not null default 'customer',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_push_tokens_token_len check (char_length(token) >= 16 and char_length(token) <= 512),
  constraint user_push_tokens_app_check check (app in ('customer', 'cleaner'))
);

create unique index if not exists user_push_tokens_user_token_uidx
  on public.user_push_tokens (user_id, token);

create index if not exists user_push_tokens_token_idx
  on public.user_push_tokens (token);

create index if not exists user_push_tokens_user_app_idx
  on public.user_push_tokens (user_id, app);

alter table public.user_push_tokens enable row level security;

-- Clients use Bearer APIs with service role; RLS still blocks direct anon/auth misuse.
drop policy if exists user_push_tokens_select_own on public.user_push_tokens;
create policy user_push_tokens_select_own
  on public.user_push_tokens for select to authenticated
  using (user_id = auth.uid());

drop policy if exists user_push_tokens_insert_own on public.user_push_tokens;
create policy user_push_tokens_insert_own
  on public.user_push_tokens for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists user_push_tokens_update_own on public.user_push_tokens;
create policy user_push_tokens_update_own
  on public.user_push_tokens for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists user_push_tokens_delete_own on public.user_push_tokens;
create policy user_push_tokens_delete_own
  on public.user_push_tokens for delete to authenticated
  using (user_id = auth.uid());

comment on table public.user_push_tokens is
  'Expo push tokens for mobile apps; register via /api/customer/devices (service role + JWT ownership).';
