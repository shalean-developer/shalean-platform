# Admin RBAC Priority 3 — Operational Intelligence and Role Workflows

## Objective

Priority 3 turns the secure, role-aware Office experience from Priority 2 into an operational command system. Each signed-in role must see the work that requires attention, the urgency, the owner, the permitted action, and the correct scoped destination.

Priority 3 does not weaken Priority 1 API authorization and does not replace source-of-truth operational modules. It provides a permission-scoped orchestration layer over existing bookings, customers, cleaners, payouts, finance, marketing and system-health data.

## Outcomes

1. A shared, permission-scoped **My Work** queue.
2. Role-specific operational KPIs and exceptions.
3. Action ownership, due dates, urgency and escalation states.
4. Safe deep links into existing Office modules.
5. Read and action state that remains branch/team scoped.
6. Auditable workflow actions.
7. Department-specific productivity views without duplicating business logic.

## Roles

- Owner
- General Manager
- Operations Administrator
- Finance Administrator
- Customer Care
- Workforce Administrator
- Marketing Administrator
- Supervisor

## Non-negotiable security rules

- All queue items are resolved server-side from the signed-in user's effective permissions, branch scope and team scope.
- The browser never receives items outside the user's scope and never performs security filtering as the source of truth.
- Every action deep link is permission checked independently by the target page and API.
- Supervisor items are limited to assigned teams and must never fall back to company-wide data.
- Finance and payout actions retain Priority 1 maker-checker rules.
- Sensitive bank, identity and finance data are not copied into workflow payloads.
- Unknown workflow types fail closed.
- Workflow actions write auditable actor, timestamp and outcome records where state is persisted.

## Priority 3 delivery sequence

### P3.1 — My Work foundation

Create a central workflow-item contract and read-only endpoint.

Each item must include:

- stable item ID
- workflow type
- title and safe summary
- role/permission requirement
- priority: critical, high, normal or low
- status: open, in_progress, waiting, resolved or dismissed
- due time and overdue state
- source module and source record ID
- branch/team scope
- assigned role or actor where applicable
- safe action label and Office destination
- created and updated timestamps

Initial sources:

- unassigned or starting-soon bookings
- cleaner attendance or allocation gaps
- unresolved customer complaints/follow-ups
- payout proposals awaiting a different approver
- failed or blocked payout preparation
- overdue invoice/payment follow-up
- stale recurring generator or critical cron failures
- pending cleaner applications
- marketing/email delivery issues requiring attention

### P3.2 — Role dashboards consume live workflow data

Replace static priority cards with live, permission-scoped queue counts and top items.

Role focus:

- Owner: cross-company critical exceptions, approvals and system health
- General Manager: department blockers, overdue work and operational performance
- Operations: today's bookings, allocation, SLA and service-delivery exceptions
- Finance: payout preparation, approvals, reconciliation, receivables and expense exceptions
- Customer Care: complaints, callbacks, recurring-plan issues and failed communications
- Workforce: applications, cleaner availability, attendance, documents and team allocation
- Marketing: campaign failures, suppressed recipients, publishing jobs and lead follow-up
- Supervisor: assigned-team bookings, attendance, quality checks and incident follow-up

### P3.3 — Workflow ownership and lifecycle

Add controlled state transitions where persistence is required:

- claim / assign
- start work
- mark waiting
- resolve
- dismiss with reason
- reopen
- escalate

All transitions require explicit permissions and immutable audit attribution.

### P3.4 — Alerts and escalations

Add configurable escalation rules for:

- overdue critical items
- bookings approaching start without a valid team
- unresolved customer complaints
- payout approval/release delays
- recurring generator and other critical cron failures
- repeated communication delivery failure

Initial alerts stay inside Office. Email, WhatsApp or push escalation is a later opt-in release and must use existing communication safety controls.

### P3.5 — Department workspaces

Provide filtered queue views with search, date, priority, status, branch, team and assignee controls. Exports must use the already-scoped result set and require an explicit export permission where sensitive.

### P3.6 — Validation and rollout

- unit tests for workflow resolution and permission matrices
- direct API denial tests
- branch/team isolation tests
- maker-checker regression tests
- staging validation with the eight RBAC accounts
- Owner production smoke test
- no staging test identities copied into production

## P3.1 first implementation slice

The first code PR after this planning commit will deliver:

1. `OfficeWorkItem` typed contract.
2. A central registry mapping workflow types to permissions, roles, source modules and safe destinations.
3. A server-side `/api/admin/my-work` endpoint.
4. Initial read-only items from existing operational sources, beginning with booking allocation exceptions and critical cron health.
5. Owner, General Manager, Operations, Workforce and Supervisor scope tests.
6. A small My Work panel on the role dashboard with no mutation actions yet.

## Exit criteria

Priority 3 is complete only when:

- all eight roles receive useful live work queues;
- branch/team isolation is verified;
- target actions remain independently authorized;
- persistent lifecycle actions are audited;
- critical operational escalations are visible;
- staging validation passes for all eight accounts;
- CI, migration governance and Vercel deployment pass;
- production Owner smoke testing passes.
