import type { TokenProvider } from "@shalean/api-client";
import { refreshAccessToken } from "@/lib/auth/refreshAccessToken";
import {
  clearSessionTokens,
  getAccessToken,
  removeAccessToken,
  setAccessToken,
  setSessionTokens,
} from "@/lib/storage/tokenStorage";

export const secureStoreTokenProvider: TokenProvider = {
  getAccessToken,
  refreshAccessToken,
};

export {
  clearSessionTokens,
  getAccessToken,
  removeAccessToken,
  setAccessToken,
  setSessionTokens,
};

export { refreshAccessToken };
