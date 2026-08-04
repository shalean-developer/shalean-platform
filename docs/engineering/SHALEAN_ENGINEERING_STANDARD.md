# Shalean Engineering Standard

**Version:** 1.0  
**Owner:** Farai Chitekedza  
**Applies to:** ChatGPT, Cursor, Codex, GitHub contributors and automation  
**Repository:** `shalean-developer/shalean-platform`

## 1. Purpose

This standard protects production stability, customer and cleaner data, financial integrity and Vercel budget while allowing continuous development.

The default operating principle is:

> Develop freely on one feature branch, validate locally and in GitHub Actions, deploy to staging once when the complete task is ready, and merge to production only after staging acceptance.

## 2. Non-negotiable rules

1. Never develop directly on `main` or `staging`.
2. Work on one existing feature or fix branch for the full task.
3. Do not create extra branches for small follow-up corrections unless the existing branch is unsuitable.
4. Do not push to `staging` after every commit.
5. Do not merge to `main` without passing required checks and staging verification when the change affects runtime behaviour.
6. Do not bypass authorization, maker-checker, audit, payment, earnings or data-integrity controls to make a test pass.
7. Never expose secrets, service-role keys, payment credentials, customer data, cleaner identity data or bank details in code, logs, screenshots, PRs or fixtures.
8. Preserve existing behaviour outside the approved task scope.

## 3. Vercel cost-control rules

Vercel automatic deployments are intentionally limited:

- `main`: production deployment allowed.
- `staging`: staging deployment allowed.
- Feature, fix, Cursor, Codex, audit and documentation branches: Vercel build must be skipped.

Development rules:

- Use local development and GitHub Actions for normal iteration.
- Batch related code changes before pushing.
- Use at most one staging deployment for a completed task unless a verified staging defect requires another.
- Never use Vercel redeploy as a substitute for fixing or testing locally.
- Documentation-only changes must not require a runtime deployment.
- Avoid environment-variable changes unless required; document every change because a redeployment may follow.
- Production redeployments are reserved for approved releases, rollback recovery or urgent incident response.

## 4. Git branching strategy

Approved branch patterns:

- `feat/<clear-feature-name>`
- `fix/<clear-defect-name>`
- `chore/<maintenance-name>`
- `docs/<documentation-name>`
- `audit/<audit-name>`

Workflow:

1. Start from the latest `main`, unless continuing an already approved branch.
2. Keep the task on one branch.
3. Pull or rebase from `main` only when needed to resolve drift before final review.
4. Do not force-push shared branches unless explicitly approved.
5. Delete stale branches after their PR is merged or formally abandoned.

## 5. Commit rules

- Commits must be coherent, reviewable and connected to the task.
- Group related changes together instead of creating a deployment-triggering commit for every small edit.
- Use clear conventional prefixes where practical: `feat`, `fix`, `test`, `docs`, `chore`, `refactor`, `security`, `ci`.
- Do not combine unrelated features or opportunistic refactors in the same PR.
- Do not commit generated secrets, local environment files, debug dumps or temporary exports.

## 6. Pull-request rules

Every PR must state:

- The problem or business objective.
- The exact scope implemented.
- What was deliberately left unchanged.
- Security and authorization impact.
- Database or migration impact.
- Financial, booking, earnings, payout or invoice impact where relevant.
- Tests executed and their results.
- Staging verification required or completed.
- Rollback or recovery notes for high-risk changes.

PR discipline:

- Open one final PR when the task is materially complete.
- Use draft PRs only for substantial ongoing work that genuinely needs shared review.
- Do not create repeated replacement PRs for small corrections.
- Resolve review findings on the same branch and PR.
- Required checks must pass before merge.
- A PR must not claim production verification unless it was actually performed.

## 7. Testing requirements

Before requesting staging or merge, run the smallest complete test set that covers the change.

Baseline commands from the repository root:

```bash
npm ci
npm run typecheck
npm run test:critical
npm run db:migrations:validate
```

For web changes, also run the relevant application tests and a production build where practical:

```bash
npm --prefix apps/web run test
npm --prefix apps/web run build
```

Requirements:

- Add or update tests for defects, authorization changes, financial calculations and high-risk workflows.
- Never weaken or delete a valid test merely to make CI pass.
- Migration filenames and migration ordering must pass governance checks.
- Test data must not contain real customer credentials, tokens, bank details or identity documents.
- Record any test that could not be executed and the reason.

