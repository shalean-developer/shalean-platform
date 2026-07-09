# whatsapp-worker

**Phase:** 1 — Priority 1  
**Schedule:** `* * * * *` (every minute)  
**Replaces:** `apps/web/app/api/cron/whatsapp-worker/route.ts`

## Responsibility

Drain `whatsapp_queue` pending rows → Meta Cloud API → update status. One batch per invocation.

## Source files to port

| File | Function |
|------|----------|
| `lib/whatsapp/queue.ts` | `processWhatsAppPendingBatch` |
| `lib/dispatch/metaWhatsAppSend.ts` | `sendViaMetaWhatsApp`, `sendViaMetaWhatsAppTemplateBody` |
| `lib/whatsapp/whatsappMetaSafeguards.ts` | Rate limits, circuit breaker |
| `lib/whatsapp/queueTerminalSms.ts` | SMS fallback on terminal failure |
| `lib/notifications/customerPhoneNormalize.ts` | E.164 normalization |

## Queue pattern

```
SELECT * FROM whatsapp_queue WHERE status='pending' AND next_attempt_at <= now()
  ORDER BY priority DESC LIMIT 15 FOR UPDATE SKIP LOCKED
→ send via Meta API
→ UPDATE status (sent | failed | dead)
→ exit
```

## Est. CPU savings

~2.0–2.5 h/month Fluid Active CPU

## Not implemented yet

**Implemented** — see `index.ts`, `processBatch.ts`, `flushJob.ts`. Deploy with:

```bash
supabase functions deploy whatsapp-worker --project-ref <ref>
```

pg_cron still calls Vercel until shadow verification + cutover (runbook).
