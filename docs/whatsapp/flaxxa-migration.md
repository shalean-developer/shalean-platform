# FlaxxaWapi provider migration

Shalean keeps booking, dispatch, consent, queueing, idempotency and audit logic in the platform. FlaxxaWapi is the configured WhatsApp transport/inbox provider.

## Verified Flaxxa API contract

The Flaxxa public API uses `https://wapi.flaxxa.com` as its base URL. JSON POST endpoints receive the brand API token in the JSON body as `token`; Flaxxa does not use a Bearer Authorization header for these message endpoints.

Verified message endpoints:

- `POST /api/v1/sendmessage` — free-form/session message, only inside the WhatsApp 24-hour customer-service window.
- `POST /api/v1/sendtemplatemessage` — approved template message, including notifications/marketing outside the 24-hour window.
- `POST /api/v1/get_message_response` — delivery status reconciliation by Flaxxa `message_id`.

The default API throttle is 60 requests/minute/token.

## Required production environment

```bash
WHATSAPP_PROVIDER=flaxxa
FLAXXA_WAPI_API_KEY=<copy from Flaxxa Developer/API Info>
FLAXXA_WAPI_BASE_URL=https://wapi.flaxxa.com
FLAXXA_WAPI_SEND_TEXT_PATH=/api/v1/sendmessage
FLAXXA_WAPI_SEND_TEMPLATE_PATH=/api/v1/sendtemplatemessage
FLAXXA_WEBHOOK_SECRET=<generate a random 32-byte/64-hex secret>
FLAXXA_WEBHOOK_SECRET_HEADER=x-webhook-secret
```

Do not reuse `FLAXXA_WAPI_API_KEY` as the webhook secret.

## Webhook secret

Flaxxa's public API documentation does not define a separate provider-issued webhook signing secret. Shalean therefore uses an application-owned random secret to prevent arbitrary callers from invoking the Flaxxa adapter route.

Generate one locally, for example in Windows PowerShell:

```powershell
$bytes = New-Object byte[] 32
[Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
[Convert]::ToHexString($bytes).ToLower()
```

Store the generated value in Vercel as `FLAXXA_WEBHOOK_SECRET`. Do not commit it to GitHub.

## Webhook

Configure Flaxxa to send webhooks to:

```text
https://shalean.co.za/api/webhooks/flaxxa-whatsapp?token=<FLAXXA_WEBHOOK_SECRET>
```

If Flaxxa later supports configurable outbound webhook headers, prefer:

```text
x-webhook-secret: <FLAXXA_WEBHOOK_SECRET>
```

The query-token form exists because the current Flaxxa webhook UI accepts a destination URL and may not support custom headers.

The webhook records raw events, deduplicates provider events, updates sent/delivered/read/failed states, handles cleaner operational replies when reply context is present, and records customer `YES`/`STOP` marketing consent.

## Safety

Do not disable the existing Meta code or Meta webhook until Flaxxa send and inbound tests pass. The provider resolver defaults to Meta unless `WHATSAPP_PROVIDER=flaxxa` is explicitly set.

A generic cleaner `YES`/`NO` reply without a provider reply-context id is intentionally ignored for dispatch offers. This avoids assigning the wrong booking when a cleaner has multiple pending offers.

## Cutover tests

1. Keep `WHATSAPP_PROVIDER=meta` while configuring the Flaxxa credentials and webhook secret.
2. Test the current Flaxxa plan/API token with one approved customer template. HTTP `403` means the plan lacks API access or WhatsApp is not configured.
3. Send one customer session text during an open 24-hour conversation.
4. Confirm the returned Flaxxa `message_id`/`message_wamid` is stored.
5. Confirm sent, delivered and read states update `whatsapp_queue` (webhook and/or status reconciliation).
6. Send one cleaner assignment to a test cleaner using an approved template.
7. Confirm reply context reaches `/api/webhooks/flaxxa-whatsapp`.
8. Test accept, decline, expired offer and already-taken offer behavior.
9. Test duplicate webhook delivery; the second event must be harmless.
10. Test customer `YES` and `STOP` consent updates.
11. Only then set `WHATSAPP_PROVIDER=flaxxa` in Production.
