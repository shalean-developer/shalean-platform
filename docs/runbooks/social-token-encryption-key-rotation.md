# Runbook — Social OAuth Token Encryption Key Rotation

**Owner:** Platform / Security
**Scope:** `MARKETING_OAUTH_ENCRYPTION_KEY` used to encrypt Google Business (and future social) OAuth tokens stored in `public.social_accounts`.
**Source:** MKT-001A / WS3 (`apps/web/lib/security/tokenEncryption.ts`).

## Background

Stored OAuth tokens are encrypted with **AES-256-GCM**. Ciphertext is key-versioned:

```
v2:<keyId>:<iv b64>:<tag b64>:<ciphertext b64>
```

- `keyId` = first 8 hex chars of `sha256(key)` (non-secret; identifies which key encrypted the row).
- Legacy `v1:<iv>:<tag>:<ct>` records (no key id) are still decryptable by trying every configured key.
- The key is **independent of `GOOGLE_CLIENT_SECRET`** — rotating the OAuth client secret no longer affects token decryption.

Key sources (priority order):

1. `MARKETING_OAUTH_ENCRYPTION_KEY` — **current** key (used for all new writes).
2. `MARKETING_OAUTH_ENCRYPTION_KEY_PREVIOUS` — decrypt-only, for rotation.
3. `SOCIAL_TOKEN_ENCRYPTION_KEY` — legacy decrypt-only source (backward compatibility).

`GOOGLE_CLIENT_SECRET` is **never** used to derive a key.

## Generate a key

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Store it in the secret manager / Vercel env. **Never** commit it or print it in reports/logs.

## Rotation procedure (zero-downtime)

1. **Deploy MKT-001A code** (reads legacy + v2, writes v2). No behaviour change if the key is unchanged.
2. **Add the new key** as `MARKETING_OAUTH_ENCRYPTION_KEY` and move the **old** value to `MARKETING_OAUTH_ENCRYPTION_KEY_PREVIOUS`. Redeploy.
   - New writes use the new key; existing rows still decrypt via the previous key.
3. **Re-encrypt existing rows** to the new key, either:
   - **Lazily:** every successful token read re-encrypts a stale row automatically (`maybeReEncryptStoredTokens` in `apps/web/lib/google-business.ts`), or
   - **Actively:** run the controlled migration script (from `apps/web`):
     ```bash
     cd apps/web
     node --env-file=.env.local scripts/reencrypt-social-tokens.mjs           # dry run (counts only)
     node --env-file=.env.local scripts/reencrypt-social-tokens.mjs --apply    # perform re-encryption
     ```
     Requires `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` and the key env vars. It never prints token values.
4. **Verify** the reported counts: `total`, `already_current`, `reencrypted`, `undecryptable` (should be 0).
5. **Remove** `MARKETING_OAUTH_ENCRYPTION_KEY_PREVIOUS` in a later approved release once all rows are `v2:<currentKeyId>:` and no `undecryptable` rows remain.

## First-time setup (from the legacy fallback)

Production may currently rely on the removed `GOOGLE_CLIENT_SECRET`-derived key (records written before this release).

1. Compute the legacy key hex from the old secret and set it as `MARKETING_OAUTH_ENCRYPTION_KEY_PREVIOUS` so old rows decrypt:
   ```bash
   # legacy key = sha256("shalean-social:" + <old GOOGLE_CLIENT_SECRET>)
   node -e "const s=process.argv[1];console.log(require('crypto').createHash('sha256').update('shalean-social:'+s).digest('hex'))" "<OLD_GOOGLE_CLIENT_SECRET>"
   ```
   (Run locally in a secure shell; do not log the output to shared systems.)
   > If the deployment previously set `SOCIAL_TOKEN_ENCRYPTION_KEY`, use that value as `MARKETING_OAUTH_ENCRYPTION_KEY_PREVIOUS` instead — no derivation needed.
2. Set a fresh `MARKETING_OAUTH_ENCRYPTION_KEY`.
3. Run the re-encryption script (step 3 above).
4. Remove the `_PREVIOUS` key after verification.

## Recovery

- **Missing key:** the app raises a typed configuration error and refuses to publish; connected accounts appear read-only. Restore the key env var and redeploy.
- **Undecryptable rows** (no configured key authenticates them): the account owner must **reconnect** Google Business Profile from Connected Accounts (fresh consent). This affects only that provider.

## Validation

```bash
cd apps/web && npx vitest run lib/security/__tests__/tokenEncryption.test.ts
```
Covers round-trip, unique ciphertext, tamper detection, wrong/missing key, previous-key + legacy-v1 decryption, migration to current key, and the no-`GOOGLE_CLIENT_SECRET`-fallback guarantee.
