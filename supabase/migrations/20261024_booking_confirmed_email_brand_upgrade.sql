-- Upgrade booking_confirmed email to branded production-ready copy; fix WhatsApp placeholder syntax.

update public.templates
set
  subject = 'Your booking is confirmed — {{customer_name}}',
  content = '<h1 style="font-size: 22px; margin: 0 0 12px;">Your booking is confirmed ✅</h1>
<p style="color:#6b7280; margin-bottom: 20px;">Hi {{customer_name}}, your cleaning is scheduled. We''ve got everything covered.</p>
{{cleaner_substitution_notice}}
<div style="border:1px solid #e5e7eb; border-radius:12px; padding:16px; margin-bottom:20px; background:#ffffff;">
  <p style="margin:0 0 8px;"><strong>Service:</strong> {{service_name}}</p>
  <p style="margin:0 0 8px;"><strong>Date:</strong> {{booking_date}}</p>
  <p style="margin:0 0 8px;"><strong>Time:</strong> {{booking_time}}</p>
  <p style="margin:0 0 8px;"><strong>Location:</strong> {{booking_address}}</p>
  <p style="margin:0 0 8px;"><strong>Cleaner:</strong> {{cleaner_name}}</p>
  <hr style="border:none;border-top:1px solid #eee;margin:12px 0;" />
  <p style="font-size:18px;margin:0;"><strong>Total:</strong> <span style="color:#059669;">{{total_price}}</span></p>
  <p style="font-size:12px;color:#6b7280;margin:8px 0 0;">
    Booking ref: <span style="font-family:monospace;">{{booking_reference}}</span><br/>
    Payment: {{payment_status}} · Ref <span style="font-family:monospace;">{{payment_reference}}</span>
  </p>
</div>
<div style="margin-bottom:20px;font-size:14px;color:#374151;">
  ✔ Verified cleaners<br/>
  ✔ Secure payment<br/>
  ✔ Satisfaction guaranteed
</div>
<a href="{{account_url}}" style="display:block;text-align:center;background:#2563eb;color:#ffffff;padding:14px;border-radius:10px;text-decoration:none;font-weight:600;margin-bottom:4px;">View your booking</a>
{{book_again_section}}',
  variables = '[
    "customer_name",
    "booking_reference",
    "booking_id",
    "service_name",
    "booking_date",
    "booking_time",
    "booking_address",
    "location",
    "total_price",
    "payment_status",
    "payment_reference",
    "cleaner_name",
    "book_again_url",
    "account_url",
    "cleaner_substitution_notice",
    "book_again_section",
    "service",
    "date",
    "time",
    "price"
  ]'::jsonb,
  updated_at = now()
where key = 'booking_confirmed' and channel = 'email';

-- WhatsApp ops copy: consistent {{variable}} placeholders (renderer + admin UI).
update public.templates
set content = 'Hi {{cleaner_name}} — new job. {{location}} · {{date}} {{time}} · {{pay}}. Reply 1=ACCEPT 2=DECLINE.', updated_at = now()
where key = 'booking_offer' and channel = 'whatsapp';

update public.templates
set content = 'Job assigned. {{location}} · {{date}} {{time}}. Arrive on time.', updated_at = now()
where key = 'booking_assigned' and channel = 'whatsapp';

update public.templates
set content = 'Reminder: job today. {{location}} · {{time}}. Reply if issues.', updated_at = now()
where key = 'reminder' and channel = 'whatsapp';

update public.templates
set content = '{{line}}', updated_at = now()
where key = 'offer_ack' and channel = 'whatsapp';

update public.templates
set content = '{{line}}', updated_at = now()
where key = 'cleaner_welcome' and channel = 'whatsapp';

update public.templates
set content = '{{line}}', updated_at = now()
where key = 'cleaner_approved' and channel = 'whatsapp';

update public.templates
set content = 'Urgent: job needs attention. {{location}} · {{time}}. Reply if you can take it.', updated_at = now()
where key = 'escalation' and channel = 'whatsapp';
