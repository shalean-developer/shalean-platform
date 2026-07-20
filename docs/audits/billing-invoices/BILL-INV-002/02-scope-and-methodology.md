# 02 — Scope and Methodology

## In scope

Production pages:

1. `https://shalean.co.za/office/billing`
2. `https://shalean.co.za/office/invoices`
3. Linked invoice detail, payment, PDF, Zoho, Paystack, refund, adjustment, resend, reminder, customer-account, and reconciliation workflows used by those pages

Lifecycle: recurring booking → monthly invoice → adjustments → finalize → Paystack → branded pay page → webhook/verify → ledger → child settlement → Zoho → reminders → refunds → recovery.

## Out of scope / constraints

- No code changes, branches, commits, PRs, migrations, deploys
- No production data writes, no real charges, no refunds, no customer communications
- Authenticated office UI not available (login redirect) — UX audited via source + public routes
- Local `.env.local` points at local/dev Supabase — production DB accessed only via Supabase CLI linked temporarily to `tchayecuvzssixyxlvfu` for aggregate SQL

## Methodology

1. **Production identity** — `GET /api/health/environment` on apex domain
2. **Exact-SHA code review** — repository `HEAD` = production `gitSha`
3. **Architecture inventory** — routes, libs, crons, tables, parallel rails
4. **Control-flow deep read** — initialize / apply / webhook / landing / refund / Zoho / reminders
5. **Masked production SQL** — aggregates and probe counts only
6. **Public browser inspection** — office redirect; `/pay/invoice` without ref
7. **Finding classification** — severity, evidence, impact, remediation, gate relevance

## Parallel systems acknowledged

| Rail | Role |
|------|------|
| Monthly invoices | Primary recurring billing (this audit focus) |
| Per-booking prepaid Paystack | Separate checkout for non-monthly bookings |
| Sales documents | Quotes / ad-hoc invoices (`/pay/doc/…`) |
| Booking Zoho invoice ids | Per-booking accounting fields |

## Limitations recorded

| Limitation | Impact |
|------------|--------|
| No authenticated office session | Cannot screenshot live tabs/KPIs; inferred from code + API loaders |
| No Paystack merchant dashboard access | Session TTL / abandoned checkout rates unknown |
| No Zoho Books live API audit | Sync behaviour from code + `accounting_sync_records` only |
| Supabase MCP unavailable | Used CLI `db query --linked` instead |
| Aggregate-only SQL | Cannot attribute root cause of each of 9 ledger-missing paid invoices without deeper event forensics (deferred) |