## 8. Deployment policy

### Feature branch

- Develop and commit normally.
- Vercel must skip the deployment.
- Validate locally and with GitHub Actions.

### Staging

Deploy only when:

- The task is complete enough for acceptance testing.
- Local and required CI checks pass.
- The staging test plan is written.

During staging verification:

- Test the exact affected roles and data scopes.
- Confirm no unauthorized data is visible.
- Confirm customer, cleaner, booking, payment and payout workflows remain safe.
- Record failures before making another deployment.
- Batch all identified corrections into one follow-up staging build where possible.

### Production

Merge to `main` only when:

- Required checks pass.
- Staging acceptance is complete for runtime or high-risk changes.
- Database migrations are forward-safe and reviewed.
- Production environment requirements are confirmed.
- The release has a clear rollback or recovery path when risk is meaningful.

## 9. Production safety checks

Before production, explicitly check whether the change affects:

- Authentication or session handling.
- Admin roles, permissions or branch/team scoping.
- Customer personal information.
- Cleaner identity, documents, location or bank information.
- Booking creation, allocation, recurring generation or status transitions.
- Pricing, discounts, extras, equipment or payment capture.
- Cleaner earnings, payout eligibility, batches or maker-checker approval.
- Paystack, Zoho, Resend, Twilio, WhatsApp, Google or Supabase integrations.
- Cron jobs, retries, idempotency or duplicate processing.
- SEO metadata, redirects, canonicals or analytics.

High-risk changes require fail-closed authorization, idempotency where applicable, auditability and explicit regression tests.

## 10. Shalean coding standards

- Use TypeScript types at trust boundaries; avoid untyped payloads.
- Validate all external and user-provided input server-side.
- Server-side authorization is the source of truth; UI hiding is not security.
- Default to least privilege and deny unknown roles, workflow types and unsafe destinations.
- Keep business calculations in reusable, tested domain functions rather than duplicating formulas in UI components.
- Use integer cents for monetary calculations unless an existing approved domain type requires otherwise.
- Make time-zone decisions explicit; Shalean operational dates use `Africa/Johannesburg` unless a documented integration requires UTC.
- Select only required database columns and preserve tenant, branch, team and cleaner scope.
- Avoid internal HTTP calls when direct server composition is safer and cheaper.
- Log useful operational context without secrets or sensitive personal data.
- Prefer idempotent APIs and jobs for payments, invoices, recurring bookings, notifications and payouts.
- Preserve accessibility, responsive layout and clear loading, empty and error states.

## 11. Database and migration rules

- Never edit an already-applied production migration to change history.
- Create a new forward migration for schema or data corrections.
- Use deterministic, descriptive migration filenames that pass repository governance.
- Review row-level security, grants and service-role assumptions for every sensitive table change.
- Backfills must be resumable or safely repeatable where practical.
- Destructive changes require an explicit backup, recovery or phased-removal plan.
- Financial and earnings repairs must distinguish data correction from formula recalculation.

## 12. AI-agent operating instruction

Every ChatGPT, Cursor or Codex coding session must follow this instruction:

> Work only on the current approved feature branch. Do not create another branch unless necessary and explained. Keep related changes together. Run local and relevant repository tests before pushing. Do not push or merge to staging after every commit. Do not merge to main. Create or update one final PR only when the complete task is ready. Minimize Vercel builds, preserve production behaviour outside scope, and report changed files, tests, risks and remaining verification clearly.

When an instruction conflicts with this standard, stop and request explicit approval rather than silently weakening safety or cost controls.

## 13. Exceptions and emergencies

An exception is allowed only for:

- A confirmed production outage.
- A security incident.
- A payment, booking or payout integrity incident requiring urgent containment.

Emergency work must still:

- Use a dedicated fix branch where possible.
- Make the smallest safe change.
- Record what was bypassed and why.
- Run targeted tests.
- Complete follow-up review and documentation after service is restored.

## 14. Definition of done

A task is done only when:

- Scope is implemented without unrelated changes.
- Required tests pass.
- Security and financial impacts are assessed.
- Documentation is updated where needed.
- Staging is verified when required.
- PR evidence is accurate.
- Production is merged only after approval and checks.
- Stale branches and temporary debugging artefacts are removed.
