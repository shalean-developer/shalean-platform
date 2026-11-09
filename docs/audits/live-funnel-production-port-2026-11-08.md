# Live booking funnel — narrow production source candidate

Owner stopped the redesign and requested defects only in the existing live journey. This candidate starts from production f0099fe51a96ed0eddb4b7447459baec365b6332 and does not merge main wholesale.

Retain the exact production booking UI/components, financial engine, fixture/revenue policy, deployment workflow, provider settings and database. No simplified-flow component or flag is introduced.

Port only screen telemetry, Back-source attribution, URL-query stripping, the small Funnel Intelligence screen table/Paystack label, and the already-staged fixes for observed Service count consistency and avoiding uncorrelated booking-row fallbacks in session conversion. Production's existing API session-correlation and revenue-fixture classification are retained.

Unit/API and live-flow non-mutating browser coverage are included. Full commit history and exact PR-head checks remain, with lazy unrelated blobs to avoid fetching deployment archive history unnecessarily.

DRAFT / NOT AUTHORIZED FOR PRODUCTION MERGE OR DEPLOYMENT. Await the main/staging candidate's exact-head acceptance, this candidate's own CI, and owner production approval. Existing rollback and production verification must be prepared before activation. No bookings, charges, analytics rewrites or environment changes executed.
