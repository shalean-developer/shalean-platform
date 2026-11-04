# PR #1049 Passenger environment preflight — preparation only

Source pinned for this review: `30fa54ce50b322273b0434e6ea35afc6148edaff`.
Target: `pr1049-test.shalean.co.za`. Git runtime currently deployed/extracted at `/pr1049-test.shalean.co.za/release-30fa54ce-git-v1`.

## Explicit authorization boundary
- This change is an isolated diagnostic proposal, **not** authorization to deploy it, change `server.js`, change the Plesk application root, create a scheduled task, or click **Enable Node.js**.
- The existing Git deployment artifact is immutable and **does not include** the diagnostic added by this branch.
- The diagnostic is pure: no third-party imports, no Shalean app imports, no network calls, no listening socket, no file writes, and no environment values logged. It exits nonzero for any failed check.
- Its output is limited to fixed check names and PASS/FAIL. It verifies required staging values and forbidden credential absence. Unexpected sensitive-name variables fail without displaying their names or values.
- This is not a security sandbox. A failure from an unrelated shell/npm process does not establish what Passenger sees. A PASS outside Passenger does **not** certify Passenger.
- Passenger runtime verification would require a separately reviewed temporary startup harness (using a safe, non-app process) and a separately authorized activation. Password protection must be independently rechecked after activation and the process must be stopped if a gate fails.
- A testing process that only exits will not serve requests, so a real Passenger exercise must account for Passenger's startup expectations without loading the business app. No such activation harness is included in this change.

## Synthetic tests
Run `node --test apps/web/scripts/pr1049-passenger-env-preflight.test.cjs` from repository root. No credentials or network required. Covers valid staging values, missing environment, production URL mismatch, privileged payment key, unknown secret, outbound enabled, and blank credential.

## Remaining evidence
Independent PR review, latest-head CI, controlled Passenger runner design, authenticated and unauthenticated HTTP checks after any authorized activation, source-to-runtime evidence, and rollback readiness. No payment, database, cron, or provider activity is authorized.

## Proposed Passenger canary design (design only, NOT AUTHORIZED)
**Goal:** Verify the environment as actually delivered to a Passenger-owned process while ensuring **zero Shalean application imports, database/provider access, payment processing, notifications, cron invocation, or customer UI**.

1. **Preparation:** Independently review the pure preflight and the dedicated GitHub synthetic-test workflow. Confirm latest head CI. Record current Plesk Node dashboard settings, protected-directory `/`, two unauthenticated 401 checks, and rollback settings. Confirm no shared-domain or provider webhook points to the preview.
2. **Separate canary directory:** Prepare a new private sibling directory (not the live application root, current release, Git-managed source, or document root). It would contain only the reviewed `pr1049-passenger-env-preflight.cjs`, a minimal built-in Node `http` canary entrypoint, and an inert public directory. No full Next.js build, `node_modules`, `.env`, credentials or external modules.
3. **Canary process contract:** On startup, call the pure preflight directly on `process.env`. It must emit fixed PASS/FAIL labels without values. Only if all checks pass should it initialize a minimal HTTP responder. A failing preflight must exit nonzero and never listen. The responder must always use fixed responses, reject every non-probe route with 404 or 503, set `Cache-Control: no-store`, `X-Robots-Tag: noindex, nofollow`, and must not log request headers, cookies, query strings or bodies. Avoid any response that enumerates credentials or system information.
4. **Passenger compatibility gate:** Validate the exact Plesk/Passenger Node.js listening contract in a disposable, network-isolated test, e.g. whether the runner supplies `PORT` or Passenger-specific socket binding. Do not guess the port, alter `server.js`, or activate on the production/shared staging applications. A process executed through npm/scheduler cannot substitute for Passenger evidence.
5. **Separately approved activation:** Only after explicit owner approval and documented rollback, temporarily target the canary on the dedicated preview Plesk Node.js configuration; **do not overwrite `release-30fa54ce-git-v1/server.js`**. Confirm document root and Plesk Protected Directories remain applicable *before* enabling. Limit the test to the dedicated preview host.
6. **External authentication test first:** Request `/`, `/api/health`, `/api/paystack/initialize`, `/api/paystack/webhook`, `/api/webhooks/paystack`, and `/api/cron/send-invoice-reminders` **without credentials** and require 401 for all; test safe GET/HEAD and bounded malformed POSTs, never valid transactions or webhook deliveries. If any returns other than 401, stop immediately and disable Node.js.
7. **Inside-application attestation:** Read only the Passenger-startup PASS/FAIL output from Plesk logs, with no env values, and a fixed authenticated canary response. Require an independently observed PASS. Confirm no outbound connections, provider callbacks, app imports, or unexpected writes.
8. **Rollback:** Disable the dedicated preview Node.js process, restore the recorded prior Node.js application root, document root, startup filename, and mode. Recheck root-path password protection and 401 responses. Preserve checksum/source evidence and logs with secrets redacted. No normal business app activation is authorized by a canary PASS.

**Stop conditions:** missing or incorrect staging values, any forbidden or unexpected sensitive variable present, any public route bypassing the Plesk 401 gate, canary startup failures, any unplanned outbound/provider event, or an inability to guarantee safe rollback.

**Limitations:** The source-level preflight cannot certify inherited environment variables, network isolation, absence of all conceivable credentials, or external side effects. Plesk's password protection may be implemented at a layer affected by document-root or Passenger routing changes. The canary exercise must be separately approved and monitored. `NODE_ENV=production` is normal Next.js/Passenger runtime mode and does not itself mean the business target is production. The exact PR #1049 release stays unmodified.

## CI gate
A dedicated `.github/workflows/pr1049-passenger-preflight-test.yml` runs the seven synthetic tests and proves the diagnostic fails closed when invoked with an empty environment. It does not deploy or run Passenger. Review its resulting GitHub Actions job separately from the broader web-test and migration-governance checks.
