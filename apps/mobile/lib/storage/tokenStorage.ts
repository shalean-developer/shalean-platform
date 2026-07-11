import * as SecureStore from "expo-secure-store";

const ACCESS_TOKEN_KEY = "shalean.access_token";
const REFRESH_TOKEN_KEY = "shalean.refresh_token";

/** Persist the Supabase access JWT. */
export async function setAccessToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, token);
}

/** Read the stored access JWT, or null when missing. */
export async function getAccessToken(): Promise<string | null> {
  return SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
}

/** Clear the stored access JWT. */
export async function removeAccessToken(): Promise<void> {
  await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY);
}

/** Persist the Supabase refresh token (session persistence). */
export async function setRefreshToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, token);
}

/** Read the stored refresh token, or null when missing. */
export async function getRefreshToken(): Promise<string | null> {
  return SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
}

/** Clear the stored refresh token. */
export async function removeRefreshToken(): Promise<void> {
  await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
}

/** Persist both tokens from a cleaner login session payload. */
export async function setSessionTokens(session: {
  access_token: string;
  refresh_token: string;
}): Promise<void> {
  await setAccessToken(session.access_token);
  await setRefreshToken(session.refresh_token);
}

/** Clear all auth tokens (sign out). */
export async function clearSessionTokens(): Promise<void> {
  await removeAccessToken();
  await removeRefreshToken();
}
