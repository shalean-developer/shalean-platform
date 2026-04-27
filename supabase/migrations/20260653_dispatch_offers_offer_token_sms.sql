-- SMS dispatch offer links: secret token + outbound SMS timestamp for latency metrics

alter table public.dispatch_offers
  add column if not exists offer_token text,
  add column if not exists sms_sent_at timestamptz;

comment on column public.dispatch_offers.offer_token is
  'Unguessable token for /offer/{token} SMS links; unique when set.';

comment on column public.dispatch_offers.sms_sent_at is
  'When the dispatch-offer SMS was accepted by Twilio; used as response latency anchor when WhatsApp is unused.';

create unique index if not exists dispatch_offers_offer_token_uidx
  on public.dispatch_offers (offer_token)
  where offer_token is not null;
