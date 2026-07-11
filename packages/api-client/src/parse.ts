import { ApiClientError } from "./errors";
import type { ApiFailure, ApiResult, ApiSuccess } from "./types";

/**
 * Parse a Response as JSON without throwing on empty/non-JSON bodies.
 */
export async function parseJsonBody(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch (cause) {
    throw new ApiClientError("Response was not valid JSON.", {
      code: "parse_error",
      status: res.status,
      cause,
    });
  }
}

export function readErrorMessage(body: unknown, fallback: string): string {
  if (body && typeof body === "object" && !Array.isArray(body)) {
    const err = (body as { error?: unknown }).error;
    if (typeof err === "string" && err.trim()) return err;
    const message = (body as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return fallback;
}

export function toApiSuccess<T>(data: T, status: number, headers: Headers): ApiSuccess<T> {
  return { ok: true, data, status, headers };
}

export function toApiFailure(
  status: number,
  error: string,
  body?: unknown,
  headers?: Headers,
): ApiFailure {
  return { ok: false, status, error, body, headers };
}

export async function responseToApiResult<T>(res: Response): Promise<ApiResult<T>> {
  let body: unknown = {};
  try {
    body = await parseJsonBody(res);
  } catch (e) {
    if (!res.ok) {
      return toApiFailure(res.status, res.statusText || "Request failed.", undefined, res.headers);
    }
    throw e;
  }

  if (!res.ok) {
    return toApiFailure(
      res.status,
      readErrorMessage(body, res.statusText || "Request failed."),
      body,
      res.headers,
    );
  }

  return toApiSuccess(body as T, res.status, res.headers);
}
