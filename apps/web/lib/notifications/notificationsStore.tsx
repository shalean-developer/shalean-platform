"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  buildNotificationDedupeKey,
  CLEANER_NOTIFICATIONS_BC,
  CLEANER_NOTIFICATIONS_STORAGE_PREFIX,
  CLEANER_NOTIFICATION_BC_STORAGE_KEY,
  CLEANER_NOTIFICATION_MAX_SERIALIZED_CHARS,
  normalizeNotificationCreatedAtIso,
  parseCleanerNotificationsFromStorage,
  sortAndPruneCleanerNotifications,
  type CleanerNotificationBcMessage,
} from "@/lib/notifications/cleanerNotificationPersistence";
import type { CleanerInAppNotification, CleanerNotificationInput } from "@/lib/notifications/types";
import { getSupabaseBrowser } from "@/lib/supabase/browser";

function storageKeyForUser(userId: string | null): string {
  const u = userId?.trim();
  return u ? `${CLEANER_NOTIFICATIONS_STORAGE_PREFIX}:${u}` : `${CLEANER_NOTIFICATIONS_STORAGE_PREFIX}:anon`;
}

function pingStorageChannel(msg: CleanerNotificationBcMessage): void {
  try {
    localStorage.setItem(CLEANER_NOTIFICATION_BC_STORAGE_KEY, JSON.stringify({ t: Date.now(), msg }));
  } catch {
    /* ignore */
  }
}

export type CleanerNotificationsContextValue = {
  items: readonly CleanerInAppNotification[];
  unreadCount: number;
  addNotification: (n: CleanerNotificationInput) => void;
  markRead: (id: string) => void;
  markAllRead: () => void;
  clearAll: () => void;
};

const CleanerNotificationsContext = createContext<CleanerNotificationsContextValue | null>(null);

