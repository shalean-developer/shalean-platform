import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

/** Prefixed so Cleaner + Customer tokens never collide on one device. */
const ACCESS_TOKEN_KEY = "shalean.customer.access_token";
const REFRESH_TOKEN_KEY = "shalean.customer.refresh_token";

async function setItem(key: string, value: string): Promise<void> {
  if (Platform.OS === "web") {
    await AsyncStorage.setItem(key, value);
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

async function getItem(key: string): Promise<string | null> {
  if (Platform.OS === "web") {
    return AsyncStorage.getItem(key);
  }
  return SecureStore.getItemAsync(key);
}

async function deleteItem(key: string): Promise<void> {
  if (Platform.OS === "web") {
    await AsyncStorage.removeItem(key);
    return;
  }
  await SecureStore.deleteItemAsync(key);
}

export async function setAccessToken(token: string): Promise<void> {
  await setItem(ACCESS_TOKEN_KEY, token);
}

export async function getAccessToken(): Promise<string | null> {
  return getItem(ACCESS_TOKEN_KEY);
}

export async function removeAccessToken(): Promise<void> {
  await deleteItem(ACCESS_TOKEN_KEY);
}

export async function setRefreshToken(token: string): Promise<void> {
  await setItem(REFRESH_TOKEN_KEY, token);
}

export async function getRefreshToken(): Promise<string | null> {
  return getItem(REFRESH_TOKEN_KEY);
}

export async function removeRefreshToken(): Promise<void> {
  await deleteItem(REFRESH_TOKEN_KEY);
}

export async function setSessionTokens(session: {
  access_token: string;
  refresh_token: string;
}): Promise<void> {
  await setAccessToken(session.access_token);
  await setRefreshToken(session.refresh_token);
}

export async function clearSessionTokens(): Promise<void> {
  await removeAccessToken();
  await removeRefreshToken();
}
