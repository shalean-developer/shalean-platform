#!/usr/bin/env node
/**
 * MKT-001A / WS3 — Controlled re-encryption of stored social OAuth tokens.
 *
 * Re-encrypts `social_accounts.access_token` / `refresh_token` from a legacy (v1)
 * or previous-key (v2) envelope to the CURRENT key. Safe to re-run; never prints
 * token values, ciphertext, or keys.
 *
 * Envelope format mirrors apps/web/lib/security/tokenEncryption.ts:
 *   v2:<keyId>:<iv b64>:<tag b64>:<ct b64>   (current)
 *   v1:<iv b64>:<tag b64>:<ct b64>           (legacy, no key id)
 *
 * Usage (from apps/web):
 *   node --env-file=.env.local scripts/reencrypt-social-tokens.mjs           # dry run
 *   node --env-file=.env.local scripts/reencrypt-social-tokens.mjs --apply    # apply
 *
 * Env required:
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *   MARKETING_OAUTH_ENCRYPTION_KEY (current)
 *   MARKETING_OAUTH_ENCRYPTION_KEY_PREVIOUS and/or SOCIAL_TOKEN_ENCRYPTION_KEY (decrypt-only, optional)
 */

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const APPLY = process.argv.includes("--apply");
const PREFIX_V2 = "v2:";
const PREFIX_V1 = "v1:";

function deriveKey(material) {
  const trimmed = String(material).trim();
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) return Buffer.from(trimmed, "hex");
  return createHash("sha256").update(trimmed, "utf8").digest();
}
function keyIdFor(key) {
  return createHash("sha256").update(key).digest("hex").slice(0, 8);
}

function fail(message) {
  console.error(`[reencrypt] ${message}`);
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
if (!url || !serviceKey) fail("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.");

const currentMaterial =
  process.env.MARKETING_OAUTH_ENCRYPTION_KEY?.trim() ||
  process.env.SOCIAL_TOKEN_ENCRYPTION_KEY?.trim();
if (!currentMaterial) fail("Missing MARKETING_OAUTH_ENCRYPTION_KEY.");

const currentKey = { key: deriveKey(currentMaterial) };
currentKey.id = keyIdFor(currentKey.key);

const ring = [];
const seen = new Set();
for (const material of [
  process.env.MARKETING_OAUTH_ENCRYPTION_KEY,
  process.env.MARKETING_OAUTH_ENCRYPTION_KEY_PREVIOUS,
  process.env.SOCIAL_TOKEN_ENCRYPTION_KEY,
].filter(Boolean)) {
  const key = deriveKey(material);
  const id = keyIdFor(key);
  if (seen.has(id)) continue;
  seen.add(id);
  ring.push({ id, key });
}

function encryptCurrent(plaintext) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", currentKey.key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX_V2}${currentKey.id}:${iv.toString("base64")}:${tag.toString("base64")}:${enc.toString("base64")}`;
}

function tryDecrypt(value) {
  if (!value) return { kind: "empty" };
  if (!value.startsWith(PREFIX_V2) && !value.startsWith(PREFIX_V1)) return { kind: "plaintext", text: value };
  const isV2 = value.startsWith(PREFIX_V2);
  const parts = value.slice((isV2 ? PREFIX_V2 : PREFIX_V1).length).split(":");
  const expected = isV2 ? 4 : 3;
  if (parts.length !== expected) return { kind: "malformed" };
  const [ivB64, tagB64, dataB64] = isV2 ? parts.slice(1) : parts;
  const iv = Buffer.from(ivB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  const data = Buffer.from(dataB64, "base64");
  for (const cand of ring) {
    try {
      const d = createDecipheriv("aes-256-gcm", cand.key, iv);
      d.setAuthTag(tag);
      const text = Buffer.concat([d.update(data), d.final()]).toString("utf8");
      return { kind: "ok", text };
    } catch {
      // try next
    }
  }
  return { kind: "undecryptable" };
}

function needsReEncryption(value) {
  if (!value) return false;
  if (!value.startsWith(PREFIX_V2) && !value.startsWith(PREFIX_V1)) return true;
  if (value.startsWith(PREFIX_V1)) return true;
  const keyId = value.slice(PREFIX_V2.length).split(":")[0];
  return keyId !== currentKey.id;
}

async function main() {
  const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data, error } = await supabase
    .from("social_accounts")
    .select("id, provider, access_token, refresh_token");
  if (error) fail(`Query failed: ${error.message}`);

  const stats = { total: 0, already_current: 0, reencrypted: 0, undecryptable: 0 };

  for (const row of data ?? []) {
    stats.total++;
    const patch = {};
    let rowUndecryptable = false;

    for (const field of ["access_token", "refresh_token"]) {
      const value = row[field];
      if (!value) continue;
      if (!needsReEncryption(value)) continue;
      const dec = tryDecrypt(value);
      if (dec.kind === "ok" || dec.kind === "plaintext") {
        patch[field] = encryptCurrent(dec.text);
      } else {
        rowUndecryptable = true;
      }
    }

    if (rowUndecryptable) {
      stats.undecryptable++;
      console.warn(`[reencrypt] row ${row.id} (${row.provider}): a token could not be decrypted — reconnect required.`);
      continue;
    }
    if (Object.keys(patch).length === 0) {
      stats.already_current++;
      continue;
    }
    if (APPLY) {
      patch.updated_at = new Date().toISOString();
      const { error: upErr } = await supabase.from("social_accounts").update(patch).eq("id", row.id);
      if (upErr) {
        console.error(`[reencrypt] row ${row.id}: update failed: ${upErr.message}`);
        continue;
      }
    }
    stats.reencrypted++;
  }

  console.log(`[reencrypt] mode=${APPLY ? "APPLY" : "DRY-RUN"} currentKeyId=${currentKey.id}`);
  console.log(`[reencrypt] total=${stats.total} already_current=${stats.already_current} reencrypted=${stats.reencrypted} undecryptable=${stats.undecryptable}`);
  if (!APPLY && stats.reencrypted > 0) {
    console.log("[reencrypt] Re-run with --apply to persist changes.");
  }
  if (stats.undecryptable > 0) process.exitCode = 2;
}

main().catch((e) => fail(e instanceof Error ? e.message : String(e)));
