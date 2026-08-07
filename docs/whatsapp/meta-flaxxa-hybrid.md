# Meta + Flaxxa hybrid WhatsApp setup

Shalean uses Meta WhatsApp Cloud API for system-critical operational messaging and FlaxxaWapi for customer marketing and shared-inbox workflows.

## Production routing

Keep the Shalean platform provider set to Meta:

```bash
WHATSAPP_PROVIDER=meta
```

This keeps cleaner booking offers, cleaner accept/decline replies, booking confirmations, reminders, payment/operational notifications, retries, and delivery tracking on the existing Meta integration.

The provider resolver defaults to Meta unless `WHATSAPP_PROVIDER=flaxxa` is explicitly set.

## Flaxxa responsibilities

Use FlaxxaWapi separately for:

- marketing campaigns and broadcasts
- past-customer reactivation
- legacy-contact consent requests
- contact groups and segmentation
- shared customer inbox / agents
- marketing bots and flows

Do not depend on Flaxxa Public API access for core booking operations while the current Flaxxa plan does not expose a usable API token.

## Flaxxa webhook

For the current hybrid setup, do not configure Flaxxa to send inbound webhooks to `/api/webhooks/flaxxa-whatsapp` unless Public API/webhook integration is intentionally being tested again.

The route remains in the codebase for a future full-provider integration. Keeping the route does not switch Shalean away from Meta.

If a future test is enabled, secure it with `FLAXXA_WEBHOOK_SECRET` and do not reuse the Flaxxa API token as the webhook secret.

## Marketing operating rule

Flaxxa contacts and campaigns are a marketing workspace, not the Shalean operational source of truth. Customer booking status, cleaner allocation, dispatch, consent records, payments and operational messaging remain governed by Shalean/Supabase.

Before sending marketing messages:

1. Exclude cleaners, staff, test contacts, opted-out contacts and duplicates.
2. Use confirmed past customers for reactivation promotions.
3. Use a consent-request template for legacy contacts whose customer history cannot be verified.
4. Process STOP/opt-out requests immediately in Flaxxa and in the Shalean marketing records when manually reconciled.
5. Avoid sending the same campaign simultaneously through Meta and Flaxxa.

## Future full Flaxxa migration

The full Flaxxa provider implementation from PR #192 remains available. Only reconsider a cutover after all of these are true:

- full Flaxxa API token access is available
- outbound template and session sends pass
- inbound webhooks pass authentication
- delivery/read status mapping passes
- cleaner booking accept/decline context is proven end-to-end
- duplicate and expired-offer tests pass

Until then, Meta is the production transport and Flaxxa is the marketing/inbox layer.
