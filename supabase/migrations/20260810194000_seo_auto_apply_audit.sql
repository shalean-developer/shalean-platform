create table if not exists public.seo_auto_apply_audit (
  id uuid primary key default gen_random_uuid(),
  target_table text not null,
  slug text not null,
  operation text not null check (operation in ('INSERT','UPDATE','DELETE')),
  previous_value jsonb,
  next_value jsonb,
  source text not null default 'optimizer',
  created_at timestamptz not null default now()
);

alter table public.seo_auto_apply_audit enable row level security;
revoke all on public.seo_auto_apply_audit from anon, authenticated;
grant select, insert on public.seo_auto_apply_audit to service_role;

create index if not exists seo_auto_apply_audit_slug_created_at_idx
  on public.seo_auto_apply_audit (slug, created_at desc);

create or replace function public.log_seo_auto_apply_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.seo_auto_apply_audit (
    target_table,
    slug,
    operation,
    previous_value,
    next_value,
    source
  ) values (
    tg_table_name,
    coalesce(new.slug, old.slug),
    tg_op,
    case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) else null end,
    coalesce(new.source, old.source, 'optimizer')
  );
  return coalesce(new, old);
end;
$$;

revoke all on function public.log_seo_auto_apply_change() from public;
grant execute on function public.log_seo_auto_apply_change() to service_role;

drop trigger if exists audit_seo_auto_title_variant on public.seo_auto_title_variant;
create trigger audit_seo_auto_title_variant
after insert or update or delete on public.seo_auto_title_variant
for each row execute function public.log_seo_auto_apply_change();

drop trigger if exists audit_seo_auto_hub_ui_patch on public.seo_auto_hub_ui_patch;
create trigger audit_seo_auto_hub_ui_patch
after insert or update or delete on public.seo_auto_hub_ui_patch
for each row execute function public.log_seo_auto_apply_change();
