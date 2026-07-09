/**
 * Environment validation for Supabase Edge Functions.
 */

export type WorkerConfig = {
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  cronSecret: string;
  whatsappAccessToken: string | undefined;
  whatsappPhoneNumberId: string | undefined;
  whatsappGraphApiVersion: string;
  whatsappQueueRetryBaseSec: number;
  whatsappQueueBackpressureThreshold: number;
  whatsappQueueCircuitRetryMaxMs: number;
  whatsappMaxSendRate: number;
  whatsappFallbackTemplateName: string | undefined;
  whatsappFallbackTemplateLang: string;
};

function env(key: string): string | undefined {
  return Deno.env.get(key)?.trim() || undefined;
}

function envInt(key: string, defaultValue: number, min: number, max: number): number {
  const raw = env(key);
  if (!raw) return defaultValue;
  const n = Number(raw);
  if (!Number.isFinite(n)) return defaultValue;
  return Math.min(max, Math.max(min, Math.round(n)));
}

/** Load and validate required env vars for cron workers. */
export function loadWorkerConfig(): WorkerConfig {
  const supabaseUrl = env("SUPABASE_URL") ?? env("NEXT_PUBLIC_SUPABASE_URL");
  const supabaseServiceRoleKey = env("SUPABASE_SERVICE_ROLE_KEY") ?? env("SUPABASE_SERVICE_KEY");
  const cronSecret = env("CRON_SECRET");

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
  }
  if (!cronSecret) {
    throw new Error("CRON_SECRET is required");
  }

  return {
    supabaseUrl,
    supabaseServiceRoleKey,
    cronSecret,
    whatsappAccessToken: env("WHATSAPP_ACCESS_TOKEN") ?? env("WHATSAPP_API_TOKEN"),
    whatsappPhoneNumberId: env("WHATSAPP_PHONE_NUMBER_ID"),
    whatsappGraphApiVersion: env("WHATSAPP_GRAPH_API_VERSION") ?? "v19.0",
    whatsappQueueRetryBaseSec: envInt("WHATSAPP_QUEUE_RETRY_BASE_SEC", 60, 1, 3600),
    whatsappQueueBackpressureThreshold: envInt("WHATSAPP_QUEUE_BACKPRESSURE_THRESHOLD", 1000, 0, 100_000),
    whatsappQueueCircuitRetryMaxMs: envInt("WHATSAPP_QUEUE_CIRCUIT_RETRY_MAX_MS", 25_000, 5000, 120_000),
    whatsappMaxSendRate: envInt("WHATSAPP_MAX_SEND_RATE", 20, 1, 80) / 1,
    whatsappFallbackTemplateName: env("WHATSAPP_FALLBACK_TEMPLATE_NAME"),
    whatsappFallbackTemplateLang: env("WHATSAPP_FALLBACK_TEMPLATE_LANG") ?? "en",
  };
}

export const BATCH_LIMITS = {
  whatsappWorker: 15,
  whatsappWorkerMax: 50,
} as const;
