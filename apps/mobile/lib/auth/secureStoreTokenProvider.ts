import type { TokenProvider } from "@shalean/api-client";
import { refreshAccessToken } from "@/lib/auth/refreshAccessToken";
import {
  clearSessionTokens,
  getAccessToken,
  removeAccessToken,
  setAccessToken,
  setSessionTokens,
} from "@/lib/storage/tokenStorage";

/**
 * TokenProvider for `@shalean/api-client` on Expo.
 * Stores access + refresh tokens; refreshes via Supabase Auth when configured.
 */
export const secureStoreTokenProvider: TokenProvider = {
  getAccessToken,
  refreshAccessToken,
};

/** Alias matching the mobile auth foundation name. */
export const SecureStoreTokenProvider = secureStoreTokenProvider;

export {
  clearSessionTokens,
  getAccessToken,
  removeAccessToken,
  setAccessToken,
  setSessionTokens,
};

export { refreshAccessToken };
