# Phase 15B — Soft governance plan

**Status:** planning and policy design **only**. **No** gating implementation, schema changes for enforcement, or production behaviour changes until this document is reviewed and explicit sign-off is recorded.  
**Execution gap (not more framework text):** **institutional execution** — populate ownership and operational routing per **§10.9** (real names, teams, escalation, alert destinations, rollback and override authority, support ownership); further elaboration of this document is **low ROI** until that step is done.  
**Prerequisite:** Phase 15A measurement and observability in place (`docs/payout-phase15a-measurement-before-enforcement.md`), including advisory classification, burn-in under the shared scan window (`PHASE15A_ANOMALIES_DEFAULT_MAX_SCAN`), and correlation with SQL probes and shadow logs where applicable.  
**Strategic sequence:** *measure first (15A) → govern second (15B) → enforce last (15C)* — Phase 14 §5.2–5.3 and Phase 15A §8.4–8.5.

**Positioning:** Phase 15B failure modes are expected to be **operational** (false positives, flag misconfiguration, alert fatigue, override discipline), not **architectural** — hybrid eligibility, weekly vs ledger separation, and predicate families are already anchored in Phase 14 and measured in Phase 15A. The leverage before any code is therefore **runbook and governance artifact** completion (§10), not an early soft-gate implementation. Past that point, **operational governance mistakes** (unclear ownership, bad escalation, untrusted telemetry) often dominate; **human routing correctness** matters as much as **predicate correctness**.

| Phase | Purpose |
|-------|---------|
| **15A** | Observe and classify |
| **15B** | Govern softly (defer / warn / override / telemetry) |
| **15C+** | Enforce structurally (hard rules when invariants are proven) |

**Connected governance chain (meta):** architecture (Phase 14) → invariants measured (15A) → classification operationalized → burn-in validated → governance semantics and rollout mechanics drafted (this doc, §10–10.8) → **people/process fields filled** (§10.0) → **incremental** implementation (§10.8.3). That sequencing lowers the risk of payout freezes, false-positive panic, “who owns this?” incidents, telemetry nobody trusts, and enforcement drift.

| Layer | Maturity (target state before slice 2+) |
|-------|----------------------------------------|
| Financial architecture | Stable |
| Convergence / authority model | Validated (15A + probes) |
| Governance instrumentation | Stable |
| Operational classification | Stable |
| Burn-in evidence | Stable |
| Governance semantics (reason codes, flags plan) | Drafted → ratified |
| Rollout sequencing / reversibility | Controlled (this doc) |
| Ownership, escalation, alert destinations | **Ready for population** — institutionalize per §10.9 (real names before slice 1) |

This programme is a **controlled financial governance rollout**, not a reactive payout refactor.

---

## 1. What Phase 15B is (and is not)

| Phase 15B **is** | Phase 15B **is not** |
|------------------|----------------------|
| **Soft** gates: defer, skip, or surface **clear error codes** on paths that would violate agreed predicates (Phase 14 **I1–I3** family), with **visibility** and **escape hatches**. | **Hard** fail-closed DB constraints, blocking triggers, or irreversible “money stuck” defaults without override and telemetry. |
| Predicate **reuse** aligned with `bookingPayableForWeeklyBatch` and the SQL P8 / P10 / P11 family — same *shape* of rules 15A already measured. | A new payout engine, rail merge, or rewrite of `applyTransferSuccess` / `applyTransferFailed` mechanics (**I6** — unchanged unless a separate sub-phase is opened). |
| Operational **governance**: flags, dry-run, warnings, admin workflow, rollback story. | Phase **15C** hard enforcement; refund **automation** or silent reversals (still out of scope until explicitly planned). |

**Explicit “still non-blocking” baseline until sign-off:** Until Phase 15B is **fully** rolled out under agreed flags and runbooks, the programme must preserve the ability to run **as today** (15A semantics): classification and `phase15b_pre_gate_readiness` remain **hints** only where flags are off. After 15B ships for a path, **that path** may soft-block only where the plan below says so — never “silent” hard blocks without codes, telemetry, and override policy.

