import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createCipheriv, createHash, randomBytes } from "crypto";
import {
  decryptSecret,
  encryptSecret,
  getMarketingOAuthEncryptionHealth,
  isEncryptedSecret,
  isMarketingOAuthEncryptionConfigured,
  needsReEncryption,
  TokenDecryptionError,
  TokenEncryptionConfigError,
} from "@/lib/security/tokenEncryption";

const KEY_A = "a".repeat(64); // current
const KEY_B = "b".repeat(64); // previous / rotation
const KEY_C = "c".repeat(64); // unrelated

function keyBuffer(hex: string): Buffer {
  return Buffer.from(hex, "hex");
}
function keyId(hex: string): string {
  return createHash("sha256").update(keyBuffer(hex)).digest("hex").slice(0, 8);
}

/** Build a legacy v1 envelope (no key id) with an explicit key, for migration tests. */
function encryptV1(plaintext: string, hexKey: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyBuffer(hexKey), iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64")}:${tag.toString("base64")}:${enc.toString("base64")}`;
}

const ENV_KEYS = [
  "MARKETING_OAUTH_ENCRYPTION_KEY",
  "MARKETING_OAUTH_ENCRYPTION_KEY_PREVIOUS",
  "SOCIAL_TOKEN_ENCRYPTION_KEY",
  "GOOGLE_CLIENT_SECRET",
];

describe("tokenEncryption keyring (MKT-001A / WS3)", () => {
  const saved: Record<string, string | undefined> = {};
  beforeEach(() => {
    for (const k of ENV_KEYS) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
    process.env.MARKETING_OAUTH_ENCRYPTION_KEY = KEY_A;
  });
  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it("encrypt/decrypt round trip with the current key", () => {
    const c = encryptSecret("token-123");
    expect(c.startsWith(`v2:${keyId(KEY_A)}:`)).toBe(true);
    expect(decryptSecret(c)).toBe("token-123");
  });

  it("produces unique ciphertext for identical plaintext (random IV)", () => {
    expect(encryptSecret("same")).not.toBe(encryptSecret("same"));
  });

  it("detects tampering via the GCM auth tag", () => {
    const c = encryptSecret("token-123");
    const parts = c.split(":");
    const data = Buffer.from(parts[4]!, "base64");
    data[0] ^= 0xff;
    parts[4] = data.toString("base64");
    expect(() => decryptSecret(parts.join(":"))).toThrow(TokenDecryptionError);
  });

  it("fails to decrypt with an unrelated key only", () => {
    const c = encryptSecret("token-123");
    process.env.MARKETING_OAUTH_ENCRYPTION_KEY = KEY_C;
    delete process.env.MARKETING_OAUTH_ENCRYPTION_KEY_PREVIOUS;
    expect(() => decryptSecret(c)).toThrow(TokenDecryptionError);
  });

  it("throws a config error when no key is set", () => {
    delete process.env.MARKETING_OAUTH_ENCRYPTION_KEY;
    expect(() => encryptSecret("x")).toThrow(TokenEncryptionConfigError);
    expect(isMarketingOAuthEncryptionConfigured()).toBe(false);
    expect(getMarketingOAuthEncryptionHealth()).toEqual({
      configured: false,
      preferredKeyPresent: false,
      preferredKeyLooksHex64: false,
    });
  });

  it("reports encryption health without exposing key material", () => {
    process.env.MARKETING_OAUTH_ENCRYPTION_KEY = KEY_A;
    const health = getMarketingOAuthEncryptionHealth();
    expect(health).toEqual({
      configured: true,
      preferredKeyPresent: true,
      preferredKeyLooksHex64: true,
    });
    expect(JSON.stringify(health)).not.toContain(KEY_A);
  });

  it("decrypts a record written by the PREVIOUS key during rotation", () => {
    // Simulate: previously current key was B; now current is A, B is previous.
    process.env.MARKETING_OAUTH_ENCRYPTION_KEY = KEY_B;
    const oldCipher = encryptSecret("rotated-token");
    process.env.MARKETING_OAUTH_ENCRYPTION_KEY = KEY_A;
    process.env.MARKETING_OAUTH_ENCRYPTION_KEY_PREVIOUS = KEY_B;
    expect(decryptSecret(oldCipher)).toBe("rotated-token");
    // And it is flagged for re-encryption to the current key.
    expect(needsReEncryption(oldCipher)).toBe(true);
  });

  it("decrypts a legacy v1 record via the keyring (migration path)", () => {
    process.env.SOCIAL_TOKEN_ENCRYPTION_KEY = KEY_B; // legacy dedicated key
    const legacy = encryptV1("legacy-token", KEY_B);
    expect(decryptSecret(legacy)).toBe("legacy-token");
    expect(needsReEncryption(legacy)).toBe(true);
  });

  it("re-encrypting a v1/previous record yields current-key ciphertext", () => {
    process.env.MARKETING_OAUTH_ENCRYPTION_KEY_PREVIOUS = KEY_B;
    const legacy = encryptV1("legacy-token", KEY_B);
    const migrated = encryptSecret(decryptSecret(legacy));
    expect(migrated.startsWith(`v2:${keyId(KEY_A)}:`)).toBe(true);
    expect(needsReEncryption(migrated)).toBe(false);
  });

  it("throws on malformed ciphertext", () => {
    expect(() => decryptSecret("v2:deadbeef:only:three")).toThrow(TokenDecryptionError);
    expect(() => decryptSecret("v1:too:few")).not.toBe(undefined);
  });

  it("never uses GOOGLE_CLIENT_SECRET as a fallback key", () => {
    const c = encryptSecret("token-xyz");
    // Remove all real keys; set only GOOGLE_CLIENT_SECRET.
    delete process.env.MARKETING_OAUTH_ENCRYPTION_KEY;
    delete process.env.MARKETING_OAUTH_ENCRYPTION_KEY_PREVIOUS;
    delete process.env.SOCIAL_TOKEN_ENCRYPTION_KEY;
    process.env.GOOGLE_CLIENT_SECRET = "some-google-secret";
    // No usable key → config error, not a silent google-derived decrypt.
    expect(() => decryptSecret(c)).toThrow(TokenEncryptionConfigError);
  });

  it("passes through non-enveloped legacy plaintext", () => {
    expect(decryptSecret("plaintext-legacy")).toBe("plaintext-legacy");
    expect(isEncryptedSecret("plaintext-legacy")).toBe(false);
    expect(needsReEncryption("plaintext-legacy")).toBe(true);
  });
});
