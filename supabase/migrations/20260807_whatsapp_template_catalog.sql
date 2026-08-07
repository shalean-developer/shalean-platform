-- Canonical WhatsApp template catalogue for Meta Cloud API.
--
-- Safety: this migration does not change existing rows and does not activate
-- any newly-created template. Meta approval is external; rows stay inactive
-- until the corresponding Meta template is approved and mapped.

insert into public.templates (key, channel, subject, content, variables, is_active)
values
  ('payment_request','whatsapp',null,
   'Hi {{customer_name}}, payment is required for booking {{booking_id}}. Amount: {{amount}}. Pay securely here: {{payment_link}}',
   '["customer_name","booking_id","amount","payment_link"]'::jsonb,false),
  ('payment_confirmed','whatsapp',null,
   'Hi {{customer_name}}, we have received payment for booking {{booking_id}}. Amount received: {{amount}}. Thank you.',
   '["customer_name","booking_id","amount"]'::jsonb,false),
  ('booking_reminder_24h','whatsapp',null,
   'Hi {{customer_name}}, reminder: your {{service}} cleaning is booked for {{date}} at {{time}}. We look forward to serving you.',
   '["customer_name","date","time","service"]'::jsonb,false),
  ('customer_booking_assigned','whatsapp',null,
   'Hi {{customer_name}}, {{cleaner_name}} has been assigned to your Shalean booking on {{date}} at {{time}}.',
   '["customer_name","cleaner_name","date","time"]'::jsonb,false),
  ('booking_rescheduled','whatsapp',null,
   'Hi {{customer_name}}, booking {{booking_id}} has been rescheduled to {{date}} at {{time}}.',
   '["customer_name","booking_id","date","time"]'::jsonb,false),
  ('booking_cancelled','whatsapp',null,
   'Hi {{customer_name}}, booking {{booking_id}} for {{date}} has been cancelled. Contact Shalean if you need help rebooking.',
   '["customer_name","booking_id","date"]'::jsonb,false),
  ('job_completed','whatsapp',null,
   'Hi {{customer_name}}, booking {{booking_id}} has been marked complete. Thank you for choosing Shalean Cleaning Services.',
   '["customer_name","booking_id"]'::jsonb,false),
  ('review_prompt','whatsapp',null,
   'Hi {{customer_name}}, thank you for choosing Shalean. Please share your feedback here: {{review_link}}',
   '["customer_name","review_link"]'::jsonb,false),
  ('booking_offer','whatsapp',null,
   'Hi {{cleaner_name}}, new Shalean job available. {{location}} · {{date}} · {{time}} · {{pay}}. Reply 1 to ACCEPT or 2 to DECLINE.',
   '["cleaner_name","location","date","time","pay"]'::jsonb,false),
  ('offer_ack','whatsapp',null,
   '{{line}}','["line"]'::jsonb,false),
  ('booking_assigned','whatsapp',null,
   'Shalean job assigned: {{location}} · {{date}} · {{time}}. Please arrive on time and follow the booking instructions.',
   '["location","date","time"]'::jsonb,false),
  ('reminder','whatsapp',null,
   'Reminder: you have a Shalean job at {{location}} at {{time}}. Contact your supervisor immediately if there is an issue.',
   '["location","time"]'::jsonb,false),
  ('cleaner_welcome','whatsapp',null,
   '{{line}}','["line"]'::jsonb,false),
  ('cleaner_approved','whatsapp',null,
   '{{line}}','["line"]'::jsonb,false),
  ('cleaner_booking_changed','whatsapp',null,
   'Booking {{booking_id}} has changed. New details: {{date}} · {{time}} · {{location}}. Check the Shalean app before travelling.',
   '["booking_id","date","time","location"]'::jsonb,false),
  ('cleaner_booking_cancelled','whatsapp',null,
   'Booking {{booking_id}} for {{date}} at {{location}} has been cancelled. Do not travel to the job unless Shalean reassigns it.',
   '["booking_id","date","location"]'::jsonb,false)
on conflict (key, channel) do nothing;