---

## 2. Feature flags

**Goals:** any soft gate must be **off by default** in production until deliberately enabled; **per-environment** and **per-path** control where the blast radius differs (e.g. ledger claim vs weekly batch enqueue).

**Plan (to decide at implementation time, names illustrative):**

| Concern | Planning requirement |
|---------|----------------------|
| **Granularity** | At minimum: a **master** “15B soft gates enabled” flag and **sub-flags** per integration surface (e.g. ledger claim RPC wrapper, optional admin actions). Avoid one monolith flag if rollback needs to isolate a single path. |
| **Storage** | Prefer **environment** or **remote config** with audit (who changed, when) over ad-hoc `.env` only for production toggles. Document whether staging **defaults on** for rehearsal. |
| **Defaults** | Production: **all off** until burn-in and ops sign-off. Staging: may default **on** for dry-run rehearsal only if noise is acceptable. |
| **Safety** | Flag reads must be **fail-open to 15A behaviour** on read errors (no accidental hard block because config is unreachable — exact semantics to confirm in implementation spec). |

**Deliverable before code:** a one-page **flag matrix** (path × env × default × owner × rollback) appended to this doc or linked from the runbook.

---

## 3. Dry-run semantics

**Definition:** **Dry-run** means executing the **same** predicate and branching logic as the eventual soft gate, but **recording** the outcome (would defer / would skip / would allow) **without** mutating money state or calling Paystack in the “blocked” branch.

| Topic | Plan |
|-------|------|
| **Trigger** | Cron, admin “simulate”, or sampled live traffic — to be chosen per path; must not overload DB. |
| **Output** | Structured logs or metrics: `booking_id`, `cleaner_earning_id` (or surrogate id), **decision**, **reason code**, **flag snapshot** (which flags were on). **PII minimisation** in logs. |
| **Comparison** | Diff dry-run vs **15A shadow logs** (`ledger_claim_would_fail_phase15_rules` family) to ensure counts and reason codes converge before enabling “live” soft gate. |
| **Duration** | Run dry-run for a **defined** window (e.g. N business days) with weekly review before flipping production sub-flags from dry-run-only to enforce. |

---

## 4. Advisory warning behaviour

**Audience:** admins, ops, support — not end-customer copy unless explicitly scoped later.

| Surface | Behaviour |
|---------|-----------|
| **Admin UI** | When a soft gate **would** fire (or fires in warn-only mode): clear **copy** referencing runbook section and **error / reason code** (stable string for search). |
| **API / RPC consumers** | **HTTP or RPC error shape** documented: machine-readable `code`, human `message`, optional `correlation_id` for support. |
| **Severity ladder** | Distinguish **info** (observed drift, no user action), **warn** (action may be deferred), **error** (action blocked until override or fix). Exact mapping per path in implementation spec. |
| **Correlation** | Same **correlation id** across logs, metrics, and admin audit row for one attempted operation. |

Warnings must **not** contradict Phase 15A messaging without an explicit doc update: users should understand **15B can defer money movement** on specific paths, not that “payouts are broken globally.”

---

## 5. Admin override workflow

**Purpose:** legitimate exceptions (**I5** grandfathered rows, incident recovery) must not require a production deploy to unblock.

| Element | Plan |
|---------|------|
| **Who may override** | Role-based (e.g. finance + super-admin only); **not** every admin. Record in access matrix. |
| **Preconditions** | Ticket or internal reference **required**; optional **second pair of eyes** for above-threshold amounts. |
| **Mechanics** | Prefer **explicit** override (per `booking_id` / `cleaner_earning_id` / time window) stored in an **audit table** with actor, reason, expiry — not a hidden env bypass. |
| **Expiry** | Overrides should be **time-bound** or **one-shot** where possible so I5 debt does not become permanent shadow policy. |
| **Audit** | Immutable append-only audit log entry on every override use and every gate decision that references an override. |

---

## 6. Telemetry emitted by soft gates

