# Email marketing staging acceptance — issue #1076

## Scope and authority

The owner requested completion of the email-marketing plan and staging deployment, followed by a test handoff. This release completes the remaining consent-link customer experience, staging acceptance journey, provider-webhook transaction and read-only health safeguards. Existing campaign drafts, lifecycle templates, consent/send gate, delivery history, suppressions, reconciliation workers and retry controls are retained and connected through Office → Marketing → Email.

This is a **no-send staging release**. It does not authorize production deployment, real customer messages, provider contact updates, production webhook activation, scheduler activation, signing-secret changes or final owner acceptance. Campaign optimisation and production activation require their own decisions after acceptance; a generated draft is never evidence of delivery.

## End-to-end path

Campaign/draft review → verified customer consent → consent ledger and enrollment queue → suppression/provider-state eligibility → guarded promotional submission → signed unsubscribe confirmation → atomic withdrawal and reconciliation → delivery/webhook history → retry/recovery → fresh explicit consent revokes previous-generation links.

- Booking confirmations, payment receipts and security notices retain their independent transactional path.
- Recording a new grant does not silently lift an existing CRM/provider opt-out. The profile now distinguishes **consent recorded, delivery paused** after reload. Provider re-permission is not inferred from a booking, an unchecked field or a missing opt-out.
- Health GET is read-only. It never sends a provider probe and never returns key fragments.
- Provider preference withdrawals now use a service-role-only, customer-row-locked transaction. Duplicate events preserve evidence/timestamps; partial projection recovery is atomic; an already-seen old event cannot reapply over a later grant.
- Growth retention/win-back and lifecycle sends use the central safe sender. All five promotional message types require current consent and one verified recipient. Conflicting type tags fail closed. Growth email denial or ambiguous failure no longer triggers promotional SMS fallback; phone-only primary SMS retains its separate existing policy.
- Provider HTTP calls have bounded timeouts and remain retryable/fail-closed on failure.

## Owner staging test

1. Open `/office/marketing/email` with an authorized Office account. Review the campaign/delivery links and the paused-delivery notice. MFA remains required; there is no test bypass.
2. As the verified Office Owner, open `/office/marketing/email/test` (the old `/account/email-test` handoff link redirects here). The existing `system.settings` permission and Office email verification are required. The separate synthetic customer entry remains `/account/email-rehearsal`, linked from that test customer's profile.
3. Check the explicit authorization for synthetic fixture changes, then choose **Run no-send end-to-end checks**.
4. The page executes and reports each result only after real HTTP/state checks: signed GET no mutation; legacy GET/POST non-mutation; current withdrawal; repeat replay; completed queue preservation; active processing claim/lease preservation; partial profile recovery; generation advance on fresh grant; used and previously unused old-link rejection; fresh-link withdrawal; tampered signature rejection.
5. The synthetic account must finish withdrawn. A failed test is not a PASS; failed cleanup is visibly reported. No messages are submitted and no provider contact is written.
6. Optionally open the current confirmation link to review its accessible browser page. A form submission returns a customer-friendly success/error page; one-click/API callers retain JSON/status compatibility.

The Office route runs only against the pinned synthetic customer; grants and cleanup never call the Office user's personal preferences API. A server-owned actor reference is included in synthetic consent evidence. The customer endpoint still requires the exact fixture identity.

The pages and APIs require the staging environment, exact staging database, disabled outbound messaging and disabled provider writes. Customer access requires a server-verified confirmed email and the pinned synthetic customer identity. Office access requires existing Owner authority, `system.settings`, and normal Office email verification; every operation still targets the same pinned synthetic UUID/email. Caller-selected identities, unknown operations, another request origin and every production configuration fail closed. The fixture API cannot replace an unrelated processing claim. Consent evidence remains append-only and generation never resets.

Synthetic fixture: `6b891181-1822-44ee-b713-24b213db540a`, `marketing-acceptance-20261105@example.test`. This is an existing reserved-domain test account, not a customer or a new credential. No signing key is exposed; signed test links stay within staging and must not be pasted into public issue evidence.

## Automated verification

- Existing marketing/transactional, referral/lifecycle, identity, suppression, retry, UI and route suites remain required.
- Added confirmed-email authorization, read-only health, fixture isolation, browser-form/stream-size and actual Resend SDK webhook-signature tests.
- Joined synthetic provider tests cover 429/503, ambiguous contact creation, segment failure/retry, withdrawal-before-retry and transactional preservation. Provider transport is simulated and explicitly identified as such.
- Native PostgreSQL 17 CI applies both consent migrations plus the provider withdrawal migration to a disposable database only. It tests replay, leases, partial recovery, grants, actual service-role execution, transaction rollback and three actual two-session cases (duplicate signed withdrawal, grant versus unused old token, duplicate provider withdrawal).
- The concurrency controller uses a bounded SQL signal loop; no orphanable external shell wait. It proves an actual lock wait, checks both outcomes/evidence counts and verifies backend session cleanup.
- Typecheck, required lint, production Webpack build and exact-commit served crawl/route checks remain required. A YAML step, queued run, skipped job or mocked transport is never reported as an executed hosted/provider check.

## Deployment and rollback

Apply only the reviewed provider-withdrawal migration to the confirmed staging project after native CI passes, then activate the matching artifact with the existing staging safety metadata checks. Preserve every rollback directory. No bulk seed, production SQL, test fixture SQL or signing-key change is part of deployment.

Retain the ledger, generations and grants on rollback. Do not restore the seven-argument consent RPC or a webhook writer that bypasses row locking. Prefer a forward application correction; keep provider activation disabled throughout. Any fixture-processing state left by an interrupted test is isolated to the synthetic account and must be reviewed before restarting that test.

## Evidence and acceptance

Exact commits, native CI logs, hosted checks, safety read-backs and remaining limitations belong in canonical GitHub issue #1076. The new candidate is prepared until those tests actually execute. Staging test readiness is separate from owner acceptance and production release. The owner performs final customer-experience/policy acceptance after the test handoff.

## Manage preferences from an Owner session
The unsubscribe page’s existing `/account/profile` link preserves the customer profile for customers. On the exact staging host, a server-resolved admin role is handed to `/office/marketing/email/preferences`, where the existing Owner permission and Office MFA apply. The page and fixture API fail closed outside the safe staging environment. Explicit authorization is required for each synthetic preference change, and persisted status is reloaded after saving (including delivery paused after re-consent). No operator personal consent is modified; no provider writes or emails are enabled. Other account pages, cleaners and production role redirects are unchanged.
