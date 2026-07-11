import type { TokenProvider } from "./types";

/**
 * Build Authorization headers from a token provider.
 * Returns null when no token is available (caller decides 401 vs public call).
 */
export async function buildBearerHeaders(
  tokenProvider: TokenProvider | undefined,
): Promise<Record<string, string> | null> {
  if (!tokenProvider) return null;
  const token = (await tokenProvider.getAccessToken())?.trim();
  if (!token) return null;
  return { Authorization: `Bearer ${token}` };
}

/** Create a simple static token provider (tests / short-lived sessions). */
export function staticTokenProvider(accessToken: string | null): TokenProvider {
  return {
    getAccessToken: async () => accessToken,
  };
}