**Principle:** every soft gate decision is **observable** — governance tooling is part of financial correctness.

| Stream | Content |
|--------|---------|
| **Metrics** | Counters by `decision` × `reason_code` × `path` × `env`; histograms for latency impact of predicate evaluation. |
| **Logs** | Structured, sample-rate where volume is high; include flag state hash, not secrets. |
| **Dashboards** | Reuse or extend Phase 15A diagnostics surfaces where possible; add “15B gate decisions” slice with drill-down to anomaly classification alignment. |
| **Alerting** | Optional thresholds (e.g. spike in `defer_refund_related`) — **warning** first, not pager storm; tune after dry-run. |

---

## 7. Rollback strategy

| Scenario | Action |
|----------|--------|
| **False positive spike** | Turn **off** the relevant **sub-flag** first; keep master off if systemic. Confirm metrics return to baseline. |
| **Bug in predicate** | Deploy **revert** or hotfix; document whether in-flight rows need **manual** reconciliation (runbook). |
| **Data fix** | If bad rows caused blocks, fix **data** + **clear** stale override state per policy — no automatic mass unfreeze without review. |
| **Communication** | Incident template: what was rolled back, what money paths were never hard-stopped (15B soft only), what ops should verify in SQL probes. |

Rollback must restore behaviour to **at least** Phase 15A safety: no 15C-style fail-closed DB rules implied by turning flags off.

---

## 8. Rollout order

**Recommended sequence (high level — refine before execution):**

1. **Staging** — dry-run only; align telemetry and dashboards; compare to 15A anomaly API under `PHASE15A_ANOMALIES_DEFAULT_MAX_SCAN`.
2. **Production shadow** — extend 15A shadow window if needed; dry-run in prod with flags **off** for user-visible effects but **on** for logging branch (if technically split).
3. **Canary path** — enable **one** narrow path (e.g. ledger claim predicate only) for a **small** percentage or internal allow-list first.
4. **Expand** — additional sub-flags per Phase 14 **E1 / E2** workstreams; **grandfather I5** explicitly before broadening scope.
5. **Sign-off gate** — ops + engineering review of metrics and anomaly buckets before **15C** planning.

**Predicate priority (aligns with Phase 15A §8.4):** start soft gates on **`active_blocker_candidate`** and **`refund_related_candidate`** correlated with probes; treat **`legacy_drift_candidate`** / **`terminology_mismatch_candidate`** as warn-first or batch-only until volume is understood.

---

## 9. Sign-off checklist (before any 15B implementation PR)

| Item | Owner | Notes |
|------|--------|--------|
| Flag matrix approved | | |
| Dry-run window completed and reviewed | | |
| Admin override + audit design approved | | |
| Telemetry + dashboard contracts agreed | | |
| Rollback and comms template agreed | | |
| Explicit confirmation: **no 15C hard rules** in same release as first 15B flag | | |
| §10 runbook artifacts completed (reason codes, override schema, thresholds, owners, rollback authority, canary, dashboards) | | |
| **§10.0 complete:** §10.4–10.5 filled with **named** roles; override **approval chain**; **alert routing** / escalation to engineering or finance documented | | |
| **First implementation PR scope:** §10.8.3 **slice 1 only** — reason-code **logging**, **no** production defer/block of money paths in that PR | | |
| **Between slice 1 and dry-run:** §10.8.4 **telemetry burn-in** signed off before any PR for §10.8.3 item **3** (dry-run) or later | | |

---

## 10. Pre-implementation runbook (governance preparation only)

**Do not start 15B coding until these artifacts are defined, reviewed, and owned.** They have more leverage than premature soft-gate code: they bound **scope creep enforcement** and align ops, support, and engineering on the same contracts.

### 10.0 People, process, and ownership first

At this maturity stage, **people and process ambiguity** is often a larger risk than **code ambiguity**.

