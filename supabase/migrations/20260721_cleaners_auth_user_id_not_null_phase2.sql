-- Phase 2 (apply only after legacy auth is off and every cleaner row has auth_user_id set).
-- Replaces nullable FK (ON DELETE SET NULL) with NOT NULL + RESTRICT + full unique index.

do $$
begin
  if exists (select 1 from public.cleaners where auth_user_id is null limit 1) then
    raise exception 'cleaners.auth_user_id: null rows remain; backfill before applying this migration';
  end if;
end;
$$;

alter table public.cleaners
  drop constraint if exists cleaners_auth_user_id_fkey;

alter table public.cleaners
  alter column auth_user_id set not null;

alter table public.cleaners
  add constraint cleaners_auth_user_id_fkey
  foreign key (auth_user_id) references auth.users (id) on delete restrict;

drop index if exists public.cleaners_auth_user_id_unique_idx;

create unique index if not exists uniq_cleaners_auth_user_id
  on public.cleaners (auth_user_id);

comment on index public.uniq_cleaners_auth_user_id is
  'One auth user per cleaner row (Phase 2); replaces partial cleaners_auth_user_id_unique_idx.';
