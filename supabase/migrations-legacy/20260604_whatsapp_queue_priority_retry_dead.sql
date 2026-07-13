-- Priority, exponential backoff gate, and terminal `dead` state for WhatsApp queue.

alter table public.whatsapp_queue
  add column if not exists priority int not null default 0,
  add column if not exists next_attempt_at timestamptz;

comment on column public.whatsapp_queue.priority is 'Higher = sooner (worker orders priority DESC, created_at ASC).';
comment on column public.whatsapp_queue.next_attempt_at is 'When status=pending after a failure, do not pick until this time (exponential backoff).';

alter table public.whatsapp_queue drop constraint if exists whatsapp_queue_status_check;
alter table public.whatsapp_queue add constraint whatsapp_queue_status_check
  check (status in ('pending', 'processing', 'sent', 'failed', 'dead'));

drop index if exists public.whatsapp_queue_idempotency_active_uidx;
create unique index whatsapp_queue_idempotency_active_uidx
  on public.whatsapp_queue (idempotency_key)
  where idempotency_key is not null and status not in ('failed', 'dead');

create index if not exists whatsapp_queue_worker_pick_idx
  on public.whatsapp_queue (priority desc, next_attempt_at asc nulls first, created_at asc)
  where status = 'pending';
