/**
 * Shared API client types — isomorphic (web, Expo, Node).
 * No React / Next / browser / Expo imports.
 */

/** Supplies access tokens without assuming cookies or localStorage. */
export type TokenProvider = {
  /** Current access JWT, or null when unauthenticated. */
  getAccessToken: () => Promise<string | null>;
  /**
   * Optional refresh hook. Invoked at most once per request after HTTP 401
   * when {@link ApiClientConfig.auth.retryOnUnauthorized} is true.
   * Platform owns SecureStore / cookie / memory refresh.
   */
  refreshAccessToken?: () => Promise<string | null>;
};

/**
 * Future retry policy — designed now, not applied by the default client.
 * Apps may implement later without changing call sites that pass this shape.
 */
export type RetryPolicy = {
  /** Max attempts including the first try. Default design target: 1 (no retry). */
  maxAttempts: number;
  /** Retry only on these HTTP statuses (e.g. 502, 503). Never retry 4xx except via auth refresh. */
  retryStatuses: readonly number[];
  /** Base delay in ms before retry (exponential backoff recommended). */
  baseDelayMs: number;
};

export type ApiRequestOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD";
  /** JSON body — serialized by the client; sets Content-Type. */
  json?: unknown;
  /** Raw body if not using `json`. */
  body?: BodyInit | null;
  headers?: HeadersInit;
  /** Per-request timeout; overrides client default. */
  timeoutMs?: number;
  /** Skip Authorization header even if a token provider is configured. */
  skipAuth?: boolean;
  /** Extra AbortSignal (combined with timeout). */
  signal?: AbortSignal;
};

export type ApiSuccess<T> = {
  ok: true;
  data: T;
  status: number;
  headers: Headers;
};

export type ApiFailure = {
  ok: false;
  status: number;
  error: string;
  /** Parsed JSON body when present. */
  body?: unknown;
  headers?: Headers;
};

export type ApiResult<T> = ApiSuccess<T> | ApiFailure;

export type RequestContext = {
  url: string;
  method: string;
  headers: Headers;
  /** True when Authorization was set from the token provider. */
  authenticated: boolean;
};

export type ResponseContext = {
  url: string;
  method: string;
  status: number;
  ok: boolean;
};

export type ApiClientConfig = {
  /**
   * Origin prefix for relative paths.
   * - Web (same origin): omit or `""` → `/api/...` stays relative.
   * - Expo / external: `"https://shalean.co.za"` → absolute URLs.
   */
  baseUrl?: string;
  /** Injectable auth — required for authenticated calls. */
  tokenProvider?: TokenProvider;
  /**
   * Fetch implementation. Defaults to global `fetch`.
   * Inject in tests or environments without a global.
   */
  fetch?: typeof fetch;
  defaultHeaders?: Record<string, string>;
  /** Default request timeout in ms. `0` disables. Default: 30_000. */
  timeoutMs?: number;
  auth?: {
    /**
     * After 401, call `tokenProvider.refreshAccessToken` once and retry.
     * Default: false (callers / platforms decide).
     */
    retryOnUnauthorized?: boolean;
  };
  /**
   * Reserved for future network/5xx retries. Not executed by createApiClient yet.
   * @see RetryPolicy
   */
  retry?: RetryPolicy;
  onRequest?: (ctx: RequestContext) => void | Promise<void>;
  onResponse?: (ctx: ResponseContext) => void | Promise<void>;
};

export type ApiClient = {
  readonly config: Readonly<ApiClientConfig>;
  /** Low-level: returns the raw Response (after auth/timeout handling). */
  request: (path: string, options?: ApiRequestOptions) => Promise<Response>;
  /** JSON helper aligned with existing dashboardFetchJson result shape. */
  requestJson: <T>(path: string, options?: ApiRequestOptions) => Promise<ApiResult<T>>;
};
