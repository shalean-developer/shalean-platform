import "server-only";

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

const PREFIX = "v1:";

/**
 * Resolve a 32-byte AES key for social OAuth token encryption.
 * Prefer SOCIAL_TOKEN_ENCRYPTION_KEY (64-char hex or any passphrase).
 * Falls back to a key derived from GOOGLE_CLIENT_SECRET so GBP OAuth can ship
 * with the three primary Google env vars.
 */
export function resolveTokenEncryptionKey(): Buffer {
  const dedicated = process.env.SOCIAL_TOKEN_ENCRYPTION_KEY?.trim();
  if (dedicated) {
    if (/^[0-9a-fA-F]{64}$/.test(dedicated)) {
      return Buffer.from(dedicated, "hex");
    }
    return createHash("sha256").update(dedicated, "utf8").digest();
  }

  const googleSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (googleSecret) {
    return createHash("sha256").update(`shalean-social:${googleSecret}`, "utf8").digest();
  }

  throw new Error(
    "Missing SOCIAL_TOKEN_ENCRYPTION_KEY (or GOOGLE_CLIENT_SECRET fallback) for token encryption.",
  );
}

/** Encrypt a secret string (refresh/access tokens). Returns `v1:<iv>:<tag>:<ciphertext>` base64 parts. */
export function encryptSecret(plaintext: string): string {
  const key = resolveTokenEncryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString("base64")}:${tag.toString("base64")}:${encrypted.toString("base64")}`;
}

/** Decrypt a value produced by encryptSecret. Plain (legacy/unencrypted) values pass through. */
export function decryptSecret(ciphertext: string): string {
  if (!ciphertext.startsWith(PREFIX)) {
    return ciphertext;
  }
  const key = resolveTokenEncryptionKey();
  const parts = ciphertext.slice(PREFIX.length).split(":");
  if (parts.length !== 3) {
    throw new Error("Invalid encrypted token format.");
  }
  const [ivB64, tagB64, dataB64] = parts;
  const iv = Buffer.from(ivB64!, "base64");
  const tag = Buffer.from(tagB64!, "base64");
  const data = Buffer.from(dataB64!, "base64");
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

export function isEncryptedSecret(value: string | null | undefined): boolean {
  return Boolean(value?.startsWith(PREFIX));
}
