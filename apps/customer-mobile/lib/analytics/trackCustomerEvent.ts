import AsyncStorage from "@react-native-async-storage/async-storage";
import { API_BASE_URL } from "@/constants/config";
import {
  isAllowedCustomerAnalyticsEvent,
  sanitizeAnalyticsPayload,
  type CustomerAnalyticsEvent,
} from "@/lib/analytics/customerAnalyticsEvents";

const SESSION_KEY = "shalean.customer.analytics_session.v1";

let memorySessionId: string | null = null;

function randomId(): string {
  return `cm_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export async function getAnalyticsSessionId(): Promise<string> {
  if (memorySessionId) return memorySessionId;
  try {
    const stored = await AsyncStorage.getItem(SESSION_KEY);
    if (stored?.trim()) {
      memorySessionId = stored.trim();
      return memorySessionId;
    }
  } catch {
    // ignore
  }
  const id = randomId();
  memorySessionId = id;
  try {
    await AsyncStorage.setItem(SESSION_KEY, id);
  } catch {
    // ignore
  }
  return id;
}

/**
 * Fire-and-forget growth event. Never throws to callers.
 * Uses existing `/api/analytics/event` (no auth required).
 */
export async function trackCustomerEvent(
  eventType: CustomerAnalyticsEvent | string,
  payload?: Record<string, unknown>,
): Promise<void> {
  if (!isAllowedCustomerAnalyticsEvent(eventType)) {
    if (__DEV__) {
      console.warn("[analytics] blocked unknown event_type", eventType);
    }
    return;
  }

  try {
    const sessionId = await getAnalyticsSessionId();
    const body = {
      event_type: eventType,
      payload: sanitizeAnalyticsPayload({
        ...payload,
        analytics_session_id: sessionId,
      }),
    };
    const base = API_BASE_URL.replace(/\/$/, "");
    const url = `${base}/api/analytics/event`;
    void fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => undefined);
  } catch {
    // never surface analytics failures
  }
}
