# Member invoice candidate fixture

Follow-up verification for #946; production promotion remains pending.

Runs the actual roster/team candidate functions through a narrow SQL adapter. Remote mode clones selected staging column types into TEMP tables, writes only pg_temp.audit946_* fixtures, then rolls back and asserts cleanup. No operational triggers, generator, accounting or provider writes run.

Ten checks: paid member-only invoice inclusion, unpaid/refunded exclusion and injected invoice lookup failure for both rails; October closure; rollback cleanup. Original member tests cover booking/member lookup failures separately.

Isolated mode: externally installed PGlite via AUDIT_PGLITE_MODULE, then `npm run audit:payout-members -- --isolated`.
Remote mode: locally configured AUDIT_STAGING_DATABASE_URL, SHALEAN_APP_ENV=staging, distinct private AUDIT_STAGING_REF and SUPABASE_PROD_REF, externally installed pg via AUDIT_PG_MODULE. Exact approved staging host/user only; TLS certificate validation required. Never share connection URLs or credentials.

Evidence: ten isolated PostgreSQL checks pass. Remote execution remains pending: the connected SQL tool does not expose a client connection for this TypeScript process. An isolated pass is not a remote pass. This checks candidate/schema integration, not end-to-end web batch creation. Owner-supplied live SHA and UI smoke are separate evidence in #946.

All URL query parameters/fragments are rejected. The pg client receives explicit validated connection fields, never a connectionString that could override hostname or TLS. No live project references are embedded in this harness or its tests.
