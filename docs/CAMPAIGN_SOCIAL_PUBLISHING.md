# Campaign social publishing

## In Office (after Generate)

1. Open **Growth → Social Posts** (or **Assets**)
2. On each channel card:
   - **Copy text** — caption / email HTML
   - **Download PNG** — branded image at the correct size
   - **Post to Facebook** (Facebook cards only) — publishes image + caption to your Page when configured
   - **Upload to Google Business** (Google Business cards only) — creates a local post with image when OAuth is connected

Also open **Growth → Connected Accounts** to connect Google Business Profile, pick a location, and review publish history.

## Facebook one-click env

```
FACEBOOK_PAGE_ID=your_numeric_page_id
FACEBOOK_PAGE_ACCESS_TOKEN=page_token_with_pages_manage_posts
```

Optional: `FACEBOOK_GRAPH_API_VERSION=v22.0` (default `v22.0`)

### Required token type (important)

`publish_actions` is **deprecated**. Do **not** use a User access token or any token that only had `publish_actions`.

You need a **Page access token** with:

- `pages_manage_posts`
- `pages_read_engagement`
- (usually also) `pages_show_list` when generating the token

### How to get a Page token (Graph API Explorer)

1. Open [Graph API Explorer](https://developers.facebook.com/tools/explorer/)
2. Select your Meta app
3. Add permissions: `pages_show_list`, `pages_manage_posts`, `pages_read_engagement`
4. Generate a **User** token (temporary) and grant Page access when prompted
5. `GET /me/accounts` — find your Page row
6. Copy that row’s **`access_token`** → `FACEBOOK_PAGE_ACCESS_TOKEN`
7. Copy that row’s **`id`** → `FACEBOOK_PAGE_ID`
8. For production, exchange for a long-lived Page token (or use a System User token from Meta Business Suite)

If you see `(#200) The permission(s) publish_actions are not available`, the env token is almost certainly a **User** token. Replace it with the Page token from step 6.

Without these env vars, Copy + Download PNG still work for manual posting in Meta Business Suite / Creator Studio.

## Google Business Profile (OAuth)

Google publishing uses the official OAuth 2.0 authorization-code flow with offline access (refresh tokens). Tokens are encrypted at rest in `social_accounts`.

### Env

```
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=https://shalean.co.za/api/oauth/google/callback
# REQUIRED once connected — dedicated AES-256-GCM key, independent of GOOGLE_CLIENT_SECRET:
MARKETING_OAUTH_ENCRYPTION_KEY=
# Optional during rotation (old key, kept until re-encryption completes):
# MARKETING_OAUTH_ENCRYPTION_KEY_PREVIOUS=
```

> **Security (MKT-001A):** Token encryption is decoupled from `GOOGLE_CLIENT_SECRET`.
> Set `MARKETING_OAUTH_ENCRYPTION_KEY` to a random 64-char hex value
> (`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`).
> Ciphertext is versioned (`v2:<keyId>:…`) so keys can be rotated without
> disconnecting accounts — see
> [`docs/runbooks/social-token-encryption-key-rotation.md`](./runbooks/social-token-encryption-key-rotation.md).
> The legacy `SOCIAL_TOKEN_ENCRYPTION_KEY` is still accepted as a key source; the
> old `GOOGLE_CLIENT_SECRET` fallback has been removed.

Local example redirect URI: `http://localhost:3000/api/oauth/google/callback`

### Google Cloud setup

1. Create (or reuse) a Google Cloud project
2. Enable APIs:
   - **My Business Account Management API**
   - **My Business Business Information API**
   - **Google My Business API** (Local Posts `v4`)
3. Configure the OAuth consent screen (Internal for Workspace-only, or External + test users)
4. Create **OAuth client ID** → Application type **Web application**
5. Add Authorized redirect URI = `GOOGLE_REDIRECT_URI`
6. Request scope: `https://www.googleapis.com/auth/business.manage`
7. Ensure the Google account that connects owns/manages the Business Profile location

### Connect flow

1. Admin opens **Growth → Connected Accounts**
2. Click **Connect** on Google Business Profile → Google consent
3. Callback stores encrypted refresh + access tokens, lists accounts/locations
4. If multiple locations exist, pick one on the Connected Accounts page
5. On **Social Posts**, use **Upload to Google Business** on a `google_business` card

### Publishing behaviour

- Captures/uploads the campaign image to the public `campaign-media` bucket (Local Posts require a public `sourceUrl`)
- Creates a `STANDARD` local post via `POST https://mybusiness.googleapis.com/v4/accounts/{accountId}/locations/{locationId}/localPosts`
- Auto-refreshes access tokens; reconnect only if the refresh token is revoked
- Writes `social_publish_history` + `promotion_audit_log` (`publish_google_business`)

### Routes

| Route | Purpose |
|-------|---------|
| `GET /api/oauth/google` | Start OAuth (Bearer returns `{ url }`; browser redirects) |
| `GET /api/oauth/google/callback` | Exchange code, store tokens, redirect to Connected Accounts |
| `GET/POST /api/admin/social-accounts` | Status, select location, refresh, disconnect |
| `GET/POST /api/admin/promotions/publish-google-business` | Diagnose + publish |

## Manual fallback

1. Copy text from Social
2. Download PNG from Social or Assets
3. Facebook → Create post → paste + upload image → Publish  
   or Google Business Profile → Create post → paste + upload image → Publish

## Provider architecture (MKT-001C / MKT-001D)

Publishing is orchestrated by `runPublish()` through a `SocialProvider` registry:

- Live adapters: `facebook`, `google_business`
- Registered stubs (copy/download only until adapters ship): `instagram`, `linkedin`, `pinterest`, `x`

### Feature flags

```
# Fail-closed: all providers DISABLED unless explicitly enabled (1|true|on|enabled).
# Unset must never expose an unfinished provider.
MARKETING_PROVIDER_FACEBOOK=1
MARKETING_PROVIDER_GOOGLE_BUSINESS=0
MARKETING_PROVIDER_INSTAGRAM=0
MARKETING_PROVIDER_LINKEDIN=0
MARKETING_PROVIDER_PINTEREST=0
MARKETING_PROVIDER_X=0
```

Enabling a stub flag alone does **not** implement API publishing — it only surfaces registry metadata. Do not enable stub flags in production without a real adapter + ledger migration.

Production releases must record the enabled set in `docs/releases/marketing-provider-release-manifest.md`.

### Failure responses

Publish APIs return structured fields (surfaced in Social Posts toasts):

- `error`, `classification`, `retryable`, `retryAfterMs`, `recoveryGuidance`, `correlationId`

### Operator surfaces

| Surface | Purpose |
|---------|---------|
| Growth → Social Posts | Edit caption, validate limits, publish FB/GBP, copy/download other channels |
| Growth → Connected Accounts | Registry-aligned platform cards, GBP OAuth, publish history filters |
| Growth → Platform Intelligence | Ops health, queue/DLQ, provider & campaign insights, rule-based recommendations |
| `GET /api/admin/promotions/providers` | Capability / flag snapshot (no secrets) |
| `GET /api/admin/promotions/publish-intelligence` | Aggregated intelligence snapshot (admin-only) |

### Governance

Provider-scoped production: GBP remains NO-GO under MKT-001A-PROD and stays disabled by flag. Facebook (then Instagram via MKT-001G) may proceed through independent gates. See `docs/audits/marketing/MKT-001-META-PRODUCTION-RELEASE-ASSESSMENT.md` and `docs/releases/marketing-provider-release-manifest.md`. Do not blind-promote the whole staging branch.
