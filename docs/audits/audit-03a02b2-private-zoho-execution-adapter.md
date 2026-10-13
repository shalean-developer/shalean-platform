# AUDIT-03A-02B.2 — Private Zoho execution adapter gate

Status: **DESIGN / HOLD**. No deployment or production Zoho execution authorized.

## Proven source of truth

- PR #926 carries `apps/web/scripts/auditZohoCleanerSettlements03a02b2.ts`, the exact 11-booking, six-cleaner, June–July 2026 **candidate evidence** audit.
- `apps/web/lib/zoho/zohoBooksClient.ts` is the server-only OAuth Books client; production organization is `927500285`. Refresh-token access requires secure runtime configuration. The token refresh itself is an OAuth POST; **only accounting data reads are GET**.
- `.github/workflows/prebuilt-plesk-staging.yml` builds standalone Next.js from `main` and packages `.next/standalone/apps/web`, public/static assets and metadata, not arbitrary TS scripts or the `tsx` runtime.
- `scripts/plesk-activate-prebuilt-pricing-test.sh` extracts and swaps the runtime directory; staging health checks enforce SHA, ref, test Paystack, disabled outbound.
- `.github/workflows/prebuilt-plesk-production.yml` builds from `production` and packages the same class of standalone runtime.
- Existing `requireAdminPermissionFromRequest` supports bearer authenticated admins, a session-bound office verification cookie and per-permission RBAC, but a new HTTP route is still an expanded remote execution surface and is **not** the default.

## Design decision

Prefer a **private, one-shot command artifact** outside all public/static web directories, executed by a privileged operator within the existing Plesk subscription. Do **not** add an unauthenticated route, trigger a manual GitHub deployment, or assume that app-serving Node.js can execute TS source.

A release-compatible adapter needs all of the following before implementation:
1. Determine the exact installed Plesk runtime directory, Node executable and whether an operator-only command facility (subscription task / restricted shell) can start a non-HTTP process with **the same Zoho environment variables**; do not print secrets.
2. Produce a runnable, self-contained/validated command artifact in CI, with package dependencies and `server-only` condition handled, and with a cryptographic checksum tied to the source SHA. No secrets in build outputs.
3. Publish via existing **automatic** `main -> deploy/staging` and `production -> deploy/production` pipelines only after CI and Codex. The private executable must never be in `public`, static assets or a publicly served document root.
4. A hard preflight must verify production URL protocol/host, exact Zoho org/hosts, run opt-in, immutable 11-ID allowlist, date window and command artifact SHA **before any API request**.
5. Use GET-only Books data endpoints, production Supabase SELECT-only queries and no application-data mutations. A Zoho OAuth refresh is a token POST, not an accounting write.
6. Redact logs: no tokens, bank account numbers, full names or transaction references in shared deployment logs. Keep any detailed matching evidence in restricted storage; no public downloads.
7. Reconcile production payout evidence separately. A matched Zoho expense, categorized transaction or missing match is **not** settlement proof.
8. Capture pre/post state checks and command exit code; remove or disable the one-shot adapter after bounded audit closeout.

## Explicit blockers / no-go

- The current prebuilt bundle does **not** establish script executability; merely merging PR #926 would not enable the script.
- Plesk secret availability to a private child process is **not yet proven**.
- Do not quietly create a public API endpoint or insert an admin privilege shortcut.
- Do not copy production credentials into GitHub Actions, local PowerShell or chat.
- Do not use staging Supabase as a substitute for production payment evidence.
- Do not run cleaner-ledger repair or change settled payouts.
- Avoid a second-stage migration or deployment until the execution mechanism is verified as bounded and reviewable.

## Audit closure gates

Audit -> source truth -> adapter implementation -> static/security tests -> isolated command mock -> automated staging deployment -> private staging runtime/no-write verification -> explicit production-read-only authorization -> Zoho evidence query -> bank/EFT reconciliation -> decide repair independently.
