/**
 * Ensures Metro/TypeScript can resolve all shared workspace packages.
 * Scaffold verification only — not used by product screens.
 */
import { createApiClient } from "@shalean/api-client";
import { canonicalDbBookingStatus } from "@shalean/types";
import { normalizeSouthAfricaPhone } from "@shalean/utils";
import { isValidContactPhone } from "@shalean/validation";

export const workspacePackagesReady = {
  createApiClient: typeof createApiClient === "function",
  phone: typeof normalizeSouthAfricaPhone === "function",
  status: typeof canonicalDbBookingStatus === "function",
  contactPhone: typeof isValidContactPhone === "function",
} as const;