**Hard ordering:** **Do not open slice 1** (§10.8.3) until §10.0 is **concretely** complete — not “intent agreed,” but **filled in** with real **names**, **teams**, **escalation contacts**, **alert destinations** (Slack / email / PagerDuty / etc.), **rollback approvers** for production flags, and **override approvers** (who may grant vs who may execute). Reason codes are **institutional operational vocabulary** once in prod (§10.1); routing for humans must be correct first.

Before the first 15B implementation PR:

1. **Fill §10.4–10.5** with named **R/A** (not only empty RACI tables): who enables canary, who may rollback production flags, and **escalation** when the primary is unavailable.
2. Document the **override approval chain** (who approves, who executes, finance vs super-admin) and how it appears in tickets and audit.
3. Document **alert routing**: which signals page or notify which channel; business-hours vs on-call; who acknowledges **config read fail-open** (§2, §10.3) so it is never treated as benign noise.

**Resist:** implementing “soft gates everywhere” or combining **defer/block** behaviour with first telemetry work. **Prefer:** reversibility and **incremental** exposure (§8, §10.8.2–10.8.3) over rollout speed.

**Slice 1 reminder (even after §10.0):** still **no** defer, **no** skip of success paths, **no** payout state mutation, **no** enforcement semantics — logging/metrics only, until §10.8.4 allows progression.

### 10.1 Reason code registry

Maintain a **single registry** (spreadsheet or markdown appendix) every gate, dry-run branch, and API error references — stable strings for logs, metrics, and support search.

| Column (required) | Description |
|-------------------|---------------|
| **`code`** | Machine identifier, `SCREAMING_SNAKE` or `dot.namespace` — immutable once in prod. |
| **Human summary** | One line for runbooks. |
| **Severity** | Maps to §4 ladder (info / warn / error). |
| **15A link** | Optional: related `Phase15aClassification` or probe id (P8, shadow reason, etc.). |
| **User-visible?** | Admin only vs also API consumer. |
| **Owner** | Engineering domain owner for wording and semantics. |

**Rule:** no soft gate ships without at least one **documented** reason code per defer/skip branch; “unknown” buckets are allowed only as **temporary** with a burn-down owner.

**Immutability after sign-off:** Once a code is emitted in **production**, its **meaning must not change**. Alerts, dashboards, support macros, overrides, audits, incident timelines, and year-on-year metrics all key off stable semantics. **Add new codes** for new situations; do **not** repurpose an existing code — that avoids historical ambiguity, broken metrics, misleading audits, and impossible incident reconstruction.

**Starter rows (draft):** see **§10.8** — illustrative codes aligned to Phase 15A classifications; **rename or split only before first production use**; once emitted in prod, treat codes as **immutable** (add new codes rather than reusing semantics).

### 10.2 Override schema (design before migration)

Document the **minimum fields** for an override row (or equivalent) before DDL or admin UI work. Illustrative — adjust to your stack:

| Field | Required | Notes |
|-------|----------|--------|
| `id` / surrogate key | yes | |
| **Scope** | yes | `booking_id`, `cleaner_earning_id`, and/or path identifier — no ambiguous “global off”. |
| **Actor** | yes | User id + role snapshot. |
| **Ticket / reference** | yes | External id for audit and finance. |
| **`reason` text** | yes | Short justification; may reference runbook section. |
| **`expires_at` or `one_shot`** | yes | Default policy: time-bound unless exec-approved exception. |
| **`created_at` / `revoked_at`** | yes | Append-only semantics for `revoked_at`. |
| **Optional amount threshold** | no | For “second pair of eyes” routing in §5. |

### 10.3 Alert thresholds

Define **initial** thresholds after dry-run volume is known; start conservative (warn-only, no pager).

| Signal | Example threshold (placeholder) | Cadence | Owner | First response |
|--------|----------------------------------|---------|-------|------------------|
| Spike in `defer` by reason code | e.g. more than N/hour vs 7-day baseline | hourly rollup | | triage + check flag |
| Dry-run vs live divergence | more than M% mismatch | daily | | pause canary |
| Override usage | any use / more than K per day | real-time digest | | finance review |
| Config read failures (fail-open path) | any sustained non-zero | | | treat as incident — not “silent OK” |

