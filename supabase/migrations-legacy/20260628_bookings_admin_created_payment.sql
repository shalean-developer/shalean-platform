-- Admin-created checkout: audit + resendable Paystack URL
alter table public.bookings
  add column if not exists created_by_admin boolean not null default false;

alter table public.bookings
  add column if not exists created_by uuid references auth.users (id) on delete set null;

alter table public.bookings
  add column if not exists payment_link text;

comment on column public.bookings.created_by_admin is
  'True when checkout was started from admin tools (same Paystack pipeline as self-serve).';

comment on column public.bookings.created_by is
  'Auth user id of the admin who created the pending_payment checkout, when applicable.';

comment on column public.bookings.payment_link is
  'Last Paystack authorization_url issued for this row (admin resend / support); customer checkout may omit.';

-- Optional copy for WhatsApp / SMS (email for payment link is built in app for correct CTA href)
insert into public.templates (key, channel, subject, content, variables)
values
  (
    'payment_request',
    'whatsapp',
    null,
    'Hi {{customer_name}} 👋

Your Shalean cleaning booking is ready.

Please complete your payment here:
{{payment_link}}

Service: {{service}}
📅 {{date}} · ⏰ {{time}}

Thank you!',
    '["customer_name","payment_link","service","date","time"]'::jsonb
  ),
  (
    'payment_request',
    'sms',
    null,
    'Shalean: Complete payment for your booking: {{payment_link}} Ref {{booking_id}}',
    '["payment_link","booking_id"]'::jsonb
  )
on conflict (key, channel) do nothing;
