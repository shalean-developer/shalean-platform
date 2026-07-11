import { resolveRequestUrl, resolveTimeoutMs } from "./config";
import { ApiClientError } from "./errors";
import { responseToApiResult } from "./parse";
import { buildBearerHeaders } from "./token";
import type { ApiClient, ApiClientConfig, ApiRequestOptions, ApiResult } from "./types";

function mergeAbortSignals(signals: Array<AbortSignal | undefined>): AbortSignal | undefined {
  const active = signals.filter((s): s is AbortSignal => Boolean(s));
  if (active.length === 0) return undefined;
  if (active.length === 1) return active[0];
  if (typeof AbortSignal !== "undefined" && "any" in AbortSignal && typeof AbortSignal.any === "function") {
    return AbortSignal.any(active);
  }
  const controller = new AbortController();
  for (const signal of active) {
    if (signal.aborted) {
      controller.abort(signal.reason);
      return controller.signal;
    }
    signal.addEventListener(
      "abort",
      () => {
        controller.abort(signal.reason);
      },
      { once: true },
    );
  }
  return controller.signal;
}

function createTimeoutSignal(timeoutMs: number): { signal?: AbortSignal; clear: () => void } {
  if (!timeoutMs || timeoutMs <= 0) return { clear: () => undefined };
  const controller = new AbortController();
  const id = setTimeout(() => {
    controller.abort(new ApiClientError("Request timed out.", { code: "timeout", status: 0 }));
  }, timeoutMs);
  return {
    signal: controller.signal,
    clear: () => clearTimeout(id),
  };
}

function getFetch(config: ApiClientConfig): typeof fetch {
  const impl = config.fetch ?? globalThis.fetch;
  if (typeof impl !== "function") {
    throw new ApiClientError("No fetch implementation available. Pass config.fetch.", {
      code: "network",
      status: 0,
    });
  }
  return impl.bind(globalThis);
}

async function applyAuthHeaders(
  headers: Headers,
  config: ApiClientConfig,
  options: ApiRequestOptions,
): Promise<boolean> {
  if (options.skipAuth) return false;
  const bearer = await buildBearerHeaders(config.tokenProvider);
  if (!bearer) return false;
  for (const [k, v] of Object.entries(bearer)) headers.set(k, v);
  return true;
}

async function executeOnce(
  config: ApiClientConfig,
  path: string,
  options: ApiRequestOptions,
  forceToken?: string | null,
): Promise<Response> {
  const method = options.method ?? (options.json !== undefined || options.body != null ? "POST" : "GET");
  const url = resolveRequestUrl(config.baseUrl, path);
  const headers = new Headers(config.defaultHeaders);
  if (options.headers) {
    const extra = new Headers(options.headers);
    extra.forEach((value, key) => headers.set(key, value));
  }

  let authenticated = false;
  if (forceToken !== undefined) {
    if (forceToken) {
      headers.set("Authorization", `Bearer ${forceToken}`);
      authenticated = true;
    }
  } else {
    authenticated = await applyAuthHeaders(headers, config, options);
  }

  if (options.json !== undefined) {
    headers.set("Content-Type", "application/json");
  }

  const timeoutMs = resolveTimeoutMs(config, options.timeoutMs);
  const timeout = createTimeoutSignal(timeoutMs);
  const signal = mergeAbortSignals([options.signal, timeout.signal]);

  const init: RequestInit = {
    method,
    headers,
    body: options.json !== undefined ? JSON.stringify(options.json) : options.body,
    signal,
  };

  await config.onRequest?.({ url, method, headers, authenticated });

  const fetchImpl = getFetch(config);
  try {
    const res = await fetchImpl(url, init);
    await config.onResponse?.({ url, method, status: res.status, ok: res.ok });
    return res;
  } catch (cause) {
    if (cause instanceof ApiClientError) throw cause;
    if (cause && typeof cause === "object" && "name" in cause && (cause as { name: string }).name === "AbortError") {
      throw new ApiClientError("Request was aborted.", { code: "aborted", status: 0, cause });
    }
    throw new ApiClientError("Could not reach the server.", { code: "network", status: 0, cause });
  } finally {
    timeout.clear();
  }
}

/**
 * Create a platform-agnostic HTTP client for Shalean `/api/*` routes.
 *
 * Web: `createApiClient({ tokenProvider: webSupabaseTokenProvider })`
 * Expo: `createApiClient({ baseUrl: APP_ORIGIN, tokenProvider: secureStoreProvider })`
 *
 * Does not implement domain endpoints (booking/cleaner/customer) — those wrap this later.
 */
export function createApiClient(config: ApiClientConfig = {}): ApiClient {
  const frozen: ApiClientConfig = { ...config };

  async function request(path: string, options: ApiRequestOptions = {}): Promise<Response> {
    if (!options.skipAuth && frozen.tokenProvider) {
      const token = (await frozen.tokenProvider.getAccessToken())?.trim();
      if (!token) {
        throw new ApiClientError("Not signed in.", { code: "not_authenticated", status: 401 });
      }
    }

    let res = await executeOnce(frozen, path, options);

    const canRefresh =
      res.status === 401 &&
      !options.skipAuth &&
      frozen.auth?.retryOnUnauthorized === true &&
      typeof frozen.tokenProvider?.refreshAccessToken === "function";

    if (canRefresh) {
      const refreshed = (await frozen.tokenProvider!.refreshAccessToken!())?.trim() ?? null;
      if (refreshed) {
        res = await executeOnce(frozen, path, options, refreshed);
      }
    }

    return res;
  }

  async function requestJson<T>(path: string, options: ApiRequestOptions = {}): Promise<ApiResult<T>> {
    if (!options.skipAuth && frozen.tokenProvider) {
      const token = (await frozen.tokenProvider.getAccessToken())?.trim();
      if (!token) {
        return { ok: false, status: 401, error: "Not signed in." };
      }
    }

    try {
      const res = await request(path, options);
      return await responseToApiResult<T>(res);
    } catch (e) {
      if (e instanceof ApiClientError) {
        if (e.code === "not_authenticated") {
          return { ok: false, status: 401, error: e.message };
        }
        if (e.code === "timeout" || e.code === "network" || e.code === "aborted") {
          return { ok: false, status: 503, error: e.message };
        }
        return { ok: false, status: e.status || 500, error: e.message, body: e.body };
      }
      return {
        ok: false,
        status: 503,
        error: "Could not reach the server. Check your connection, then try again.",
      };
    }
  }

  return {
    config: frozen,
    request,
    requestJson,
  };
}
