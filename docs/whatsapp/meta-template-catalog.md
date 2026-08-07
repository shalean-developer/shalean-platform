# Shalean Meta WhatsApp Template Catalogue

Status: internal catalogue prepared; Meta approval remains external.

## Safety rules

- A Supabase `templates` row is not proof of Meta approval.
- Newly added WhatsApp rows are intentionally inactive until the matching Meta template is approved.
- Do not change live send behaviour merely because a row exists.
- Use the exact variable order below when creating the Meta template.
- Default language is `en`.
- All operational templates below should be submitted as **Utility** templates unless Meta reclassifies them.

## Customer templates

| Internal / default Meta name | Variables in exact order | Purpose |
|---|---|---|
| `booking_confirmed` | `customer_name`, `date`, `time`, `price` | Booking confirmation |
| `payment_request` | `customer_name`, `booking_id`, `amount`, `payment_link` | Payment required |
| `payment_confirmed` | `customer_name`, `booking_id`, `amount` | Payment receipt confirmation |
| `booking_reminder_24h` | `customer_name`, `date`, `time`, `service` | 24-hour reminder |
| `customer_booking_assigned` | `customer_name`, `cleaner_name`, `date`, `time` | Cleaner/team assignment notice |
| `booking_rescheduled` | `customer_name`, `booking_id`, `date`, `time` | Reschedule notice |
| `booking_cancelled` | `customer_name`, `booking_id`, `date` | Cancellation notice |
| `job_completed` | `customer_name`, `booking_id` | Completion notice |
| `review_prompt` | `customer_name`, `review_link` | Post-service review request |

## Cleaner templates

| Internal / default Meta name | Variables in exact order | Purpose |
|---|---|---|
| `booking_offer` | `cleaner_name`, `location`, `date`, `time`, `pay` | New job offer |
| `offer_ack` | `line` | Offer response acknowledgement |
| `booking_assigned` | `location`, `date`, `time` | Confirmed job assignment |
| `reminder` | `location`, `time` | Cleaner job reminder |
| `escalation` | `location`, `time`, `booking_id` | Urgent dispatch escalation |
| `cleaner_welcome` | `line` | Cleaner onboarding welcome |
| `cleaner_approved` | `line` | Cleaner approval notice |
| `cleaner_booking_changed` | `booking_id`, `date`, `time`, `location` | Booking details changed |
| `cleaner_booking_cancelled` | `booking_id`, `date`, `location` | Cleaner cancellation notice |

## Suggested Meta bodies

Meta requires numeric placeholders such as `{{1}}`. The application maps values by the variable order above.

### booking_confirmed

`Hi {{1}}, your Shalean cleaning is confirmed for {{2}} at {{3}}. Total: {{4}}.`

### payment_request

`Hi {{1}}, payment is required for booking {{2}}. Amount: {{3}}. Pay securely here: {{4}}`

### payment_confirmed

`Hi {{1}}, we have received payment for booking {{2}}. Amount received: {{3}}. Thank you.`

### booking_reminder_24h

`Hi {{1}}, reminder: your {{4}} cleaning is booked for {{2}} at {{3}}. We look forward to serving you.`

### customer_booking_assigned

`Hi {{1}}, {{2}} has been assigned to your Shalean booking on {{3}} at {{4}}.`

### booking_rescheduled

`Hi {{1}}, booking {{2}} has been rescheduled to {{3}} at {{4}}.`

### booking_cancelled

`Hi {{1}}, booking {{2}} for {{3}} has been cancelled. Contact Shalean if you need help rebooking.`

### job_completed

`Hi {{1}}, booking {{2}} has been marked complete. Thank you for choosing Shalean Cleaning Services.`

### review_prompt

`Hi {{1}}, thank you for choosing Shalean. Please share your feedback here: {{2}}`

### booking_offer

`Hi {{1}}, new Shalean job available. {{2}} · {{3}} · {{4}} · {{5}}. Reply 1 to ACCEPT or 2 to DECLINE.`

### offer_ack

`{{1}}`

### booking_assigned

`Shalean job assigned: {{1}} · {{2}} · {{3}}. Please arrive on time and follow the booking instructions.`

### reminder

`Reminder: you have a Shalean job at {{1}} at {{2}}. Contact your supervisor immediately if there is an issue.`

### escalation

`Urgent Shalean job {{3}} needs attention at {{1}} · {{2}}. Reply if you can assist.`

### cleaner_welcome

`{{1}}`

### cleaner_approved

`{{1}}`

### cleaner_booking_changed

`Booking {{1}} has changed. New details: {{2}} · {{3}} · {{4}}. Check the Shalean app before travelling.`

### cleaner_booking_cancelled

`Booking {{1}} for {{2}} at {{3}} has been cancelled. Do not travel to the job unless Shalean reassigns it.`

## Environment mappings

The canonical internal key is also the default Meta template name. If Meta approves a different name, configure the appropriate environment variable instead of changing the product key:

- `WHATSAPP_TEMPLATE_BOOKING_CONFIRMED`
- `WHATSAPP_TEMPLATE_PAYMENT_REQUEST`
- `WHATSAPP_TEMPLATE_PAYMENT_CONFIRMED`
- `WHATSAPP_TEMPLATE_BOOKING_REMINDER_24H`
- `WHATSAPP_TEMPLATE_CUSTOMER_BOOKING_ASSIGNED`
- `WHATSAPP_TEMPLATE_BOOKING_RESCHEDULED`
- `WHATSAPP_TEMPLATE_BOOKING_CANCELLED`
- `WHATSAPP_TEMPLATE_JOB_COMPLETED`
- `WHATSAPP_TEMPLATE_REVIEW_PROMPT`
- `WHATSAPP_TEMPLATE_BOOKING_OFFER`
- `WHATSAPP_TEMPLATE_OFFER_ACK`
- `WHATSAPP_TEMPLATE_BOOKING_ASSIGNED`
- `WHATSAPP_TEMPLATE_REMINDER`
- `WHATSAPP_TEMPLATE_ESCALATION`
- `WHATSAPP_TEMPLATE_CLEANER_WELCOME`
- `WHATSAPP_TEMPLATE_CLEANER_APPROVED`
- `WHATSAPP_TEMPLATE_CLEANER_BOOKING_CHANGED`
- `WHATSAPP_TEMPLATE_CLEANER_BOOKING_CANCELLED`

## Activation process

For each template:

1. Create it in Meta WhatsApp Manager using the exact variable order above.
2. Wait for Meta status `Approved`.
3. If Meta approved a different template name, set its environment mapping in Vercel.
4. Test from `/office/notification-logs` using **Approved template**.
5. Confirm provider acceptance and a delivery webhook.
6. Only then activate/wire the corresponding Shalean lifecycle trigger.

This order prevents an unapproved template from breaking booking or cleaner operations.
