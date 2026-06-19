-- Full notification template catalog for Shalean ops UI + DB-driven copy.
-- Inserts missing (key, channel) rows only; does not overwrite existing admin edits.
-- Policy: customer WhatsApp templates stay inactive (cleaner-only WhatsApp sends).

insert into public.templates (key, channel, subject, content, variables, is_active)
values
  -- Customer: payment lifecycle
  (
    'booking_payment_processing',
    'email',
    'We''re finalising your booking',
    '<h1>Payment received</h1>
<p>Hi {{customer_name}},</p>
<p>We''ve received your payment and are finalising your booking. You''ll receive a confirmation email shortly.</p>
<p style="font-size:12px;color:#6b7280;">Reference: {{payment_reference}}</p>',
    '["customer_name","payment_reference"]'::jsonb,
    true
  ),
  (
    'booking_payment_processing',
    'sms',
    null,
    'Shalean: Payment received — we''re finalising your booking. Ref {{payment_reference}}',
    '["payment_reference"]'::jsonb,
    true
  ),
  (
    'payment_link',
    'email',
    'Complete payment — {{service}}',
    '<h1>Complete your booking payment</h1>
<p>Hi {{customer_name}},</p>
<p>Your cleaning visit is reserved. Pay securely to confirm.</p>
<p><strong>Service:</strong> {{service}}</p>
<p><strong>Date:</strong> {{date}} · <strong>Time:</strong> {{time}}</p>
<p><strong>Total due:</strong> {{price}}</p>
<p><a href="{{payment_url}}">Pay now</a></p>
<p style="font-size:12px;">Booking {{booking_id}} · Ref {{payment_reference}}</p>',
    '["customer_name","service","date","time","price","payment_url","booking_id","payment_reference"]'::jsonb,
    true
  ),
  (
    'payment_link',
    'sms',
    null,
    'Shalean: Complete payment for your booking: {{payment_url}} Ref {{booking_id}}',
    '["payment_url","booking_id"]'::jsonb,
    true
  ),
  (
    'booking_recovery_saved_quote',
    'email',
    'Your Shalean quote is saved — {{service}}',
    '<h1>Your cleaning quote is saved</h1>
<p>Hi {{customer_name}},</p>
<p>Pick up where you left off whenever you''re ready.</p>
<p><a href="{{continue_url}}">Continue your booking</a></p>
<p style="font-size:12px;">Service: {{service}}</p>',
    '["customer_name","service","continue_url"]'::jsonb,
    true
  ),
  -- Customer: booking lifecycle emails
  (
    'booking_assigned',
    'email',
    'Cleaner assigned — {{service}}',
    '<h1>Cleaner assigned</h1>
<p>A cleaner is now scheduled for your visit.</p>
<p><strong>Service:</strong> {{service}}</p>
<p><strong>Date:</strong> {{date}} · <strong>Time:</strong> {{time}}</p>
<p><strong>Location:</strong> {{location}}</p>
<p><strong>Cleaner:</strong> {{cleaner_name}}</p>
<p style="font-size:12px;">Booking {{booking_id}}</p>',
    '["service","date","time","location","cleaner_name","booking_id"]'::jsonb,
    true
  ),
  (
    'job_completed',
    'email',
    'Cleaning complete — {{service}}',
    '<h1>Cleaning complete</h1>
<p>Your <strong>{{service}}</strong> on <strong>{{date}}</strong> is marked complete.</p>
<p><a href="{{review_url}}">Rate this visit</a></p>
<p style="font-size:12px;">Booking {{booking_id}}</p>',
    '["service","date","booking_id","review_url"]'::jsonb,
    true
  ),
  (
    'booking_cancelled',
    'email',
    'Cancelled — {{service}}',
    '<h1>Booking cancelled</h1>
<p>Your <strong>{{service}}</strong> for <strong>{{date}}</strong> at <strong>{{time}}</strong> has been cancelled.</p>
<p style="font-size:12px;">Booking {{booking_id}}</p>',
    '["service","date","time","booking_id"]'::jsonb,
    true
  ),
  (
    'booking_cancelled',
    'sms',
    null,
    'Shalean: Your {{service}} booking on {{date}} was cancelled. Ref {{booking_id}}',
    '["service","date","booking_id"]'::jsonb,
    true
  ),
  (
    'booking_rescheduled',
    'email',
    'Updated schedule — {{service}}',
    '<h1>Booking rescheduled</h1>
<p>Your <strong>{{service}}</strong> time was updated.</p>
<p><strong>Previous:</strong> {{previous_date}} {{previous_time}}</p>
<p><strong>New:</strong> {{new_date}} {{new_time}}</p>
<p style="font-size:12px;">Booking {{booking_id}}</p>',
    '["service","previous_date","previous_time","new_date","new_time","booking_id"]'::jsonb,
    true
  ),
  (
    'booking_rescheduled',
    'sms',
    null,
    'Shalean: {{service}} moved to {{new_date}} {{new_time}} (was {{previous_date}}). Ref {{booking_id}}',
    '["service","previous_date","new_date","new_time","booking_id"]'::jsonb,
    true
  ),
  (
    'reminder_2h',
    'email',
    'Reminder: cleaning soon — {{service}}',
    '<h1>Reminder: cleaning soon</h1>
<p>Your <strong>{{service}}</strong> is coming up.</p>
<p><strong>When:</strong> {{date}} {{time}}</p>
<p><strong>Where:</strong> {{location}}</p>
<p><a href="{{account_url}}">View your booking</a></p>',
    '["service","date","time","location","booking_id","account_url"]'::jsonb,
    true
  ),
  (
    'reminder_2h',
    'sms',
    null,
    'Shalean: Reminder — {{service}} today at {{time}}. {{location}} Ref {{booking_id}}',
    '["service","time","location","booking_id"]'::jsonb,
    true
  ),
  (
    'booking_reminder_24h',
    'email',
    'Reminder: your clean is coming up',
    '<h1>Tomorrow''s clean</h1>
<p>Quick reminder — your Shalean booking is coming up.</p>
<p><strong>Service:</strong> {{service}}</p>
<p><strong>When:</strong> {{date}} at {{time}}</p>
<p><strong>Where:</strong> {{location}}</p>
<p><a href="{{account_url}}">View your booking</a></p>',
    '["service","date","time","location","account_url","booking_id"]'::jsonb,
    true
  ),
  (
    'review_prompt',
    'email',
    'How was your cleaning?',
    '<h1>How was your cleaning?</h1>
<p>We''d love a quick word on how everything went.</p>
<p><strong>Service:</strong> {{service}}</p>
<p><a href="{{review_url}}">Leave a review</a></p>',
    '["service","date","review_url","booking_id"]'::jsonb,
    true
  ),
  (
    'review_prompt_sms',
    'sms',
    null,
    'Hi {{first_name}}, thanks for choosing Shalean! Rate your clean: {{review_url}}',
    '["first_name","review_url","booking_id"]'::jsonb,
    true
  ),
  (
    'review_prompt_sms_reminder',
    'sms',
    null,
    'Hi {{first_name}}, quick reminder — we''d love your feedback: {{review_url}}',
    '["first_name","review_url","booking_id"]'::jsonb,
    true
  ),
  -- Cleaner SMS (reference copy; runtime bodies may include dynamic job links)
  (
    'dispatch_offer_link',
    'sms',
    null,
    'Shalean job offer: {{location}} · {{date}} {{time}} · {{pay}}. View & respond: {{offer_url}}',
    '["location","date","time","pay","offer_url","cleaner_name"]'::jsonb,
    true
  ),
  (
    'cleaner_assignment_sms_direct',
    'sms',
    null,
    'Shalean: Job assigned to you — {{service}} {{date}} {{time}} at {{location}}. {{job_url}}',
    '["service","date","time","location","job_url","booking_id"]'::jsonb,
    true
  ),
  (
    'cleaner_reminder_2h_sms_direct',
    'sms',
    null,
    'Shalean: Reminder — job at {{time}} today. {{location}} {{job_url}}',
    '["time","location","job_url","booking_id"]'::jsonb,
    true
  ),
  (
    'cleaner_dispatch_offer_lost_race_sms',
    'sms',
    null,
    'Job taken by another cleaner. More work: {{jobs_url}}',
    '["jobs_url","booking_id"]'::jsonb,
    true
  ),
  (
    'cleaner_booking_paid_off_platform',
    'sms',
    null,
    'Shalean: Customer payment confirmed ({{payment_method}}) for {{job_ref}}. Hi {{cleaner_name}} — you''re all set.',
    '["payment_method","job_ref","cleaner_name","booking_id"]'::jsonb,
    true
  ),
  -- Cleaner WhatsApp catalog (Meta sends; DB copy for ops)
  (
    'escalation',
    'whatsapp',
    null,
    'Urgent: job needs attention. {location} · {time}. Reply if you can take it.',
    '["location","time","booking_id"]'::jsonb,
    true
  ),
  -- Admin / ops reference
  (
    'admin_payment_confirmed',
    'email',
    'Payment recorded — {{service}}',
    '<h1>Payment confirmed (admin)</h1>
<p>Booking <code>{{booking_id}}</code> marked paid via {{payment_method}}.</p>
<p><strong>Customer:</strong> {{customer_email}}</p>
<p><strong>Service:</strong> {{service}} · {{date}} {{time}}</p>',
    '["booking_id","payment_method","customer_email","service","date","time"]'::jsonb,
    true
  )
on conflict (key, channel) do nothing;

comment on table public.templates is
  'Notification copy catalog (email / SMS / WhatsApp). booking_confirmed email+SMS are read at send-time when active; other rows are ops-editable reference unless wired in app code.';
