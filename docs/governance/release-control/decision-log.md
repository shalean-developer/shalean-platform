# Shalean SPC Release Decision Log

This is the canonical SPC-wide decision index for material release/convergence authority decisions. It records evidence; an entry does not itself grant authority. Unknown approval evidence remains **NOT VERIFIED**. Production authorization must always be explicit and separate.

- Google Sheet: task status, blockers, task evidence and programme tracking.
- GitHub PR evidence: scope, review/check evidence, merge events and attributable PR records.
- Decision log: concise chronological index linking material decisions to those sources; it replaces neither source.

The [release-control standard](./README.md) and [master SPC skill](../../../.agents/skills/shalean-spc/SKILL.md) continue to govern. No decision entry overrides the SPC programme freeze.

## Recording and correction rules

- Append only material authority decisions, not routine task updates. Use stable sequential IDs; IDs reflect recording sequence, not historical event sequence.
- Only an explicitly authorized recorder may add records. Recording authority is distinct from approval authority. Cite attributable evidence for every decision; unknown evidence stays NOT VERIFIED.
- Corrections and reversals are new entries referencing the old ID. Do not silently rewrite historical decisions. Late records retain their actual recording date; never backdate them.
- Keep authorization stages separate: audit approval does not imply implementation approval; implementation does not imply commit/push/PR approval; commit/push/PR does not imply integration merge approval; integration merge does not imply main merge approval; main merge does not imply production deployment approval; deployment does not imply database, financial or messaging authorization.
- Record conflicts between underlying sources and resolve them before relying on the affected authorization.
- Each entry uses the fields below. Decision types are APPROVED, REJECTED, FROZEN, EXCLUDED, SUPERSEDED or DEFERRED. A recorded merge event is not evidence of a separate approval; neither its actor nor timestamp establishes approval identity or time.
- Keep secrets and personal data out of entries. Link detailed evidence instead of copying the tracker or complete PR histories.

## Bootstrap decisions

These seven entries were recorded under the approved SPC-00-05 documentation scope. Dates with day precision do not imply an exact time. Historical observations retain their provenance and are not new runtime or database validations.

### SPC-DEC-0001 — Record main as production code authority

