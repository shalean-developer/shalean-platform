/**
 * Phase 8F: in-process Meta send pacing + circuit breaker (best-effort per server instance).
 * For multi-instance fleets, combine with Meta-side limits and queue backoff.
 */

const OUTCOMES: { t: number; ok: boolean }[] = [];
const OUTCOME_CAP = 80;
const CIRCUIT_WINDOW_MS = 60_000;
const CIRCUIT_FAILURE_RATE = 0.2;
const CIRCUIT_MIN_SAMPLES = 8;
const CIRCUIT_PAUSE_MS = 60_000;

let circuitOpenUntil = 0;
let lastSendAt = 0;

function maxSendsPerSecond(): number {
  const raw = process.env.WHATSAPP_MAX_SEND_RATE?.trim();
  const n = raw ? Number(raw) : 20;
  if (!Number.isFinite(n) || n < 0.5) return 20;
  return Math.min(80, Math.max(0.5, n));
}

/** Minimum spacing between Meta sends on this instance (ms). */
function minSpacingMs(): number {
  return Math.ceil(1000 / maxSendsPerSecond());
}

export async function throttleWhatsAppMetaSend(): Promise<void> {
  const spacing = minSpacingMs();
  const now = Date.now();
  const wait = Math.max(0, lastSendAt + spacing - now);
  if (wait > 0) {
    await new Promise((r) => setTimeout(r, wait));
  }
  lastSendAt = Date.now();
}

function pruneOutcomes(now: number): void {
  while (OUTCOMES.length && OUTCOMES[0]!.t < now - CIRCUIT_WINDOW_MS) {
    OUTCOMES.shift();
  }
}

export function recordMetaSendOutcome(ok: boolean): void {
  const now = Date.now();
  pruneOutcomes(now);
  OUTCOMES.push({ t: now, ok });
  if (OUTCOMES.length > OUTCOME_CAP) OUTCOMES.splice(0, OUTCOMES.length - OUTCOME_CAP);

  const fails = OUTCOMES.filter((o) => !o.ok).length;
  const total = OUTCOMES.length;
  if (total >= CIRCUIT_MIN_SAMPLES && fails / total >= CIRCUIT_FAILURE_RATE) {
    circuitOpenUntil = now + CIRCUIT_PAUSE_MS;
  }
}

export function isMetaSendCircuitOpen(): boolean {
  return Date.now() < circuitOpenUntil;
}

export function metaCircuitOpenRemainingMs(): number {
  return Math.max(0, circuitOpenUntil - Date.now());
}

/** For metrics / cron: reset only in tests if needed. */
export function resetMetaSafeguardsForTests(): void {
  OUTCOMES.length = 0;
  circuitOpenUntil = 0;
  lastSendAt = 0;
}
