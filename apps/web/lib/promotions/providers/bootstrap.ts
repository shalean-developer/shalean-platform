/**
 * MKT-001C — Bootstrap the default provider registry.
 */

import "server-only";

import { createFacebookProvider } from "@/lib/promotions/providers/facebookProvider";
import { createGoogleBusinessProvider } from "@/lib/promotions/providers/googleBusinessProvider";
import { createInstagramProvider } from "@/lib/promotions/providers/instagramProvider";
import { createStubProvider } from "@/lib/promotions/providers/stubProvider";
import {
  createEmptyProviderRegistry,
  setProviderRegistryForTests,
  type ProviderRegistry,
} from "@/lib/promotions/providers/registry";

let bootstrapped: ProviderRegistry | null = null;

export function bootstrapProviderRegistry(): ProviderRegistry {
  if (bootstrapped) return bootstrapped;

  const registry = createEmptyProviderRegistry();
  registry.register(createFacebookProvider());
  registry.register(createGoogleBusinessProvider());
  registry.register(createInstagramProvider());
  registry.register(createStubProvider({ key: "linkedin", displayName: "LinkedIn" }));
  registry.register(createStubProvider({ key: "pinterest", displayName: "Pinterest" }));
  registry.register(createStubProvider({ key: "x", displayName: "X" }));

  bootstrapped = registry;
  setProviderRegistryForTests(registry);
  return registry;
}

/** Test helper — clear singleton so the next bootstrap rebuilds. */
export function resetProviderBootstrapForTests(): void {
  bootstrapped = null;
  setProviderRegistryForTests(null);
}