### 10.4 Rollout owners (RACI-style)

Fill names or roles before first staging rehearsal.

| Activity | **R**esponsible | **A**ccountable | **C**onsulted | **I**nformed |
|----------|----------------|-----------------|---------------|----------------|
| Flag matrix approval | | | | |
| Staging dry-run sign-off | | | | |
| Production canary enable | | | | |
| Production sub-flag expand | | | | |
| Reason code registry updates | | | | |
| Support / runbook updates | | | | |

### 10.5 Rollback authority

| Environment | Who may disable sub-flags / master | Escalation if primary unavailable |
|-------------|-----------------------------------|-----------------------------------|
| Staging | | |
| Production | | |

**Principle:** rollback authority is **operational**, not buried in “only the author can revert”; document on-call and business-hours paths.

### 10.6 Canary scope

| Item | Decision record |
|------|------------------|
| **First path** (e.g. ledger claim only) | |
| **Population** (% traffic, allow-list ids, internal-only) | |
| **Success metrics** (e.g. zero unexpected defers for 48h, probe green) | |
| **Automatic rollback trigger** (e.g. threshold in §10.3) | |
| **Duration cap** (max time in canary before expand or abort) | |

### 10.7 Telemetry dashboards

| Dashboard / view | Primary audience | Data sources | Owner |
|------------------|------------------|--------------|-------|
| 15B gate decisions (counters by code × path) | Engineering | metrics + logs | |
| Dry-run vs live overlay | Engineering + ops | dry-run pipeline + prod gate | |
| Override queue and expiry | Finance + super-admin | audit table | |
| Phase 15A anomaly alignment | Ops | `phase15a-anomalies` + probes | |

### 10.8 Appendix — Draft operational defaults (**review before treating as final**)

Use this appendix to **bootstrap** §10.1–10.6; replace placeholders (N, M, K, hours, roles) with org-specific values and sign-off. Nothing here is a commitment to ship unchanged.

#### 10.8.1 Draft reason code registry (first path: ledger claim soft gate)

| `code` | Human summary | Severity | 15A link (`Phase15aClassification`) | User-visible? |
|--------|-----------------|----------|---------------------------------------|----------------|
| `P15B_LEDGER_CLAIM_BOOKING_PREDICATE_FAILED` | Ledger claim blocked: booking failed weekly-batch-style eligibility predicate. | error | `active_blocker_candidate` | Admin + API consumer of claim path |
| `P15B_LEDGER_CLAIM_REFUND_SIGNAL` | Ledger claim blocked: booking shows refund / reversal signals. | error | `refund_related_candidate` | Admin + API |
| `P15B_LEDGER_CLAIM_INVALID_KEYS` | Ledger claim blocked: missing or invalid `booking_id` / `cleaner_id`. | error | `missing_relation_candidate` | Admin + API |
| `P15B_LEDGER_CLAIM_LEGACY_DRIFT_WARN` | Predicate mismatch on old completed job — **warn-first** per §8; defer only when policy elevates. | warn | `legacy_drift_candidate` | Admin first; API only if policy says so |
| `P15B_LEDGER_CLAIM_TERMINOLOGY_LAG_WARN` | Rail / vocabulary lag (e.g. batch settled vs `payout_status` still `eligible`) — **warn-first** per §8. | warn | `terminology_mismatch_candidate` | Admin first |
| `P15B_LEDGER_CLAIM_NEEDS_REVIEW` | Ambiguous signals — route to manual review queue; default **defer** until 15B policy defines auto path. | error | `needs_manual_review` | Admin |
| `P15B_DRYRUN_WOULD_DEFER` | Dry-run only: live gate would have deferred (no mutation). | info | (varies) | Engineering / ops |
| `P15B_CONFIG_READ_FAIL_OPEN` | Flag/config read failed; **fail-open** path taken (§2). | warn | — | Engineering |

**Governance continuity:** dashboard row §10.7 “Phase 15A anomaly alignment” should correlate volume of `P15B_*` codes with Phase 15A category + classification counts under `PHASE15A_ANOMALIES_DEFAULT_MAX_SCAN` so 15B decisions do not drift from the validated observation model.

