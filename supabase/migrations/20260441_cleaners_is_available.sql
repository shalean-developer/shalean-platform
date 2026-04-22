-- Compatibility extension for direct assignment flows.
-- Keep existing status-based model, but expose a simple availability boolean.

alter table public.cleaners
  add column if not exists is_available boolean not null default true;

update public.cleaners
set is_available = case
  when lower(coalesce(status, '')) in ('offline', 'busy') then false
  else true
end;
