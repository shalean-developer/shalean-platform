import { beforeEach, describe, expect, it, vi } from "vitest";
import { postCleanerLifecycleWithRetry } from "@/lib/cleaner/cleanerLifecyclePostWithRetry";

vi.mock("@/lib/cleaner/cleanerAuthenticatedFetch", () => ({
  cleanerAuthenticatedFetch: vi.fn(),
}));

import { cleanerAuthenticatedFetch } from "@/lib/cleaner/cleanerAuthenticatedFetch";

const getHeaders = async () => ({ Authorization: "Bearer x" });

describe("postCleanerLifecycleWithRetry", () => {
  beforeEach(() => {
    vi.mocked(cleanerAuthenticatedFetch).mockReset();
  });

  it("treats 409 as success, duplicate, and invokes onPostSuccess", async () => {
    const onPostSuccess = vi.fn();
    vi.mocked(cleanerAuthenticatedFetch).mockResolvedValue(
      new Response(JSON.stringify({ duplicate: true }), { status: 409, headers: { "Content-Type": "application/json" } }),
    );
    const r = await postCleanerLifecycleWithRetry({
      bookingId: "b1",
      action: "complete",
      idempotencyKey: "idem-1",
      getHeaders,
      onPostSuccess,
    });
    expect(r.ok).toBe(true);
    expect(r.duplicate).toBe(true);
    expect(r.status).toBe(409);
    expect(onPostSuccess).toHaveBeenCalledTimes(1);
  });

  it("invokes onPostSuccess on 200 ok", async () => {
    const onPostSuccess = vi.fn();
    vi.mocked(cleanerAuthenticatedFetch).mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } }),
    );
    const r = await postCleanerLifecycleWithRetry({
      bookingId: "b1",
      action: "en_route",
      idempotencyKey: "idem-2",
      getHeaders,
      onPostSuccess,
    });
    expect(r.ok).toBe(true);
    expect(onPostSuccess).toHaveBeenCalledTimes(1);
  });

  it("does not invoke onPostSuccess on 401", async () => {
    const onPostSuccess = vi.fn();
    vi.mocked(cleanerAuthenticatedFetch).mockResolvedValue(
      new Response(JSON.stringify({ error: "nope" }), { status: 401, headers: { "Content-Type": "application/json" } }),
    );
    const r = await postCleanerLifecycleWithRetry({
      bookingId: "b1",
      action: "start",
      idempotencyKey: "idem-401",
      getHeaders,
      onPostSuccess,
    });
    expect(r.ok).toBe(false);
    expect(onPostSuccess).not.toHaveBeenCalled();
  });

  it("invokes onPostSuccess only after definitive success following 503 retries", async () => {
    const onPostSuccess = vi.fn();
    vi.mocked(cleanerAuthenticatedFetch)
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: "bad" }), { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } }));
    const r = await postCleanerLifecycleWithRetry({
      bookingId: "b1",
      action: "en_route",
      idempotencyKey: "idem-503",
      getHeaders,
      onPostSuccess,
    });
    expect(r.ok).toBe(true);
    expect(onPostSuccess).toHaveBeenCalledTimes(1);
  });
});
