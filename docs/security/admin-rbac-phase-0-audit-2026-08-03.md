# Shalean Admin RBAC — Phase 0 Audit and Implementation Baseline

**Date:** 3 August 2026  
**Status:** Implementation starting point  
**Source policy:** Shalean Admin Roles and Permissions Implementation Plan

## Decision

Proceed with the approved role-based access plan, starting with the required read-only inventory before database or authorization behaviour changes.

No role-specific sidebar or dashboard restrictions should be deployed until the matching server/API permission checks exist.

## Confirmed target roles

1. Owner
2. General Manager
3. Operations Administrator / Booking Coordinator
4. Finance Administrator / Bookkeeper
5. Customer Care
6. Workforce / Recruitment Administrator
7. Marketing and SEO Administrator
8. Supervisor — limited team portal, not general Office access

## Approved implementation additions

The implementation will also account for:

- branch-scoped permissions for future multi-branch operations;
- team-scoped permissions for supervisors and team leaders;
- explicit system-configuration permissions;
- permission-aware dashboard data APIs, not only hidden cards;
- a Permissions Inspector for Owner/developer troubleshooting;
- pricing change reasons, immutable history and rollback support;
- feature flags for staged role rollout;
- explicit protection of customer addresses and contact data from non-operational roles.

Permission version suffixes are not required for the initial schema. Permission codes should remain stable; material replacements can be introduced as new codes with migration mapping when needed.

## Current authorization baseline

The current central helper `apps/web/lib/admin/requireAdmin.ts` validates a Supabase bearer session and then grants or denies broad admin access through an email allow-list (`isAdmin(email)`). It does not currently resolve granular roles, permissions, branch scope, team scope or temporary grants.

This means the present model is effectively:

- authenticated and allow-listed admin: broad access;
- everyone else: denied.

Existing API routes use more than one authorization helper/pattern, including `requireAdminFromRequest`, `requireAdminUser`, and route-local bearer-token validation. Phase 0 must identify every variant before central replacement.

## Phase 0 inventory scope

Catalogue all of the following:

- every page beneath `/office`;
- every `/api/admin` endpoint;
- Office-facing API routes outside `/api/admin`;
- server actions and route handlers performing admin mutations;
- database RPC/functions used for payouts, refunds, pricing, finance, cleaners and role-sensitive operations;
- export endpoints;
- scheduled jobs and service-role processes;
- sidebar/navigation entries;
- dashboard cards and their backing APIs;
- global search sources;
- sensitive fields and document-download routes;
- existing audit-log writers and readers.

For each item record:

| Field | Required value |
|---|---|
| Resource | Page, API, action, RPC, export or job |
| Path/name | Exact route or function |
| Operation | Read, create, update, delete, approve, release or export |
| Current guard | Exact helper/policy currently used |
| Data sensitivity | Public, internal, personal, financial or highly sensitive |
| Proposed permission | Granular permission code |
| Scope | Global, branch, team or own-record |
| Audit requirement | None, access log or full before/after event |
| Priority | Critical, high, medium or low |

## Permission namespace baseline

Initial groups will use the policy's codes, extended with these scopes:

### Branch

- `branch.view`
- `branch.manage`
- `branch.finance.view`
- `branch.workforce.manage`
- `branch.customer.view`

### Team

- `team.view`
- `team.manage`
- `team.assign`
- `team.performance.view`

### System

- `system.settings.manage`
- `system.notifications.manage`
- `system.email.manage`
- `system.sms.manage`
- `system.whatsapp.manage`
- `system.backups.manage`
- `system.logs.view`
- `system.integrations.manage`

The original permission groups for bookings, customers, workforce, finance, payouts, refunds, growth, operations and administration remain authoritative.

## High-risk protection order

1. Admin users and role management
2. Payout preparation, approval and release
3. Cleaner bank details and identity documents
4. Cash flow, budgets, expenses and profitability
5. Pricing
6. Zoho, Paystack and marketing integrations
7. Refunds and cancellations
8. Bulk customer, cleaner and financial exports

## Non-negotiable controls

- Deny by default.
- Server/API/database enforcement precedes UI hiding.
- Users cannot modify their own role or permission grants.
- Finance preparer cannot approve or release the same payout batch.
- Sensitive values are masked unless an explicit permission is resolved.
- Supervisor access is restricted to assigned teams, bookings and own earnings.
- Every critical approval, override, export and sensitive-data read is auditable.
- Missing, expired or unknown grants take effect immediately.

## Decisions required before Phase 1 migration

The Owner must confirm these policy values before production role assignment:

1. Named holder of each role.
2. Payout preparer and payout approver/releaser.
3. Whether the General Manager may approve refunds up to R1,000.
4. Whether Customer Care may issue service credits up to R250.
5. Whether the General Manager may apply discounts up to 10%.
6. Which marketing role may publish without Owner approval.
7. Initial branch scope: global Cape Town only, or branch records from day one.
8. Initial supervisor team ownership rules.

Until confirmed, Phase 1 should create capabilities but assign only the Owner role in production. Other roles should be tested in staging.

## Planned PR sequence

### PR A — Phase 0 inventory

- Complete route/API/action/RPC inventory.
- Produce current guard map.
- Produce sensitive-data map.
- Produce permission-to-resource matrix.

### PR B — Permission foundation

- Add roles, permissions, role-permissions, user-role grants and scoped grants.
- Add temporary grants with expiry.
- Add central permission resolver and Owner fallback migration.
- Add Permissions Inspector API/page restricted to Owner.
- Keep existing allow-list compatibility during migration.

### PR C — Highest-risk enforcement

- Protect users/roles, payouts, banking/identity, finance, pricing, integrations, refunds and exports.
- Add maker–checker and sensitive-field masking.

### PR D — Role-aware UI

- Permission-filter sidebar, dashboard cards, search and actions.
- Add role-specific dashboard layouts only after their APIs are protected.

### PR E — Audit and tests

- Add comprehensive sensitive read/change events.
- Add role test accounts and deny/allow integration tests.

## Phase 0 exit criteria

Phase 0 is complete only when every known Office page, API route, server mutation, RPC, export and scheduled process has an owner, current guard, proposed permission and risk classification.

This document authorizes inventory work only. It does not authorize broad production access changes before the inventory is complete and the policy thresholds above are confirmed.
