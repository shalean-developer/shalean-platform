import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo, { type NetInfoState } from "@react-native-community/netinfo";
import { onlineManager } from "@tanstack/react-query";
import { diagnosticLog } from "@/lib/diagnostics/logger";

const LAST_SYNC_KEY = "shalean.last_sync_at.v1";

let lastOnline: boolean | null = null;
let lastSyncAtIso: string | null = null;
let syncHydrated = false;

export function getLastSyncAt(): string | null {
  return lastSyncAtIso;
}

export async function hydrateLastSyncAt(): Promise<string | null> {
  if (syncHydrated) return lastSyncAtIso;
  syncHydrated = true;
  try {
    lastSyncAtIso = await AsyncStorage.getItem(LAST_SYNC_KEY);
  } catch {
    lastSyncAtIso = null;
  }
  return lastSyncAtIso;
}

export function markSynced(at = new Date()): void {
  lastSyncAtIso = at.toISOString();
  void AsyncStorage.setItem(LAST_SYNC_KEY, lastSyncAtIso).catch(() => undefined);
}

export function isConnectedState(state: NetInfoState): boolean {
  if (state.isConnected == null) return true;
  if (state.isConnected === false) return false;
  if (state.isInternetReachable === false) return false;
  return true;
}

/** Wire TanStack Query onlineManager to NetInfo (call once at app start). */
export function bindQueryOnlineManager(): () => void {
  const unsubscribe = onlineManager.setEventListener((setOnline) => {
    return NetInfo.addEventListener((state) => {
      const online = isConnectedState(state);
      setOnline(online);
      if (lastOnline !== online) {
        diagnosticLog.info(online ? "Network online" : "Network offline", {
          type: state.type,
        });
        lastOnline = online;
      }
    });
  });
  return typeof unsubscribe === "function" ? unsubscribe : () => undefined;
}

export async function fetchIsOnline(): Promise<boolean> {
  const state = await NetInfo.fetch();
  return isConnectedState(state);
}
