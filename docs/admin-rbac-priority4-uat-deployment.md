# Admin RBAC Priority 4 — Final UAT Deployment

This branch is a dedicated, disposable UAT deployment based on the fully verified Priority 4 `main` state.

- Verified base commit: `d4281df12ca376ee7446b3f35c6e2f7717ac09e0`
- Purpose: run the final eight-role RBAC acceptance journeys without merging the diverged long-lived `staging` branch.
- Safety: no permission widening, no production code change, and no staging-history rewrite.
- Completion rule: Priority 4 is not complete until the eight role journeys have recorded PASS evidence.
