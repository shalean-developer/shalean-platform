import type { SupabaseClient } from "@supabase/supabase-js";

export type LifecycleEmailSettings = {
  emailsEnabled: boolean;
  dryRunEnabled: boolean;
  frequencyLimitEnabled: boolean;
};

export type EffectiveLifecycleEmailSettings = LifecycleEmailSettings & {
  pausedByEnv: boolean;
  dryRunByEnv: boolean;
};

const DEFAULT_SETTINGS: LifecycleEmailSettings = {
  emailsEnabled: true,
  dryRunEnabled: false,
  frequencyLimitEnabled: true,
};

let cachedSettings: { at: number; value: LifecycleEmailSettings } | null = null;
const CACHE_TTL_MS = 30_000;

function parseEnvBool(raw: string | undefined): boolean | null {
  const v = raw?.trim().toLowerCase();
  if (v === "true" || v === "1" || v === "yes") return true;
  if (v === "false" || v === "0" || v === "no") return false;
  return null;
}

export function resolveEffectiveSettings(db: LifecycleEmailSettings): EffectiveLifecycleEmailSettings {
  const envEnabled = parseEnvBool(process.env.LIFECYCLE_EMAILS_ENABLED);
  const envDryRun = parseEnvBool(process.env.LIFECYCLE_EMAILS_DRY_RUN);

  const pausedByEnv = envEnabled === false;
  const dryRunByEnv = envDryRun === true;

  return {
    emailsEnabled: pausedByEnv ? false : db.emailsEnabled,
    dryRunEnabled: dryRunByEnv ? true : db.dryRunEnabled,
    frequencyLimitEnabled: db.frequencyLimitEnabled,
    pausedByEnv,
    dryRunByEnv,
  };
}

export async function getLifecycleEmailSettings(
  supabase: SupabaseClient,
): Promise<LifecycleEmailSettings> {
  const now = Date.now();
  if (cachedSettings && now - cachedSettings.at < CACHE_TTL_MS) {
    return cachedSettings.value;
  }

  const { data, error } = await supabase
    .from("lifecycle_email_settings")
    .select("emails_enabled, dry_run_enabled, frequency_limit_enabled")
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    cachedSettings = { at: now, value: DEFAULT_SETTINGS };
    return DEFAULT_SETTINGS;
  }

  const value: LifecycleEmailSettings = {
    emailsEnabled: data.emails_enabled !== false,
    dryRunEnabled: data.dry_run_enabled === true,
    frequencyLimitEnabled: data.frequency_limit_enabled !== false,
  };
  cachedSettings = { at: now, value };
  return value;
}

export async function getEffectiveLifecycleEmailSettings(
  supabase: SupabaseClient,
): Promise<EffectiveLifecycleEmailSettings> {
  const db = await getLifecycleEmailSettings(supabase);
  return resolveEffectiveSettings(db);
}

/** Clear in-process cache after admin updates settings. */
export function invalidateLifecycleEmailSettingsCache(): void {
  cachedSettings = null;
}
