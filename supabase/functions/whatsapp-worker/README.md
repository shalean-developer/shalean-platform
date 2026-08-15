# whatsapp-worker (retired)

CR-07A retired this duplicate Supabase Edge Function implementation.

## Canonical production worker

Production WhatsApp queue processing is owned by:

- `apps/web/app/api/cron/whatsapp-worker/route.ts`
- `apps/web/lib/whatsapp/providerQueue.ts`

That path is provider-aware (`WHATSAPP_PROVIDER`) and supports the current Meta/Flaxxa migration model. Production `pg_cron` calls the Next.js route through `public.invoke_nextjs_cron('/api/cron/whatsapp-worker')`.

## Why this Edge Function was retired

This function duplicated queue claiming, retry, Meta delivery, locking, and observability logic while production was not invoking it. Keeping two worker implementations made future cost/reliability changes unsafe because behavior could drift or an operator could accidentally cut back to the Meta-only worker.

The executable files were removed in CR-07A. Do not redeploy `supabase functions deploy whatsapp-worker`.

Historical Edge-worker migrations/runbooks remain archived under legacy/history locations only. New WhatsApp worker changes must target the canonical Next.js provider queue path above.
