import NetInfo from "@react-native-community/netinfo";
import { useQueryClient } from "@tanstack/react-query";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { hydrateDiagnosticLogs, diagnosticLog } from "@/lib/diagnostics/logger";
import {
  fetchIsOnline,
  hydrateLastSyncAt,
  isConnectedState,
  markSynced,
} from "@/lib/network/networkStatus";
import { offlineActionQueue } from "@/lib/offline/actionQueue";
import { flushOfflineActionQueue } from "@/lib/offline/flushQueue";
import { cleanerQueryKeys } from "@/hooks/useCleanerProfile";

type ConnectivityContextValue = {
  isOnline: boolean;
  pendingQueueCount: number;
  lastSyncAt: string | null;
  flushQueue: () => Promise<void>;
  syncNow: () => Promise<void>;
};

const ConnectivityContext = createContext<ConnectivityContextValue | null>(null);

export function ConnectivityProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [isOnline, setIsOnline] = useState(true);
  const [pendingQueueCount, setPendingQueueCount] = useState(0);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);

  const refreshQueueCount = useCallback(async () => {
    setPendingQueueCount(await offlineActionQueue.pendingCount());
  }, []);

  const flushQueue = useCallback(async () => {
    const online = await fetchIsOnline();
    if (!online) return;
    const result = await flushOfflineActionQueue(queryClient);
    await refreshQueueCount();
    if (result.processed > 0) {
      const at = new Date().toISOString();
      markSynced(new Date(at));
      setLastSyncAt(at);
    }
  }, [queryClient, refreshQueueCount]);

  const syncNow = useCallback(async () => {
    diagnosticLog.info("Manual sync requested");
    await flushQueue();
    await queryClient.invalidateQueries({ queryKey: ["cleaner"] });
    const at = new Date().toISOString();
    markSynced(new Date(at));
    setLastSyncAt(at);
  }, [flushQueue, queryClient]);

  useEffect(() => {
    void hydrateDiagnosticLogs();
    void hydrateLastSyncAt().then((at) => {
      if (at) setLastSyncAt(at);
    });
    void offlineActionQueue.recoverInterrupted().then(() => refreshQueueCount());
    void fetchIsOnline().then(setIsOnline);
    const unsubNet = NetInfo.addEventListener((state) => {
      const online = isConnectedState(state);
      setIsOnline(online);
      if (online) {
        void flushQueue();
        void queryClient.invalidateQueries({ queryKey: cleanerQueryKeys.todaysJobs });
      }
    });
    const unsubQueue = offlineActionQueue.subscribe((items) => {
      setPendingQueueCount(
        items.filter((i) => i.status === "pending" || i.status === "failed" || i.status === "in_flight")
          .length,
      );
    });
    return () => {
      unsubNet();
      unsubQueue();
    };
  }, [flushQueue, queryClient, refreshQueueCount]);

  const value = useMemo(
    () => ({ isOnline, pendingQueueCount, lastSyncAt, flushQueue, syncNow }),
    [isOnline, pendingQueueCount, lastSyncAt, flushQueue, syncNow],
  );

  return <ConnectivityContext.Provider value={value}>{children}</ConnectivityContext.Provider>;
}

export function useConnectivity(): ConnectivityContextValue {
  const ctx = useContext(ConnectivityContext);
  if (!ctx) throw new Error("useConnectivity must be used within ConnectivityProvider");
  return ctx;
}