- **Decision ID:** SPC-DEC-0001
- **Recorded date:** 2026-09-05 (UTC date)
- **Recorder:** Codex, under Farai's explicit SPC-00-05 implementation authorization
- **Decision date/time:** 2026-09-05 (day precision); exact approval time NOT VERIFIED
- **Related SPC Task ID:** SPC-00-01
- **Decision type:** APPROVED
- **Authorization stage:** Authority baseline / audit acceptance
- **Summary:** Record main as production code authority
- **Included scope:** Record the completed read-only finding that `main` is production code authority.
- **Explicit exclusions:** Code changes, merge authority and deployment authority.
- **Decision authority:** Named approver NOT VERIFIED; acceptance recorded in tracker.
- **Approval evidence:** Tracker acceptance and repository governance; separate approval text NOT VERIFIED.
- **Branch / PR:** `audit/spc-00-01-production-code-authority`; `main`; no audit PR
- **SHA:** Production main at audit: `d3613be689663833ce6678b9726165638549f738`
- **Tracker reference:** [Fix Tracker row 2](https://docs.google.com/spreadsheets/d/1IwJRlBqziE74VdXb5EZCV2MpXsHMJDlgwRNmmvWEo_k/edit#gid=1001&range=A2:N2)
- **Production authorization:** Not granted
- **Evidence / provenance:** Tracker audit PASS and [master SPC skill](../../../.agents/skills/shalean-spc/SKILL.md).
- **Conditions / notes:** Authority baseline only; no execution permission.
- **Supersedes:** None

### SPC-DEC-0002 — Record integration/shalean-release as sole release candidate

- **Decision ID:** SPC-DEC-0002
- **Recorded date:** 2026-09-05 (UTC date)
- **Recorder:** Codex, under Farai's explicit SPC-00-05 implementation authorization
- **Decision date/time:** 2026-09-05 (day precision); exact approval time NOT VERIFIED
- **Related SPC Task ID:** SPC-00-02
- **Decision type:** APPROVED
- **Authorization stage:** Authority baseline / audit acceptance
- **Summary:** Record integration/shalean-release as sole release candidate
- **Included scope:** Record `integration/shalean-release` as sole release-candidate branch.
- **Explicit exclusions:** Independent release authorities and production promotion.
- **Decision authority:** Named approver NOT VERIFIED; acceptance recorded in tracker.
- **Approval evidence:** Tracker acceptance; separate approval text NOT VERIFIED.
- **Branch / PR:** `audit/spc-00-02-release-candidate-authority`; `integration/shalean-release`; [PR #477](https://github.com/shalean-developer/shalean-platform/pull/477)
- **SHA:** At original audit: `270748f6ecb394a8c67c4f4ae9ce8013f4f0e97b`; at recording: `7a03a80dcbad7af0618675c608fa6fc6707164ff`
- **Tracker reference:** [Fix Tracker row 3](https://docs.google.com/spreadsheets/d/1IwJRlBqziE74VdXb5EZCV2MpXsHMJDlgwRNmmvWEo_k/edit#gid=1001&range=A3:N3)
- **Production authorization:** Not granted
- **Evidence / provenance:** [PR #477](https://github.com/shalean-developer/shalean-platform/pull/477) integration rules and [master SPC skill](../../../.agents/skills/shalean-spc/SKILL.md).
- **Conditions / notes:** PR #477 was OPEN/draft when inspected for the design; later SHA is context, not a new approval.
- **Supersedes:** None

### SPC-DEC-0003 — Record production Supabase database authority

- **Decision ID:** SPC-DEC-0003
- **Recorded date:** 2026-09-05 (UTC date)
- **Recorder:** Codex, under Farai's explicit SPC-00-05 implementation authorization
- **Decision date/time:** 2026-09-05 (day precision); exact approval time NOT VERIFIED
- **Related SPC Task ID:** SPC-00-03
- **Decision type:** APPROVED
- **Authorization stage:** Authority baseline / audit acceptance
- **Summary:** Record production Supabase database authority
- **Included scope:** Record project `shalean-platform`, ref `tchayecuvzssixyxlvfu`, region West EU (Paris), status Active, organization/owner Shalean Cleaning, as supplied in tracker evidence.
- **Explicit exclusions:** SQL execution, migrations, schema changes and production-data changes.
- **Decision authority:** Named approver and metadata supplier identity NOT VERIFIED; acceptance recorded in tracker.
- **Approval evidence:** Tracker acceptance plus repository/runtime corroboration of the ref; separate approval text NOT VERIFIED.
- **Branch / PR:** `audit/spc-00-03-production-database-authority`; no PR
- **SHA:** Runtime corroboration at audit: `d3613be689663833ce6678b9726165638549f738`
- **Tracker reference:** [Fix Tracker row 4](https://docs.google.com/spreadsheets/d/1IwJRlBqziE74VdXb5EZCV2MpXsHMJDlgwRNmmvWEo_k/edit#gid=1001&range=A4:N4)
- **Production authorization:** Not granted
- **Evidence / provenance:** Tracker-supplied project metadata; [repository mapping](../../../apps/web/lib/env/deploymentEnvironment.ts), [runbook](../../runbooks/development-reset-and-reseed.md), and prior read-only [production runtime identity](https://www.shalean.co.za/api/health/environment) corroboration.
- **Conditions / notes:** No fresh Supabase management API verification. Prior connector lookup was denied; name/region/status/owner are supplied evidence, not a new platform health check.
- **Supersedes:** None

### SPC-DEC-0004 — Establish SPC programme freeze

- **Decision ID:** SPC-DEC-0004
- **Recorded date:** 2026-09-05 (UTC date)
- **Recorder:** Codex, under Farai's explicit SPC-00-05 implementation authorization
- **Decision date/time:** 2026-09-05 (day precision); exact approval timestamp NOT VERIFIED
- **Related SPC Task ID:** SPC-00-04
- **Decision type:** FROZEN
- **Authorization stage:** Governance decision / implementation approval
- **Summary:** Establish SPC programme freeze
- **Included scope:** Pause new large features and redesign expansion. Allow explicitly approved SPC convergence, approved release blockers, approved critical production/security/data-integrity fixes and explicitly approved bounded operational fixes. Freeze RD/#481 unless admitted through separately approved exact SPC work units. RD/SR/repair branches are feeders only; `integration/shalean-release` is sole release candidate; `main` remains production code authority.
- **Explicit exclusions:** Broad expansion without freeze amendment/lift, alternative release authorities, automatic admission from existing branches/PRs, main merge, production deployment, production DB/data changes, financial and messaging actions.
- **Decision authority:** Farai.
- **Approval evidence:** Explicit Farai approval recorded in the release-control freeze section and PR #486 remediation record; exact approval timestamp NOT VERIFIED.
- **Branch / PR:** `audit/spc-00-04-feature-freeze`; [PR #486](https://github.com/shalean-developer/shalean-platform/pull/486)
- **SHA:** Promoted governance: `7a03a80dcbad7af0618675c608fa6fc6707164ff`
- **Tracker reference:** [Fix Tracker row 5](https://docs.google.com/spreadsheets/d/1IwJRlBqziE74VdXb5EZCV2MpXsHMJDlgwRNmmvWEo_k/edit#gid=1001&range=A5:N5)
- **Production authorization:** Not granted
- **Evidence / provenance:** [SPC programme freeze](./README.md#spc-programme-freeze), tracker and [PR #486](https://github.com/shalean-developer/shalean-platform/pull/486).
- **Conditions / notes:** Freeze remains until explicitly lifted by Farai. New broad work requires explicit lift/amendment first; classification is not approval. Older direct-to-main PRs are deferred to SPC-01. Merge event separately indexed in SPC-DEC-0007.
- **Supersedes:** None

### SPC-DEC-0005 — Record master SPC skill integration merge

- **Decision ID:** SPC-DEC-0005
- **Recorded date:** 2026-09-05 (UTC date)
- **Recorder:** Codex, under Farai's explicit SPC-00-05 implementation authorization
- **Decision date/time:** Merge event: 2026-09-05 01:40:10 UTC; approval time NOT VERIFIED
- **Related SPC Task ID:** NOT VERIFIED — pre-task bootstrap; programme SPC-00
- **Decision type:** APPROVED
- **Authorization stage:** Integration merge event
- **Summary:** Record master SPC skill integration merge
- **Included scope:** Only `.agents/skills/shalean-spc/SKILL.md` merged into `integration/shalean-release`.
- **Explicit exclusions:** Application code, database changes, CI changes, production-data changes and deployment.
- **Decision authority:** Merge actor verified; separate approval identity/text/time NOT VERIFIED.
- **Approval evidence:** GitHub merge event verified; separate merge-approval record NOT VERIFIED.
- **Branch / PR:** `chore/codex-spc-bootstrap` → `integration/shalean-release`; [PR #484](https://github.com/shalean-developer/shalean-platform/pull/484)
- **SHA:** Merge: `9f190024d77340a53c882c9bc15b5dd4742aadf4`
- **Tracker reference:** [Programme tracker](https://docs.google.com/spreadsheets/d/1IwJRlBqziE74VdXb5EZCV2MpXsHMJDlgwRNmmvWEo_k/edit#gid=1001); exact bootstrap task row NOT VERIFIED
- **Production authorization:** Not granted
- **Evidence / provenance:** [PR #484](https://github.com/shalean-developer/shalean-platform/pull/484) mergedAt and mergeCommit; merge actor `shalean-developer` (profile name Farai Chitekedza).
- **Conditions / notes:** APPROVED is the bootstrap classification, not proof of separate approval. Merge actor identity is not inferred approval authority; merge time is not approval time.
- **Supersedes:** None

### SPC-DEC-0006 — Record database skill integration merge

- **Decision ID:** SPC-DEC-0006
- **Recorded date:** 2026-09-05 (UTC date)
- **Recorder:** Codex, under Farai's explicit SPC-00-05 implementation authorization
- **Decision date/time:** Merge event: 2026-09-05 02:09:52 UTC; approval time NOT VERIFIED
- **Related SPC Task ID:** NOT VERIFIED — skill bootstrap supporting SPC-02
- **Decision type:** APPROVED
- **Authorization stage:** Integration merge event
- **Summary:** Record database skill integration merge
- **Included scope:** Only `.agents/skills/shalean-database/SKILL.md` merged into `integration/shalean-release`.
- **Explicit exclusions:** Database validation claims beyond skill documentation, migrations, application code, CI changes, data changes and deployment.
- **Decision authority:** Merge actor verified; separate approval identity/text/time NOT VERIFIED.
- **Approval evidence:** GitHub merge event verified; separate merge-approval record NOT VERIFIED.
- **Branch / PR:** `chore/codex-spc-database-skill` → `integration/shalean-release`; [PR #485](https://github.com/shalean-developer/shalean-platform/pull/485)
- **SHA:** Merge: `270748f6ecb394a8c67c4f4ae9ce8013f4f0e97b`
- **Tracker reference:** [Programme tracker](https://docs.google.com/spreadsheets/d/1IwJRlBqziE74VdXb5EZCV2MpXsHMJDlgwRNmmvWEo_k/edit#gid=1001); exact bootstrap task row NOT VERIFIED
- **Production authorization:** Not granted
- **Evidence / provenance:** [PR #485](https://github.com/shalean-developer/shalean-platform/pull/485) mergedAt and mergeCommit; merge actor `shalean-developer` (profile name Farai Chitekedza).
- **Conditions / notes:** APPROVED is the bootstrap classification, not proof of separate approval. Skill merge does not establish database integrity; merge time is not approval time.
- **Supersedes:** None

### SPC-DEC-0007 — Record freeze-governance integration merge

- **Decision ID:** SPC-DEC-0007
- **Recorded date:** 2026-09-05 (UTC date)
- **Recorder:** Codex, under Farai's explicit SPC-00-05 implementation authorization
- **Decision date/time:** Merge event: 2026-09-05 04:54:32 UTC; separate merge-approval timestamp NOT VERIFIED
- **Related SPC Task ID:** SPC-00-04
- **Decision type:** APPROVED
- **Authorization stage:** Integration merge event
- **Summary:** Record freeze-governance integration merge
- **Included scope:** Only `docs/governance/release-control/README.md` programme-freeze governance merged into `integration/shalean-release`.
- **Explicit exclusions:** Main merge, production deployment, database changes, production-data changes, payments, refunds, payouts, outbound messaging and changes to other PRs.
- **Decision authority:** Farai approved remediation; separate merge-approval identity/text/time NOT VERIFIED.
- **Approval evidence:** Remediation approval recorded in README and PR body; GitHub verifies the merge event, not a separate approval timestamp.
- **Branch / PR:** `audit/spc-00-04-feature-freeze` → `integration/shalean-release`; [PR #486](https://github.com/shalean-developer/shalean-platform/pull/486)
- **SHA:** Merge: `7a03a80dcbad7af0618675c608fa6fc6707164ff`
- **Tracker reference:** [Fix Tracker row 5](https://docs.google.com/spreadsheets/d/1IwJRlBqziE74VdXb5EZCV2MpXsHMJDlgwRNmmvWEo_k/edit#gid=1001&range=A5:N5)
- **Production authorization:** Not granted
- **Evidence / provenance:** [PR #486](https://github.com/shalean-developer/shalean-platform/pull/486) mergedAt and mergeCommit; merge actor `shalean-developer` (profile name Farai Chitekedza); [freeze section](./README.md#spc-programme-freeze).
- **Conditions / notes:** Records promotion of SPC-DEC-0004; does not supersede its freeze. Merge timestamp is not approval timestamp.
- **Supersedes:** None