export function CleanerNotificationsProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CleanerInAppNotification[]>([]);
  const [storageKey, setStorageKey] = useState<string | null>(null);
  const hydratedRef = useRef(false);
  const tabIdRef = useRef("");
  const bcRef = useRef<BroadcastChannel | null>(null);

  const applyRemoteMessage = useCallback((d: CleanerNotificationBcMessage) => {
    if (!d || typeof d.tabId !== "string" || d.tabId === tabIdRef.current) return;
    switch (d.type) {
      case "append": {
        const payload = d.payload;
        if (!payload?.id || !payload.created_at) return;
        const enriched: CleanerInAppNotification = {
          ...payload,
          dedupe_key: payload.dedupe_key?.trim() || buildNotificationDedupeKey(payload),
        };
        setItems((prev) => {
          const k = buildNotificationDedupeKey(enriched);
          if (prev.some((x) => buildNotificationDedupeKey(x) === k)) return prev;
          return sortAndPruneCleanerNotifications([enriched, ...prev]);
        });
        break;
      }
      case "mark_read": {
        const ids = new Set((d.ids ?? []).map((x) => String(x).trim()).filter(Boolean));
        if (ids.size === 0) return;
        setItems((prev) =>
          sortAndPruneCleanerNotifications(prev.map((x) => (ids.has(x.id) ? { ...x, read: true } : x))),
        );
        break;
      }
      case "mark_all_read":
        setItems((prev) => sortAndPruneCleanerNotifications(prev.map((x) => ({ ...x, read: true }))));
        break;
      default:
        break;
    }
  }, []);

  const broadcast = useCallback((msg: CleanerNotificationBcMessage) => {
    try {
      bcRef.current?.postMessage(msg);
    } catch {
      /* ignore */
    }
    pingStorageChannel(msg);
  }, []);

  useLayoutEffect(() => {
    tabIdRef.current =
      typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `tab-${Math.random().toString(16).slice(2)}`;
  }, []);

  useEffect(() => {
    const sb = getSupabaseBrowser();
    if (!sb) {
      queueMicrotask(() => setStorageKey(storageKeyForUser(null)));
      return;
    }
    const applyUid = (uid: string | null) => {
      setStorageKey(storageKeyForUser(uid));
    };
    void sb.auth.getSession().then(({ data }) => {
      queueMicrotask(() => applyUid(data.session?.user?.id ?? null));
    });
    const { data: sub } = sb.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        queueMicrotask(() => {
          hydratedRef.current = false;
          setItems([]);
          try {
            const keys: string[] = [];
            for (let i = 0; i < localStorage.length; i += 1) {
              const k = localStorage.key(i);
              if (k && (k.startsWith(`${CLEANER_NOTIFICATIONS_STORAGE_PREFIX}:`) || k === CLEANER_NOTIFICATION_BC_STORAGE_KEY)) {
                keys.push(k);
              }
            }
            for (const k of keys) localStorage.removeItem(k);
          } catch {
            /* ignore */
          }
          applyUid(null);
        });
        return;
      }
      if (event === "SIGNED_IN") {
        queueMicrotask(() => {
          hydratedRef.current = false;
          applyUid(session?.user?.id ?? null);
        });
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!storageKey) return;
    queueMicrotask(() => {
      try {
        const raw = localStorage.getItem(storageKey);
        if (raw) {
          const rows = parseCleanerNotificationsFromStorage(raw);
          setItems(sortAndPruneCleanerNotifications(rows));
        } else {
          setItems([]);
        }
      } catch {
        setItems([]);
      }
      hydratedRef.current = true;
    });
  }, [storageKey]);

  useEffect(() => {
    if (!storageKey || !hydratedRef.current) return;
    const normalized = sortAndPruneCleanerNotifications(items);
    let toSave = normalized;
    let raw = JSON.stringify(toSave);
    while (raw.length > CLEANER_NOTIFICATION_MAX_SERIALIZED_CHARS && toSave.length > 6) {
      toSave = toSave.slice(0, toSave.length - 5);
      raw = JSON.stringify(toSave);
    }
    if (raw.length > CLEANER_NOTIFICATION_MAX_SERIALIZED_CHARS) {
      toSave = toSave.slice(0, 30);
      raw = JSON.stringify(toSave);
    }
    try {
      localStorage.setItem(storageKey, raw);
    } catch {
      /* quota */
    }
    if (toSave.length !== normalized.length) {
      queueMicrotask(() => setItems(toSave));
    }
  }, [items, storageKey]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState !== "visible") return;
      setItems((prev) => sortAndPruneCleanerNotifications(prev));
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== CLEANER_NOTIFICATION_BC_STORAGE_KEY || !e.newValue) return;
      let parsed: { msg?: CleanerNotificationBcMessage } | null = null;
      try {
        parsed = JSON.parse(e.newValue) as { msg?: CleanerNotificationBcMessage };
      } catch {
        return;
      }
      const msg = parsed?.msg;
      if (!msg || typeof msg !== "object" || !("type" in msg) || !("tabId" in msg)) return;
      applyRemoteMessage(msg);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [applyRemoteMessage]);

  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    const bc = new BroadcastChannel(CLEANER_NOTIFICATIONS_BC);
    bcRef.current = bc;
    bc.onmessage = (ev: MessageEvent<CleanerNotificationBcMessage>) => {
      const d = ev.data;
      if (!d || typeof d !== "object") return;
      applyRemoteMessage(d);
    };
    return () => {
      bc.close();
      bcRef.current = null;
    };
  }, [applyRemoteMessage]);

  const addNotification = useCallback(
    (n: CleanerNotificationInput) => {
      const id =
        n.id?.trim() ||
        (typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `n-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`);
      const booking_id = n.booking_id?.trim() || undefined;
      const offer_token = n.offer_token?.trim() || undefined;
      const dedupe_key_input = n.dedupe_key?.trim() || undefined;
      const created_at = normalizeNotificationCreatedAtIso(n.created_at ?? null);
      const base: CleanerInAppNotification = {
        id,
        title: n.title.trim() || "Update",
        body: n.body.trim() || "",
        read: n.read ?? false,
        created_at,
        kind: n.kind,
        ...(booking_id ? { booking_id } : {}),
        ...(offer_token ? { offer_token } : {}),
        ...(dedupe_key_input ? { dedupe_key: dedupe_key_input } : {}),
      };
      const row: CleanerInAppNotification = {
        ...base,
        dedupe_key: buildNotificationDedupeKey(base),
      };
      setItems((prev) => {
        const k = buildNotificationDedupeKey(row);
        if (prev.some((x) => buildNotificationDedupeKey(x) === k)) return prev;
        return sortAndPruneCleanerNotifications([row, ...prev]);
      });
      broadcast({ type: "append", tabId: tabIdRef.current, payload: row });
    },
    [broadcast],
  );

  const markRead = useCallback(
    (id: string) => {
      const trimmed = id.trim();
      if (!trimmed) return;
      setItems((prev) => sortAndPruneCleanerNotifications(prev.map((x) => (x.id === trimmed ? { ...x, read: true } : x))));
      broadcast({ type: "mark_read", tabId: tabIdRef.current, ids: [trimmed] });
    },
    [broadcast],
  );

  const markAllRead = useCallback(() => {
    setItems((prev) => sortAndPruneCleanerNotifications(prev.map((x) => ({ ...x, read: true }))));
    broadcast({ type: "mark_all_read", tabId: tabIdRef.current });
  }, [broadcast]);

  const clearAll = useCallback(() => setItems([]), []);

  const unreadCount = useMemo(() => items.filter((x) => !x.read).length, [items]);

  const value = useMemo(
    () => ({
      items,
      unreadCount,
      addNotification,
      markRead,
      markAllRead,
      clearAll,
    }),
    [items, unreadCount, addNotification, markRead, markAllRead, clearAll],
  );

  return <CleanerNotificationsContext.Provider value={value}>{children}</CleanerNotificationsContext.Provider>;
}

export function useCleanerNotifications(): CleanerNotificationsContextValue {
  const ctx = useContext(CleanerNotificationsContext);
  if (!ctx) {
    throw new Error("useCleanerNotifications must be used within CleanerNotificationsProvider");
  }
  return ctx;
}