#### 10.8.2 Suggested canary defaults (fill owners in §10.4–10.5)

| Item | Suggested starting point |
|------|---------------------------|
| **First path** | Ledger claim entrypoint only (`executeCleanerApprovedEarningsPaystack` / `claim_cleaner_earnings_for_paystack` family — exact hook in implementation spec). |
| **Population** | Internal allow-list (specific `booking_id`s or staging cleaners) **or** sub-1% traffic — pick one; document in §10.6. |
| **Duration cap** | e.g. 72 business hours in canary before “expand or abort” decision (tune from dry-run noise). |
| **Success metrics** | No unexpected `P15B_LEDGER_CLAIM_*` spike vs dry-run; SQL probes remain green; override count near zero. |
| **Auto rollback** | Link to §10.3 — e.g. dry-run vs live mismatch or defer spike more than baseline. |

#### 10.8.3 Implementation slice order (avoid large governance PRs)

Ship **small, flag-guarded** slices in roughly this order; each slice should be revertible without touching money semantics beyond the declared path. **Optimize for reversibility**, not “rolling out fast.”

1. **Slice 1 — Reason-code logging only (mandatory first code slice):** emit structured logs / metrics for “what the gate **would** decide” alongside existing behaviour — **no** user-visible defer, **no** skip of Paystack/RPC success paths, **no** mutation of payout state in this PR. Same discipline as Phase 15A shadow measurement. If slice 1 is skipped in favour of blocking work, operational surprise and rollback cost rise sharply. Slice 1 enables support training, alert tuning, and dashboard stabilization **without** behaviour change.
2. **Gate — telemetry burn-in (not a code slice):** complete **§10.8.4** for slice-1 streams (alerts trusted, dashboards reviewed, owners acknowledge volume). Until sign-off, **no** PR for item **3** (dry-run) or later. **No** defer.
3. **Dry-run job / admin simulate** writing `P15B_DRYRUN_WOULD_DEFER` (§3).
4. **Fail-open flag read** wrapper + `P15B_CONFIG_READ_FAIL_OPEN` telemetry (§2).
5. **Canary defer** for one code (e.g. `P15B_LEDGER_CLAIM_BOOKING_PREDICATE_FAILED` only) with override path stubbed or read-only audit — **only after** §10.0 ownership, §9 sign-off for prior slices, §10.8.4, and dry-run confidence.
6. **Expand** codes and paths per flag matrix after §9 sign-off.

**Anti-pattern:** a monolithic “governance launch” PR that combines logging, flags, and live defer — that defeats incremental rollback, **blurs observability vs behaviour**, makes telemetry hard to interpret, and complicates rollback. **Do not** advance slices while ownership or alert routing is still ambiguous.

#### 10.8.4 Telemetry burn-in (after slice 1, before slice 2)

After slice 1 ships to the agreed environment(s), run a **defined burn-in window** for the **new telemetry only** (no new behaviour):

| Activity | Intent |
|----------|--------|
| **Volume review** | Confirm log/metric cardinality and cost; adjust sampling if needed. |
| **Alert tuning** | Thresholds in §10.3 — start quiet; avoid pager storms. |
| **Dashboards** | §10.7 views live; ops and engineering agree they reflect reality. |
| **Support / runbooks** | Macros or search terms for new codes; training on “logging-only” vs future defer. |
| **Sign-off** | Named owner records: “telemetry burn-in complete” — captured in §9 or change log. |

**Rule:** no PR implementing dry-run, flag wrappers, or defer (§10.8.3 items **3–6**) until this sign-off exists. **Human routing correctness** and **trusted observability** precede any simulation of governance **behaviour**.

#### 10.9 Next operational action (diminishing returns on more plan structure)

