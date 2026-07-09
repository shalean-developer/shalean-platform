import crypto from "crypto";

/** Unambiguous alphabet — excludes I, O, 0, 1 to reduce typos. */
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const LEGACY_CODE_RE = /^SHALEAN\d{4,6}$/;
const STRONG_CODE_RE = /^SHALEAN[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6,10}$/;

export function isValidReferralCodeFormat(code: string): boolean {
  const normalized = code.trim().toUpperCase();
  if (!normalized.startsWith("SHALEAN")) return false;
  return LEGACY_CODE_RE.test(normalized) || STRONG_CODE_RE.test(normalized);
}

function randomSuffix(length: number): string {
  let out = "";
  for (let i = 0; i < length; i++) {
    out += CODE_ALPHABET[crypto.randomInt(0, CODE_ALPHABET.length)];
  }
  return out;
}

/** Generate a new referral code (~32^8 combinations for new issuances). */
export function generateReferralCodeCandidate(): string {
  return `SHALEAN${randomSuffix(8)}`;
}
