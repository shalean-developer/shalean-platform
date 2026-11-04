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
