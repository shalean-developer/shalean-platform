# MKT-001H — Historical staging verification snapshot

> Historical record only. This document preserves the July 17, 2026 MKT-001H staging verification state. It is **not** current release authorization and must not be used to infer current Vercel deployments, environment configuration, branch ancestry, provider readiness, or production status.

## Historical decision

At the time of capture, MKT-001H (Facebook Connected Accounts OAuth) had reached **CONDITIONAL PASS** on staging:

- PR #57 had been merged to `staging` at `2af18dc307d745918cbf6cab3d7f6184204633ef`.
- The staging Meta configuration checkpoint had been recorded as PASS.
- An exact-SHA Preview redeploy was READY and health identity reported `deployment=staging`, `gitBranch=staging`, `issues=[]`.
- Live Connected Accounts OAuth and controlled Facebook publishing smoke were still **PENDING** because an interactive allowlisted admin session was required.
- `main` / production remained **NO-GO** in that July verification record.

## Historical staging evidence

Authoritative post-config deployment recorded at the time:

- Deployment: `dpl_BPebLMddKtAxcyGaY3bVcyWBjy4v`
- Git SHA: `2af18dc307d745918cbf6cab3d7f6184204633ef`
- Target: Preview / staging
- Health: `status=ok`, `deployment=staging`, `gitBranch=staging`, `issues=[]`

The earlier deployment `dpl_92Ph3z6DucAV8kEa6gDM5vM67Xwj` was explicitly superseded as post-configuration environment evidence.

## Pending smoke at the time

The July record still required an authorized staging operator to complete the Connected Accounts flow, including OAuth state handling, Page discovery/selection, encrypted connection persistence, text/image publish, duplicate prevention, reconnect/disconnect behavior, token-safety checks, queue/retry/DLQ regression, and Instagram regression.

## Current-use warning

Do not treat any deployment ID, environment scope, Meta app configuration, provider flag, staging URL, branch SHA, or NO-GO decision in this snapshot as current. For present-day releases, use the current Shalean release-control and engineering standards, current `main`, current CI checks, and fresh staging/production evidence.

Machine-readable historical evidence is preserved alongside this file as `mkt-001h-postconfig-redeploy-2026-07-17T1831Z.json`.
