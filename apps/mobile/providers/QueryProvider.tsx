import AsyncStorage from "@react-native-async-storage/async-storage";
import { QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { type ReactNode, useEffect, useState } from "react";
import { AppState, Platform } from "react-native";
import { focusManager } from "@tanstack/react-query";
import { bindQueryOnlineManager } from "@/lib/network/networkStatus";
import { diagnosticLog } from "@/lib/diagnostics/logger";

const persister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: "shalean.react-query.v1",
  throttleTime: 2_000,
});

function createClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60_000,
        gcTime: 1000 * 60 * 60 * 24, // 24h — keep for offline cache
        retry: 2,
        refetchOnReconnect: true,
        refetchOnWindowFocus: Platform.OS === "web",
        networkMode: "offlineFirst",
      },
      mutations: {
        retry: 0,
        networkMode: "online",
      },
    },
  });
}

type Props = { children: ReactNode };

export function QueryProvider({ children }: Props) {
  const [client] = useState(() => createClient());

  useEffect(() => {
    const unbindOnline = bindQueryOnlineManager();

    const onAppState = (status: string) => {
      if (Platform.OS !== "web") {
        focusManager.setFocused(status === "active");
      }
    };
    const sub = AppState.addEventListener("change", onAppState);

    return () => {
      unbindOnline();
      sub.remove();
    };
  }, []);

  return (
    <PersistQueryClientProvider
      client={client}
      persistOptions={{
        persister,
        maxAge: 1000 * 60 * 60 * 24,
        dehydrateOptions: {
          shouldDehydrateQuery: (query) => {
            const key0 = query.queryKey[0];
            return query.state.status === "success" && key0 === "cleaner";
          },
        },
        buster: "cleaner-v1",
      }}
      onSuccess={() => {
        diagnosticLog.info("Query cache restored from disk");
      }}
    >
      {children}
    </PersistQueryClientProvider>
  );
}
