# SEO-P1A Option B — Historical Snapshot (2026-07-22)

> Historical record only. This file preserves the July 2026 SEO-P1A provisional baseline for audit context. It is **not** current SEO architecture, routing, GSC, content, or release authorization.

## Original status

SEO Engineering recorded **Option B — approve with conditions (provisional, non-authoritative)** for baselining only. Implementation and GSC changes were explicitly frozen pending further governance approval.

## Original provisional decisions

- Proposed location spine: `/locations/{suburb}-cleaning-services` using the then-existing hub set.
- Stage 19 `/{intent}/{suburb}` routes were treated as non-canonical/legacy.
- City-intent ownership was proposed for `/`.
- Service catalogue/comparison intent was proposed for `/services`.
- Synthetic authority blocks and recent-booking vignettes were frozen from publication.
- Price claims had to be reconciled to the transactional pricing source of truth before any change.
- 410 Airbnb area URLs were removed from active landing matrices.
- Century City was unresolved at that time.
- Blog consolidation required evidence-led winner selection rather than bulk merging.
- Any P1B follow-up was to be split into separately approved scopes.

## Why the old branch is not merged directly

The source branch `docs/seo-p1a-option-b-baseline` is hundreds of commits behind current `main`. It also modifies `docs/master_seo_matrix.csv` and `docs/stage-19-local-seo-domination.md`, both of which have evolved since July 2026. Merging those stale planning files would risk overwriting current SEO state.

This snapshot preserves the decision history without making those old assumptions active again.
