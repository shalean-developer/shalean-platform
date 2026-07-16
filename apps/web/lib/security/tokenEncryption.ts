import "server-only";

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

/**
 * Authenticated encryption for social OAuth tokens (MKT-001A / WS3).
 *
 * Envelope formats:
 *   v2:<keyId>:<iv b64>:<tag b64>:<ct b64>   (current — key-versioned)
 *   v1:<iv b64>:<tag b64>:<ct b64>           (legacy — no key id; decrypted by trying the keyring)
 *
 * Key management:
 * - The encryption key is INDEPENDENT of provider client secrets. It is read
 *   from MARKETING_OAUTH_ENCRYPTION_KEY (preferred) or the legacy
 *   SOCIAL_TOKEN_ENCRYPTION_KEY (kept for backward compatibility with existing
 *   deployments that already set a dedicated key).
 * - GOOGLE_CLIENT_SECRET is NEVER used to derive a key (removes the coupling that
 *   made secret rotation silently brick all stored tokens).
 * - Rotation: set MARKETING_OAUTH_ENCRYPTION_KEY to the new key and move the old
 *   value to MARKETING_OAUTH_ENCRYPTION_KEY_PREVIOUS. New writes always use the
 *   current key; reads still succeed for ciphertext encrypted with the previous
 *   (or legacy) key. Re-encrypt lazily on read and/or via the migration script.
 * - Missing key fails securely with a typed configuration error.
 */

const PREFIX_V2 = "v2:";
const PREFIX_V1 = "v1:";

export class TokenEncryptionConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TokenEncryptionConfigError";
  }
}

export class TokenDecryptionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TokenDecryptionError";
  }
}

type EncryptionKey = { id: string; key: Buffer };

/** Derive a 32-byte AES key from a hex string (64 chars) or an arbitrary passphrase. */
function deriveKeyBuffer(material: string): Buffer {
  const trimmed = material.trim();
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    return Buffer.from(trimmed, "hex");
  }
  return createHash("sha256").update(trimmed, "utf8").digest();
}

/** Non-secret key identifier = first 8 hex of sha256(keyBytes). Used to tag ciphertext. */
function keyIdFor(key: Buffer): string {
  return createHash("sha256").update(key).digest("hex").slice(0, 8);
}

function readEnvKey(name: string): string | null {
  const raw = process.env[name]?.trim();
  return raw ? raw : null;
}

/** The key used for all NEW encryption. Throws a config error if none is set. */
export function getCurrentEncryptionKey(): EncryptionKey {
  const material =
    readEnvKey("MARKETING_OAUTH_ENCRYPTION_KEY") ?? readEnvKey("SOCIAL_TOKEN_ENCRYPTION_KEY");
  if (!material) {
    throw new TokenEncryptionConfigError(
      "Missing MARKETING_OAUTH_ENCRYPTION_KEY. Configure a dedicated 64-char hex encryption key.",
    );
  }
  const key = deriveKeyBuffer(material);
  return { id: keyIdFor(key), key };
}

/**
 * All keys available for DECRYPTION, in priority order:
 * current → previous → legacy dedicated key. De-duplicated by key id.
 * Never includes a GOOGLE_CLIENT_SECRET-derived key.
 */
export function getDecryptionKeyring(): EncryptionKey[] {
  const materials = [
    readEnvKey("MARKETING_OAUTH_ENCRYPTION_KEY"),
    readEnvKey("MARKETING_OAUTH_ENCRYPTION_KEY_PREVIOUS"),
    readEnvKey("SOCIAL_TOKEN_ENCRYPTION_KEY"),
  ].filter((m): m is string => Boolean(m));

  const ring: EncryptionKey[] = [];
  const seen = new Set<string>();
  for (const material of materials) {
    const key = deriveKeyBuffer(material);
    const id = keyIdFor(key);
    if (seen.has(id)) continue;
    seen.add(id);
    ring.push({ id, key });
  }
  return ring;
}

/** Legacy-compatible accessor: the raw current key buffer. */
export function resolveTokenEncryptionKey(): Buffer {
  return getCurrentEncryptionKey().key;
}

/** Encrypt a secret with the CURRENT key. Returns `v2:<keyId>:<iv>:<tag>:<ct>` (base64 parts). */
export function encryptSecret(plaintext: string): string {
  const { id, key } = getCurrentEncryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX_V2}${id}:${iv.toString("base64")}:${tag.toString("base64")}:${encrypted.toString("base64")}`;
}

function decryptWithKey(iv: Buffer, tag: Buffer, data: Buffer, key: Buffer): string {
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

/**
 * Decrypt a value produced by {@link encryptSecret} (v2) or the legacy v1 format.
 * Non-prefixed (legacy plaintext) values pass through unchanged.
 * Throws {@link TokenDecryptionError} when no configured key can authenticate the ciphertext.
 */
export function decryptSecret(ciphertext: string): string {
  if (ciphertext.startsWith(PREFIX_V2)) {
    const parts = ciphertext.slice(PREFIX_V2.length).split(":");
    if (parts.length !== 4) {
      throw new TokenDecryptionError("Invalid encrypted token format (v2).");
    }
    const [keyId, ivB64, tagB64, dataB64] = parts;
    const iv = Buffer.from(ivB64!, "base64");
    const tag = Buffer.from(tagB64!, "base64");
    const data = Buffer.from(dataB64!, "base64");
    const ring = getDecryptionKeyring();
    if (!ring.length) {
      throw new TokenEncryptionConfigError("No encryption key configured for decryption.");
    }
    // Prefer the key whose id matches; fall back to trying the rest.
    const ordered = [...ring].sort((a, b) => (a.id === keyId ? -1 : b.id === keyId ? 1 : 0));
    for (const candidate of ordered) {
      try {
        return decryptWithKey(iv, tag, data, candidate.key);
      } catch {
        // try next key
      }
    }
    throw new TokenDecryptionError("Stored token could not be decrypted with any configured key.");
  }

  if (ciphertext.startsWith(PREFIX_V1)) {
    const parts = ciphertext.slice(PREFIX_V1.length).split(":");
    if (parts.length !== 3) {
      throw new TokenDecryptionError("Invalid encrypted token format (v1).");
    }
    const [ivB64, tagB64, dataB64] = parts;
    const iv = Buffer.from(ivB64!, "base64");
    const tag = Buffer.from(tagB64!, "base64");
    const data = Buffer.from(dataB64!, "base64");
    const ring = getDecryptionKeyring();
    if (!ring.length) {
      throw new TokenEncryptionConfigError("No encryption key configured for decryption.");
    }
    for (const candidate of ring) {
      try {
        return decryptWithKey(iv, tag, data, candidate.key);
      } catch {
        // try next key
      }
    }
    throw new TokenDecryptionError("Stored token could not be decrypted with any configured key.");
  }

  // Legacy plaintext (never encrypted) — pass through.
  return ciphertext;
}

export function isEncryptedSecret(value: string | null | undefined): boolean {
  return Boolean(value?.startsWith(PREFIX_V2) || value?.startsWith(PREFIX_V1));
}

/**
 * True when a stored value should be re-encrypted with the current key:
 * legacy plaintext, v1, or v2 tagged with a non-current key id.
 */
export function needsReEncryption(value: string | null | undefined): boolean {
  if (!value) return false;
  if (!isEncryptedSecret(value)) return true; // plaintext should be encrypted
  if (value.startsWith(PREFIX_V1)) return true;
  const currentId = getCurrentEncryptionKey().id;
  const keyId = value.slice(PREFIX_V2.length).split(":")[0];
  return keyId !== currentId;
}
