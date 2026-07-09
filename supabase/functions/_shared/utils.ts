/** Constant-time string compare (Deno-safe, no Node crypto). */
export function timingSafeEqualString(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const bufA = enc.encode(a);
  const bufB = enc.encode(b);
  if (bufA.length !== bufB.length) return false;
  let result = 0;
  for (let i = 0; i < bufA.length; i++) {
    result |= bufA[i]! ^ bufB[i]!;
  }
  return result === 0;
}

export function clampBatchLimit(raw: unknown, defaultLimit: number, max: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return defaultLimit;
  return Math.min(Math.round(n), max);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export function metaWhatsAppToDigits(phone: string): string {
  return String(phone ?? "").replace(/\D/g, "");
}
