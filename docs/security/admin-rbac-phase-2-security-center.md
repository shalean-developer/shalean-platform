# Admin RBAC Phase 2 — Security Center Foundation

This change adds the first Phase 2 security controls on top of the Phase 1 deny-by-default permission foundation.

Included:

- append-only admin audit events
- immutable update/delete protection for security audit records
- Owner permission snapshot RPC
- protected Permissions Inspector API requiring `role.manage`
- high-risk Office route-to-permission registry
- automated route mapping tests

Existing Office routes are not switched from the legacy allow-list in this change. Enforcement will be introduced module by module after staging validation.
