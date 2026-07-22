# Executive Office Authorization — SEO-P2A-MIG + SEO-P2C-CWV (Read-Only Baselines)

| Field | Value |
|-------|-------|
| Document ID | `SEO-P2-EO-AUTH-2026-07-22` |
| Decision date | 2026-07-22 |
| Formal outcome | **Approved with conditions** (baselines only) |
| Authorization phrase | `Authorize repo/public-web read-only SEO-P2A-MIG and SEO-P2C-CWV baselines only` |
| Production / remediation authority | **NONE** |
| GSC / indexing authority | **NONE** |
| Plesk / profile / deploy authority | **NONE** |

---

## Decision

Executive Office authorizes **repo + public-web read-only baselines** for:

1. **SEO-P2A-MIG** — `.com` → `.co.za` migration HTTP / repo baseline  
2. **SEO-P2C-CWV** — Core Web Vitals **lab** baseline on canonical public URLs  

This authorization does **not** reopen SEO-MIG-002, does **not** authorize Search Console actions, and does **not** authorize any mutation class.

---

## Authorized scope

| In scope | Out of scope (explicitly frozen) |
|----------|----------------------------------|
| Read repository SEO migration map + related docs/tests | Plesk / hosting / DNS / `.htaccess` changes |
| Public HTTP `HEAD`/`GET` probes (no auth writes) | Profile / GBP / directory / social edits |
| Local Lighthouse lab runs against public `.co.za` URLs | Code changes / commits that alter application behaviour |
| Documentary filing of baseline evidence under `docs/audits/seo/` | Deployments / production releases |
| | Google Search Console access or writes |
| | URL Inspection / indexing requests |
| | PSI/CrUX field collection requiring paid quota (optional; not required) |

---

## Binding freezes (remain in force)

- SEO-MIG-002 GSC execution remains **Deferred / frozen** (`SEO-MIG-002-EO-DECISION-2026-07-22-DEFERRED`)
- No redirect engineering changes
- No metadata / schema / robots / sitemap production edits
- No analytics configuration changes

---

## Deliverables under this authorization

| ID | Path |
|----|------|
| Auth record (this file) | `docs/audits/seo/SEO-P2-EO-AUTH-2026-07-22.md` |
| P2A baseline | `docs/audits/seo/SEO-P2A-MIG-BASELINE-2026-07-22.md` |
| P2C baseline | `docs/audits/seo/SEO-P2C-CWV-BASELINE-2026-07-22.md` |
| P2A probe JSON | `docs/audits/seo/evidence/SEO-P2A-MIG-http-probes-2026-07-22.json` |
| P2C summary JSON | `docs/audits/seo/evidence/SEO-P2C-CWV-lighthouse-summary-2026-07-22.json` |
| P2C raw Lighthouse JSON | `docs/audits/seo/evidence/lh-*-2026-07-22.json` |

---

## Record control

| Field | Value |
|-------|-------|
| Version | 2026-07-22 |
| Effective date | 2026-07-22 |
| Change authority | Executive Office |
| Supersession | Does **not** supersede SEO-MIG-002 Deferred; authorizes documentary baselines only |
