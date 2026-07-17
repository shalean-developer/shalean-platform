/**
 * MKT-001C — Public provider architecture exports.
 */

import { bootstrapProviderRegistry } from "@/lib/promotions/providers/bootstrap";

// Ensure the process-wide registry is ready for route handlers.
bootstrapProviderRegistry();

export type {
  ConnectionHealth,
  ConnectionResult,
  ConnectionStatus,
  ContentValidationResult,
  DisconnectResult,
  LedgerProviderKey,
  ProviderCapabilities,
  ProviderKey,
  ProviderRawError,
  ProviderRegistryEntry,
  PublishRequest,
  PublishResult,
  PublishState,
  SocialProvider,
  TokenRefreshResult,
} from "@/lib/promotions/providers/types";

export {
  ProviderDisabledError,
  ProviderNotFoundError,
  ProviderRegistry,
  createEmptyProviderRegistry,
  getProviderRegistry,
  isProviderFeatureEnabled,
  setProviderRegistryForTests,
} from "@/lib/promotions/providers/registry";

export { bootstrapProviderRegistry } from "@/lib/promotions/providers/bootstrap";
export { createFacebookProvider } from "@/lib/promotions/providers/facebookProvider";
export { createGoogleBusinessProvider } from "@/lib/promotions/providers/googleBusinessProvider";
export { createStubProvider } from "@/lib/promotions/providers/stubProvider";
export {
  publishOutcomeToHttp,
  runPublish,
  type PublishServiceOutcome,
  type RunPublishArgs,
} from "@/lib/promotions/providers/publishingService";
