-- Beaulla BEA-EMAIL-001: customer-facing booking confirmation email
-- Uses SHL-BK / PAY refs, full summary fields, detail deep-link via account_url.
-- Inner body only — sendTemplateEmail wraps with wrapBrandedEmailContent
-- (Shalean logo header, brand colours, support + social footer).

update public.templates
set
  subject = 'Your booking is confirmed — {{customer_name}}',
  content = '<h1 style="font-size:22px;margin:0 0 12px;color:#1f2937;">Your booking is confirmed ✅</h1>
<p style="color:#6b7280;margin:0 0 20px;">Hi {{customer_name}}, your cleaning is scheduled. We''ve got everything covered.</p>
{{cleaner_substitution_notice}}
<div style="border:1px solid #e5e7eb;border-radius:12px;padding:16px;margin-bottom:20px;background:#ffffff;">
  <p style="margin:0 0 8px;"><strong>Service:</strong> {{service_name}}</p>
  <p style="margin:0 0 8px;"><strong>Date:</strong> {{booking_date}}</p>
  <p style="margin:0 0 8px;"><strong>Time:</strong> {{booking_time}}</p>
  <p style="margin:0 0 8px;"><strong>Address:</strong> {{booking_address}}</p>
  {{suburb_row}}
  {{extras_row}}
  {{recurring_row}}
  <p style="margin:0 0 8px;"><strong>Cleaner:</strong> {{cleaner_name}}</p>
  <hr style="border:none;border-top:1px solid #eee;margin:12px 0;" />
  <p style="font-size:18px;margin:0;"><strong>Total paid:</strong> <span style="color:#059669;">{{total_price}}</span></p>
  <p style="font-size:12px;color:#6b7280;margin:8px 0 0;">
    Booking reference: <span style="font-family:monospace;">{{booking_reference}}</span><br/>
    Payment: {{payment_status}} · Ref <span style="font-family:monospace;">{{payment_reference}}</span>
  </p>
</div>
<div style="margin-bottom:20px;font-size:14px;color:#374151;line-height:1.6;">
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
    "suburb",
    "suburb_row",
    "extras",
    "extras_label",
    "extras_row",
    "recurring_summary",
    "recurring_row",
    "total_price",
    "payment_status",
    "payment_reference",
    "cleaner_name",
    "cleaner_status",
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
