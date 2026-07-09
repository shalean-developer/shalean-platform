import { sleep } from "./utils.ts";
import type { WorkerConfig } from "./config.ts";

const OUTCOMES: { t: number; ok: boolean }[] = [];
const OUTCOME_CAP = 80;
const CIRCUIT_WINDOW_MS = 60_000;
const CIRCUIT_FAILURE_RATE = 0.2;
const CIRCUIT_MIN_SAMPLES = 8;
const CIRCUIT_PAUSE_MS = 60_000;

let circuitOpenUntil = 0;
let lastSendAt = 0;

function minSpacingMs(cfg: WorkerConfig): number {
  const rate = cfg.whatsappMaxSendRate;
  return Math.ceil(1000 / Math.max(0.5, rate));
}

export async function throttleWhatsAppMetaSend(cfg: WorkerConfig): Promise<void> {
  const spacing = minSpacingMs(cfg);
  const now = Date.now();
  const wait = Math.max(0, lastSendAt + spacing - now);
  if (wait > 0) await sleep(wait);
  lastSendAt = Date.now();
}

function pruneOutcomes(now: number): void {
  while (OUTCOMES.length > 0 && OUTCOMES[0]!.t < now - CIRCUIT_WINDOW_MS) {
    OUTCOMES.shift();
  }
}

export function recordMetaSendOutcome(ok: boolean): void {
  const now = Date.now();
  pruneOutcomes(now);
  OUTCOMES.push({ t: now, ok });
  if (OUTCOMES.length > OUTCOME_CAP) {
    OUTCOMES.splice(0, OUTCOMES.length - OUTCOME_CAP);
  }
  const fails = OUTCOMES.filter((o) => !o.ok).length;
  if (OUTCOMES.length >= CIRCUIT_MIN_SAMPLES && fails / OUTCOMES.length >= CIRCUIT_FAILURE_RATE) {
    circuitOpenUntil = now + CIRCUIT_PAUSE_MS;
  }
}

export function isMetaSendCircuitOpen(): boolean {
  return Date.now() < circuitOpenUntil;
}

export function metaCircuitOpenRemainingMs(): number {
  return Math.max(0, circuitOpenUntil - Date.now());
}
