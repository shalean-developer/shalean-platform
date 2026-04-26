-- Audit trail for Meta WhatsApp send attempts tied to bookings (e.g. POST /api/bookings).

create table if not exists public.whatsapp_logs (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id) on delete cascade,
  phone text not null,
  message_type text not null check (message_type in ('text', 'template')),
  status text not null check (status in ('sent', 'failed')),
  error_message text,
  created_at timestamptz not null default now()
);

create index if not exists whatsapp_logs_booking_id_idx on public.whatsapp_logs (booking_id);
create index if not exists whatsapp_logs_created_at_idx on public.whatsapp_logs (created_at desc);
create index if not exists whatsapp_logs_status_idx on public.whatsapp_logs (status);

comment on table public.whatsapp_logs is
  'One row per Meta WhatsApp API attempt (text or template); inserted from Next.js via service role.';

alter table public.whatsapp_logs enable row level security;
