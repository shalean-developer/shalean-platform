/**
 * MKT-001C — Provider registry / factory.
 *
 * Discovery, lookup, lifecycle metadata, capability queries, feature flags.
 * Core publishing must resolve providers only through this module.
 */

import "server-only";

import type {
  ProviderCapabilities,
  ProviderKey,
  ProviderRegistryEntry,
  SocialProvider,
} from "@/lib/promotions/providers/types";

const FEATURE_FLAG_PREFIX = "MARKETING_PROVIDER_";

/** Default-on for live adapters; stubs stay off until explicitly enabled. */
const DEFAULT_ENABLED: Record<ProviderKey, boolean> = {
  facebook: true,
  google_business: true,
  instagram: false,
  linkedin: false,
  pinterest: false,
  x: false,
};

function featureFlagEnvName(key: ProviderKey): string {
  return `${FEATURE_FLAG_PREFIX}${key.toUpperCase()}`;
}

/**
 * Feature-flag resolution:
 * - MARKETING_PROVIDER_<KEY>=0|false|off → disabled
 * - MARKETING_PROVIDER_<KEY>=1|true|on → enabled
 * - unset → DEFAULT_ENABLED[key]
 */
export function isProviderFeatureEnabled(key: ProviderKey): boolean {
  const raw = process.env[featureFlagEnvName(key)]?.trim().toLowerCase();
  if (raw === "0" || raw === "false" || raw === "off" || raw === "disabled") {
    return false;
  }
  if (raw === "1" || raw === "true" || raw === "on" || raw === "enabled") {
    return true;
  }
  return DEFAULT_ENABLED[key] ?? false;
}

export class ProviderRegistry {
  private readonly entries = new Map<ProviderKey, ProviderRegistryEntry>();

  register(provider: SocialProvider): void {
    if (this.entries.has(provider.key)) {
      throw new Error(`Provider already registered: ${provider.key}`);
    }
    const flag = featureFlagEnvName(provider.key);
    this.entries.set(provider.key, {
      provider,
      registeredAt: new Date().toISOString(),
      featureFlag: flag,
      enabled: isProviderFeatureEnabled(provider.key),
    });
  }

  /** Replace an existing registration (tests / hot-reload). */
  registerOrReplace(provider: SocialProvider): void {
    const flag = featureFlagEnvName(provider.key);
    this.entries.set(provider.key, {
      provider,
      registeredAt: new Date().toISOString(),
      featureFlag: flag,
      enabled: isProviderFeatureEnabled(provider.key),
    });
  }

  has(key: ProviderKey): boolean {
    return this.entries.has(key);
  }

  listKeys(): ProviderKey[] {
    return [...this.entries.keys()];
  }

  listEntries(): ProviderRegistryEntry[] {
    return [...this.entries.values()].map((e) => ({
      ...e,
      enabled: isProviderFeatureEnabled(e.provider.key),
    }));
  }

  /**
   * Lookup a registered provider. Throws if unknown.
   * Does not enforce the feature flag (use requireEnabled for publish).
   */
  get(key: ProviderKey): SocialProvider {
    const entry = this.entries.get(key);
    if (!entry) {
      throw new ProviderNotFoundError(key);
    }
    return entry.provider;
  }

  tryGet(key: ProviderKey): SocialProvider | null {
    return this.entries.get(key)?.provider ?? null;
  }

  /**
   * Resolve a provider that is registered and feature-flag enabled.
   */
  requireEnabled(key: ProviderKey): SocialProvider {
    const entry = this.entries.get(key);
    if (!entry) {
      throw new ProviderNotFoundError(key);
    }
    if (!isProviderFeatureEnabled(key)) {
      throw new ProviderDisabledError(key, entry.featureFlag);
    }
    return entry.provider;
  }

  getCapabilities(key: ProviderKey): ProviderCapabilities {
    return this.requireEnabled(key).getCapabilities();
  }

  listCapabilities(): Array<{
    key: ProviderKey;
    capabilities: ProviderCapabilities;
    enabled: boolean;
  }> {
    return this.listEntries().map((e) => ({
      key: e.provider.key,
      capabilities: e.provider.getCapabilities(),
      enabled: isProviderFeatureEnabled(e.provider.key),
    }));
  }
}

export class ProviderNotFoundError extends Error {
  readonly key: ProviderKey;
  constructor(key: ProviderKey) {
    super(`Unsupported marketing provider: ${key}`);
    this.name = "ProviderNotFoundError";
    this.key = key;
  }
}

export class ProviderDisabledError extends Error {
  readonly key: ProviderKey;
  readonly featureFlag: string;
  constructor(key: ProviderKey, featureFlag: string) {
    super(`Marketing provider disabled by feature flag ${featureFlag}: ${key}`);
    this.name = "ProviderDisabledError";
    this.key = key;
    this.featureFlag = featureFlag;
  }
}

/** Process-wide default registry (populated by bootstrap). */
let defaultRegistry: ProviderRegistry | null = null;

export function setProviderRegistryForTests(registry: ProviderRegistry | null): void {
  defaultRegistry = registry;
}

export function createEmptyProviderRegistry(): ProviderRegistry {
  return new ProviderRegistry();
}

/**
 * Process-wide registry. Call `bootstrapProviderRegistry()` once at module load
 * (see providers/index.ts) or inject via setProviderRegistryForTests in unit tests.
 */
export function getProviderRegistry(): ProviderRegistry {
  if (!defaultRegistry) {
    throw new Error(
      "Provider registry not initialized. Import @/lib/promotions/providers (bootstrap) or setProviderRegistryForTests.",
    );
  }
  return defaultRegistry;
}