The **governance rollout framework** in this document is intentionally complete enough for production-grade sequencing. **Further expansion of plan structure** is likely **lower leverage** than the next step: **populate §10.4–10.6** (and linked override / alert runbooks) with **real people**, **teams**, **escalation contacts**, **override approvers**, **rollback approvers**, **alert destinations** (channels and on-call), and **support ownership** for slice-1 reason codes.

Architecture, rollout sequencing, governance semantics, telemetry design, and burn-in methodology are already **strong** in this repo. The **limiting factor** is now **organizational operationalization**: who owns alerts, who approves overrides, who may rollback production flags, who responds after hours, who reviews telemetry for sign-off, who authorizes canary expansion, and who owns support escalation for new reason codes. That is **not bureaucracy** — at this maturity, **human-response correctness is part of payout correctness**.

A payout or governance incident at this stage can be triggered not only by **predicates**, **reconciliation**, or **ledger logic**, but also by **alerts routed nowhere**, **unclear override authority**, **rollback hesitation**, **inconsistent escalation**, **support misunderstanding telemetry**, or **canary ownership ambiguity**. This plan treats those as **first-class system correctness risks**, not informal “process” noise outside engineering concern.

The programme shifts from **designing** governance to **institutionalizing** it: stop expanding the framework; **start assigning responsibility**.

Until those fields are filled, **slice 1 remains blocked** (§10.0). You may maintain a single **external roster** (e.g. spreadsheet or internal wiki) if preferred — **link it** from the filled §10.4–10.5 tables or from the change log so **this repository stays the index of record** (discoverability, audit continuity, and governance continuity). That avoids operational ownership **drifting outside** the engineering governance source of truth while still allowing org-preferred tooling.

**Do not conflate** “this document is detailed” (**framework maturity**) with **organizational execution readiness** — the trap mature governance programmes often fall into.

| Stable in this repo (design / sequencing) | Remaining (**institutional execution**) |
|---------------------------------------------|----------------------------------------|
| Architecture & convergence direction | **Ownership population** (§10.4–10.6) |
| Measurement & burn-in methodology | **Alert routing** and **escalation clarity** |
| Governance semantics & rollout sequencing | **Override** and **rollback authority** (named) |
| Telemetry design for slice 1 | **Support operationalization** for new reason codes |

**Reopen or materially extend this framework document only if:** org structure or payout topology changes; governance semantics must change; or rollout evidence invalidates an assumption. Otherwise: **populate tables**, then follow the sequence below.

**Practical sequence (cross-check §9, §10.0, §10.8.3–10.8.4):**

1. Populate ownership tables (in-doc or linked roster).
2. Ratify or revise §10.8 draft defaults.
3. Confirm alert routing (§10.0 / §10.3).
4. Confirm rollback authority (§10.5).
5. Confirm override chain (§10.0 / §10.2).
6. Begin §10.8.3 slice 1 — logging-only.
7. Complete §10.8.4 telemetry burn-in sign-off.
8. Continue with §10.8.3 items 3–6 as prior gates allow.

---

## 11. References

- `docs/payout-phase14-rail-decision-enforcement-plan.md` (§5.2 Phase 15B summary, **I1–I6**, **E1–E5**)
- `docs/payout-phase15a-measurement-before-enforcement.md` (classification, burn-in, §8.3.1 scan window)
- `apps/web/lib/payout/bookingPayableForWeeklyBatch.ts`
- `apps/web/lib/payout/phase15aAnomalyClassification.ts`
- `apps/web/lib/payout/phase15aAnomaliesReadModel.ts`
- `apps/web/lib/payout/executeCleanerApprovedEarningsPaystack.ts`
- `supabase/queries/audit_payout_subsystem_convergence_phase11.sql`

**Next after this plan is approved:** execute **§10.9** — assign **real names and contacts** in §10.4–10.6 (and runbooks); ratify or revise §10.8. **First code change:** §10.8.3 **slice 1 only** (logging — no defer/skip/payout mutation). **Then** §10.8.4 **telemetry burn-in** before any PR for §10.8.3 items **3–6**. Subsequent slices follow §10.8.3 in order — then Phase **15C** hard enforcement plan when 15B metrics stabilise.
