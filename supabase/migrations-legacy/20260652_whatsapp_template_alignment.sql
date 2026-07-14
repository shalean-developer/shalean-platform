-- Align DB template catalog with cleaner-only Meta policy + booking_offer ops copy.

update public.templates
set
  is_active = false,
  updated_at = now()
where key = 'payment_request'
  and channel = 'whatsapp';

update public.templates
set
  content =
    e'Hi {cleaner_name} — new job.\n{location} · {date} {time} · {pay}.\n\nReply:\n1 Accept\n2 Decline',
  updated_at = now()
where key = 'booking_offer'
  and channel = 'whatsapp';
