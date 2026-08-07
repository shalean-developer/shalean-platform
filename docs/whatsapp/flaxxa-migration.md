# FlaxxaWapi provider migration

Shalean keeps booking, dispatch, consent, queueing, idempotency and audit logic in the platform. FlaxxaWapi is the configured WhatsApp transport/inbox provider.

## Required production environment

```bash
WHATSAPP_PROVIDER=flaxxa
FLAXXA_WAPI_API_KEY=...
FLAXXA_WAPI_BASE_URL=https://wapi.flaxxa.com/api
FLAXXA_WAPI_AUTH_HEADER=Authorization
FLAXXA_WAPI_AUTH_SCHEME=Bearer
FLAXXA_WAPI_SEND_TEXT_PATH=/messages/send
FLAXXA_WAPI_SEND_TEMPLATE_PATH=/messages/template
FLAXXA_WEBHOOK_SECRET=...
FLAXXA_WEBHOOK_SECRET_HEADER=x-webhook-secret
```

`FLAXXA_WAPI_SEND_TEXT_PATH`, `FLAXXA_WAPI_SEND_TEMPLATE_PATH`, authentication header and scheme are deliberately configurable so production can be aligned with the exact Flaxxa public API contract without another code release.

## Webhook

Configure Flaxxa to send webhooks to:

```text
https://shalean.co.za/api/webhooks/flaxxa-whatsapp?token=<FLAXXA_WEBHOOK_SECRET>
```

Prefer a webhook secret header if Flaxxa supports custom headers. The query-token form exists because some webhook dashboards only accept a URL.

The webhook records raw events, deduplicates provider events, updates sent/delivered/read/failed states, handles cleaner operational replies when reply context is present, and records customer `YES`/`STOP` marketing consent.

## Safety

Do not disable the existing Meta code or Meta webhook until Flaxxa send and inbound tests pass. The provider resolver defaults to Meta unless `WHATSAPP_PROVIDER=flaxxa` is explicitly set.

A generic cleaner `YES`/`NO` reply without a provider reply-context id is intentionally ignored for dispatch offers. This avoids assigning the wrong booking when a cleaner has multiple pending offers.

## Cutover tests

1. Send one customer template through Flaxxa.
2. Send one customer session text during an open conversation.
3. Confirm sent, delivered and read webhook states update `whatsapp_queue`.
4. Send one cleaner assignment to a test cleaner.
5. Confirm reply context reaches `/api/webhooks/flaxxa-whatsapp`.
6. Test accept, decline, expired offer and already-taken offer behavior.
7. Test duplicate webhook delivery; the second event must be harmless.
8. Test customer `YES` and `STOP` consent updates.
9. Only then set `WHATSAPP_PROVIDER=flaxxa` in Production.
