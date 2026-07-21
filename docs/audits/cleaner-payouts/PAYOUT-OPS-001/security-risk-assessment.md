# PAYOUT-OPS-001 — Security risk assessment

| Field | Value |
|-------|-------|
| **Work package** | PAYOUT-OPS-001 |
| **Date** | 2026-07-21 |
| **Scope** | Earnings money-action proposals + planned Office approvals UX |

Severity: Critical / High / Medium / Low / Informational.

---

## Findings

### SEC-OPS-001 — Approve applies request body, not stored payload
| | |
|--|--|
| **Severity** | **High** |
| **Status** | Open (pre-existing control gap) |
| **Evidence** | `adjust-payout-earnings/route.ts` passes body `payoutCents` into `apply()` after only validating proposal id/status; `withMoneyActionMakerChecker` does not compare body to `payload`. Refunds enforce amount match. |
| **Risk** | Checker (or stolen admin session) can approve with different amounts than proposed. |
| **Remediation (design)** | Approve must apply DB payload only; reject amount mismatch if body re-sent. **Condition for implementation.** |

### SEC-OPS-002 — Concurrent approve race / non-atomic claim
| | |
|--|--|
| **Severity** | **High** |
| **Status** | Open |
| **Evidence** | Status updated after `apply()` without `WHERE status='pending'` claim. Two checkers can both pass pending check. |
| **Risk** | Double application of earnings adjustment. |
| **Remediation** | Conditional claim / single-flight before apply. **Condition for implementation.** |

### SEC-OPS-003 — No reject path (ops pressure to disable flag)
| | |
|--|--|
| **Severity** | **Medium** |
| **Status** | Open (operational) |
| **Risk** | Operators may seek workarounds (flag off, direct SQL) if mistaken proposals cannot be closed. |
| **Remediation** | Implement reject with required `review_note`. |

### SEC-OPS-004 — Proposal enumeration / IDOR among admins
| | |
|--|--|
| **Severity** | **Low** (admin-only) |
| **Status** | Accepted with monitoring |
| **Notes** | All admins on allowlist can list/view all proposals. Acceptable for Office finance ops; do not expose to non-admin. Detail by UUID is fine behind `requireAdminApi`. |

### SEC-OPS-005 — Sensitive financial / PII exposure on list
| | |
|--|--|
| **Severity** | **Medium** |
| **Status** | Design constraint |
| **Notes** | List exposes cleaner names, amounts, notes. Restrict to admin allowlist; avoid logging full payloads to client analytics; no public CDN cache (`force-dynamic` / `no-store`). |

### SEC-OPS-006 — Self-approval
| | |
|--|--|
| **Severity** | Informational (control present) |
| **Status** | Mitigated |
| **Evidence** | `maker_checker_self_approve` when `PAYOUT_ALLOW_SELF_APPROVE` ≠ true. |
| **Constraint** | This package must not enable self-approve. |

### SEC-OPS-007 — Direct API abuse without Office UI
| | |
|--|--|
| **Severity** | Informational |
| **Status** | Expected |
| **Notes** | Admins can call APIs directly; controls must live server-side (already mostly do). Office UI is convenience, not the control boundary. |

### SEC-OPS-008 — Replay / duplicate approve
| | |
|--|--|
| **Severity** | Medium (related to SEC-OPS-002) |
| **Mitigation** | Idempotent 409 after first successful claim; no second mutate. |

### SEC-OPS-009 — CSRF
| | |
|--|--|
| **Severity** | Low |
| **Notes** | Admin APIs use `Authorization: Bearer` (not cookie-only session for these fetches via `adminFetch`). Standard Bearer CSRF risk is low. Keep rejecting cookie-only unauthenticated calls. |

### SEC-OPS-010 — Audit integrity on propose
| | |
|--|--|
| **Severity** | Low |
| **Notes** | Propose creates proposal row but no `payout_audit_events` entry. Acceptable if proposal table is retained; recommend optional `visit_earnings_adjustment_proposed` event in phase 5. |

### SEC-OPS-011 — Duplicate pending proposals
| | |
|--|--|
| **Severity** | Medium |
| **Risk** | Confusing queue; last-approve-wins ambiguity if both approved sequentially. |
| **Remediation** | Product policy: warn on propose if pending exists; optional supersede/cancel prior; UI shows all pending for booking. |

### SEC-OPS-012 — RLS grants on proposals table
| | |
|--|--|
| **Severity** | Informational / Medium (platform) |
| **Evidence** | Baseline grants ALL to `anon`/`authenticated` with RLS enabled — policies not inventoried in this package. |
| **Notes** | Admin path uses service role. Separate RLS audit recommended outside this package; do not rely on client Supabase reads for proposals. |

### SEC-OPS-013 — Authentication / authorization
| | |
|--|--|
| **Severity** | Informational (adequate for current model) |
| **Evidence** | `requireAdminApi` + email allowlist. Coarser than expense stage roles. |
| **Design** | Reuse same admin gate for list/approve/reject; optional future finance-role split out of scope. |

---

## Summary matrix

| ID | Severity | Blocks implementation auth? |
|----|----------|------------------------------|
| SEC-OPS-001 | High | **Yes — must fix in same package** |
| SEC-OPS-002 | High | **Yes — must fix in same package** |
| SEC-OPS-003 | Medium | Yes (reject required for complete UX) |
| SEC-OPS-004 | Low | No |
| SEC-OPS-005 | Medium | Design constraint |
| SEC-OPS-006 | Info | Preserve |
| SEC-OPS-007 | Info | N/A |
| SEC-OPS-008 | Medium | Covered by 002 |
| SEC-OPS-009 | Low | No |
| SEC-OPS-010 | Low | No |
| SEC-OPS-011 | Medium | Soft — policy in implementation |
| SEC-OPS-012 | Info/Med | Separate track |
| SEC-OPS-013 | Info | No |

**Overall security posture for design:** Acceptable to authorize implementation **only if** SEC-OPS-001 and SEC-OPS-002 are mandatory acceptance criteria (not deferred).
