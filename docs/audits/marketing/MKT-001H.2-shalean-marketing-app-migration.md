# MKT-001H.2 — Shalean Marketing Meta App Migration (staging)

**Date:** 2026-07-17  
**Target:** `staging` only  
**Production credentials:** **NO-GO**  
**Delete Shalean Marketing Hub:** **NO-GO** (keep as rollback until production migration + window)

---

## Objective

> Replace **Shalean Marketing Hub** in staging with **Shalean Marketing**, prove Facebook and Instagram paths, then retire the old app only after production migration and rollback assurance.

## Governance

| Action | Decision |
| --- | --- |
| Configure Shalean Marketing | **GO** |
| Switch staging credentials | **GO** |
| Test Facebook and Instagram | **GO** |
| Change production credentials | **NO-GO** |
| Delete Shalean Marketing Hub now | **NO-GO** |

## Dual Login for Business configs

| Env var | Meta Login variation | Used by |
| --- | --- | --- |
| `FACEBOOK_LOGIN_CONFIG_ID` | **General** | Connect Facebook |
| `INSTAGRAM_LOGIN_CONFIG_ID` | **Instagram Graph API** | Connect Instagram (`?purpose=instagram`) |

Also required (staging Preview only — not Production):

```text
FACEBOOK_APP_ID          # Shalean Marketing
FACEBOOK_APP_SECRET      # Shalean Marketing (never commit / never paste in chat)
FACEBOOK_REDIRECT_URI    # exact staging callback URL
```

Staging redirect URI (exact):

```text
https://shalean-platform-git-staging-shalean-cleaning-services.vercel.app/api/oauth/facebook/callback
```

## Operator sequence

1. Keep **both** Meta apps (Hub = rollback, Marketing = replacement).
2. Finish Shalean Marketing: General config + Instagram Graph API config, assets, permissions, redirect URI.
3. Update **staging** Vercel Preview env vars only (not Production).
4. Redeploy staging → record deployment ID + SHA → verify `/api/health/environment`.
5. In Connected Accounts: Disconnect Facebook → Connect Facebook (General) → Connect Instagram (Instagram Graph API OAuth) → approve → confirm IG discovery.
6. Run full smoke matrix (FB + IG publish, reconnect, disconnect, queue, redaction).
7. Retire Hub only after production PASS + multi-day rollback window:
   - mark Hub deprecated
   - remove Hub credentials from staging
   - confirm no traffic
   - preserve evidence
   - archive/delete later

## App code (this branch)

- `FACEBOOK_LOGIN_CONFIG_ID` / `INSTAGRAM_LOGIN_CONFIG_ID` resolution
- `GET /api/oauth/facebook?purpose=instagram`
- Instagram connect returns `authorizationUrl` when Instagram config is set
- Callback with Instagram purpose also runs Page-linked IG discovery

## Secrets policy

Do **not** share App Secret or paste it into chat, PRs, or git. Record values only in Vercel / password manager.
