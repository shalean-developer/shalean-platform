import type {
  ExpoPushAdapter,
  ExpoPushMessage,
  ExpoPushSendResult,
  ExpoPushTicket,
} from "@/lib/push/expoPushTypes";
import { isNonProductionDeployment } from "@/lib/env/deploymentEnvironment";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

export type MemoryExpoPushCall = {
  messages: ExpoPushMessage[];
  at: string;
};

export type MemoryExpoPushConfig = {
  /** Scripted responses per call index (then last response repeats). */
  responses?: ExpoPushSendResult[];
  /** When set, every call returns this until cleared. */
  nextResult?: ExpoPushSendResult | null;
};

/**
 * Deterministic in-memory Expo adapter for local UAT — never contacts Expo.
 */
export function createMemoryExpoPushAdapter(config: MemoryExpoPushConfig = {}): ExpoPushAdapter & {
  calls: MemoryExpoPushCall[];
  setNextResult: (r: ExpoPushSendResult | null) => void;
  reset: () => void;
} {
  const calls: MemoryExpoPushCall[] = [];
  let callIndex = 0;
  let nextResult: ExpoPushSendResult | null = config.nextResult ?? null;
  const scripted = [...(config.responses ?? [])];

  return {
    calls,
    setNextResult(r) {
      nextResult = r;
    },
    reset() {
      calls.length = 0;
      callIndex = 0;
      nextResult = null;
      scripted.length = 0;
    },
    async send(messages) {
      calls.push({ messages, at: new Date().toISOString() });
      if (nextResult) {
        const r = nextResult;
        nextResult = null;
        return r;
      }
      if (scripted.length > 0) {
        const idx = Math.min(callIndex, scripted.length - 1);
        callIndex += 1;
        return scripted[idx]!;
      }
      return {
        ok: true,
        tickets: messages.map(
          (): ExpoPushTicket => ({ status: "ok", id: `mem-${calls.length}-${Math.random().toString(36).slice(2, 8)}` }),
        ),
      };
    },
  };
}

function resolveExpoAccessToken(): string | null {
  const t = process.env.EXPO_ACCESS_TOKEN?.trim() || process.env.EXPO_PUSH_ACCESS_TOKEN?.trim();
  return t || null;
}

/**
 * Live Expo Push HTTP adapter. In non-production, requires
 * `PUSH_OUTBOUND_ENABLED=true` plus optional token allowlist.
 */
export function createHttpExpoPushAdapter(): ExpoPushAdapter {
  return {
    async send(messages): Promise<ExpoPushSendResult> {
      if (messages.length === 0) {
        return { ok: true, tickets: [] };
      }

      if (isNonProductionDeployment()) {
        if ((process.env.PUSH_OUTBOUND_ENABLED ?? "").trim().toLowerCase() !== "true") {
          return {
            ok: false,
            httpStatus: 403,
            error: "push_outbound_disabled_non_production",
          };
        }
        const allow = (process.env.OUTBOUND_PUSH_TOKEN_ALLOWLIST ?? "")
          .split(/[,;\s]+/)
          .map((s) => s.trim())
          .filter(Boolean);
        if (allow.length > 0) {
          for (const m of messages) {
            if (!allow.includes(m.to)) {
              return {
                ok: false,
                httpStatus: 403,
                error: "push_token_not_allowlisted",
              };
            }
          }
        }
      }

      const headers: Record<string, string> = {
        Accept: "application/json",
        "Content-Type": "application/json",
      };
      const access = resolveExpoAccessToken();
      if (access) headers.Authorization = `Bearer ${access}`;

      try {
        const res = await fetch(EXPO_PUSH_URL, {
          method: "POST",
          headers,
          body: JSON.stringify(messages),
          signal: AbortSignal.timeout(15_000),
        });
        const text = await res.text();
        let parsed: { data?: ExpoPushTicket[]; errors?: unknown } = {};
        try {
          parsed = JSON.parse(text) as typeof parsed;
        } catch {
          return {
            ok: false,
            httpStatus: res.status,
            error: `expo_invalid_json:${text.slice(0, 200)}`,
          };
        }
        const tickets = Array.isArray(parsed.data) ? parsed.data : [];
        if (!res.ok) {
          return {
            ok: false,
            httpStatus: res.status,
            error: `expo_http_${res.status}:${text.slice(0, 300)}`,
            tickets,
          };
        }
        return { ok: true, tickets };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return { ok: false, httpStatus: 0, error: msg };
      }
    },
  };
}

let testOverride: ExpoPushAdapter | null = null;

/** Test-only: inject adapter (Vitest). */
export function setExpoPushAdapterForTests(adapter: ExpoPushAdapter | null): void {
  testOverride = adapter;
}

export function getExpoPushAdapter(): ExpoPushAdapter {
  if (testOverride) return testOverride;
  if ((process.env.PUSH_ADAPTER ?? "").trim().toLowerCase() === "memory") {
    return createMemoryExpoPushAdapter();
  }
  return createHttpExpoPushAdapter();
}
