# Dashboard lifecycle E2E (Gap 4)

## Specs

| File | Behavior |
|------|----------|
| `completion-lifecycle.spec.ts` | After auto-dispatch load-test booking, **admin PATCH** `status: completed`, then asserts customer + admin `operationalPhase === completed`, `completed_at`, and customer `payoutState` is one of the contract enums. Skips if cleaner JWT does not match assigned cleaner (dashboard visibility) or PATCH fails earnings integrity. |
| `retry-fallback.spec.ts` | Permanently skipped placeholder — TTL-driven offer expiry / retry / fallback is covered by unit tests (`lib/dispatch/userSelectedOfferExpiryRetry.test.ts`, `redispatchAfterOfferReject.test.ts`), not stable Playwright timing. |

## Env

Uses the same variables as `e2e/dispatch/README.md` (`E2E_DISPATCH`, secrets, JWTs).

```bash
npm run test:e2e -- e2e/dashboard
```
