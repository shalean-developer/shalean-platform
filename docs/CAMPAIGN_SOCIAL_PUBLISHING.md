# Campaign social publishing

## In Office (after Generate)

1. Open **Growth → Social** (or **Assets**)
2. On each channel card:
   - **Copy text** — caption / email HTML
   - **Download PNG** — branded image at the correct size
   - **Post to Facebook** (Facebook cards only) — publishes image + caption to your Page when configured

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

## Manual fallback

1. Copy text from Social
2. Download PNG from Social or Assets
3. Facebook → Create post → paste + upload image → Publish
