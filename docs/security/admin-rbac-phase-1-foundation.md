# Admin RBAC Phase 1 — Permission Foundation

## Scope

This phase introduces the database and server-side primitives required for deny-by-default Office authorization. It does not yet replace the legacy admin allow-list on every existing route; route-by-route enforcement belongs to the following protection phases.

## Database objects

- `admin_roles`
- `admin_permissions`
- `admin_role_permissions`
- `admin_user_roles`
- `admin_has_permission(...)`
- `admin_assert_permission(...)`
- `admin_grant_role(...)`
- `admin_revoke_role(...)`

Role assignments may be global, branch-scoped or team-scoped. They may also be temporary through `starts_at` and `expires_at`. Expired, revoked, inactive or missing assignments grant nothing.

## Security guarantees

1. The permission evaluator returns false unless a valid active assignment explicitly grants the requested permission.
2. RBAC tables are not readable or writable by browser `anon` or `authenticated` roles.
3. Only server-side service-role code can evaluate or administer permissions.
4. Users cannot grant or revoke their own roles.
5. Role administration requires `role.manage`.
6. Temporary access must expire in the future.
7. Owner is the only seeded role with every permission.
8. Finance is intentionally not seeded with payout approval or release, preserving maker-checker separation.

## Central server gate

Use `requireAdminPermissionFromRequest(request, permission, scope)` in API routes. It validates the bearer session and then calls the database permission evaluator. Missing configuration and evaluation errors fail closed.

```ts
const auth = await requireAdminPermissionFromRequest(request, "booking.assign", {
  branchId,
});
if (!auth.ok) return auth.response;
```

## Safe rollout

The migration creates no production user assignments. Existing Office routes continue to use the legacy admin allow-list until they are deliberately migrated. Before protecting the first route, assign the Owner role to the protected recovery account and verify the permission inspector in staging.

## Next protection order

1. Admin users and role management
2. Payout preparation, approval and release
3. Cleaner bank and identity records
4. Finance, cash flow, budgets, expenses and profitability
5. Pricing and integrations
6. Refunds, cancellations and exports
