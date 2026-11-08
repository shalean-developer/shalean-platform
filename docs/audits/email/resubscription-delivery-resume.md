# Consent delivery resume — 8 November 2026

Requirement: after the customer explicitly subscribes again, restore local promotional eligibility when the provider already agrees. Preserve consent history, suppression and stale-link protections.

The customer POST first records the explicit grant through the existing atomic consent transaction. A new helper then reads provider contact and suppression state without writing to Resend. Only an explicitly subscribed, unsuppressed, verified result permits a service-role-only resume RPC. Missing provider configuration, outage, missing contact, provider opt-out or suppression keeps delivery paused.

The RPC locks the customer and unsubscribe job, checks current generation and the exact latest authenticated grant evidence, and refuses local suppression, newer job changes or any processing job (including expired leases). It marks an obsolete pending unsubscribe completed with a reference to the superseding consent event, then clears the local hold in the same transaction. It does not change generation, consent evidence or provider state. A later withdrawal wins and requeues reconciliation. Normal send-time provider checks remain mandatory.

Scope: customer preference POST, read-only provider helper, one additive RPC, synthetic tests and CI registration. No broad enrollment, provider resubscription, suppression removal, worker scheduling or production activation. Provider opt-outs intentionally remain paused for separate review; this release restores the verified-provider-subscribed path observed in the approved inbox test.

Validation: helper deny/error cases; disposable PostgreSQL migration, permission, generation/evidence, suppression, queue fencing, rollback, idempotence and later-withdrawal checks; native two-session races for resume versus withdrawal and worker claim versus resume. Required repository CI remains the release gate.

Staging activation requires approval for this PR's merge after green CI, the additive staging migration and Plesk deployment. Apply only to the independently verified staging database. Retain existing rollback directories and private loader. Then have the approved customer explicitly Subscribe again, check the old generation's link is rejected, current eligibility returns, and perform at most one approved restricted delivery test if needed. Do not change consent through ad-hoc profile updates.

Rollback: restore the retained previous application runtime. The additive RPC can remain unused; revoking service-role EXECUTE disables it if necessary. Do not roll back or delete customer consent evidence, and do not apply a broad data backfill.

Decision: CONDITIONAL PASS for source review; staging and production acceptance remain open until their own evidence is recorded. References: #1076.
