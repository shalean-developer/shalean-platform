import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  claimPublish,
  computeRequestHash,
  isStuckProcessing,
  markPublishFailed,
  markPublishSucceeded,
  recoverStuckPublishClaims,
  resolveIdempotencyKey,
  STUCK_PROCESSING_TTL_MS,
  type PublishIdentity,
} from "@/lib/promotions/publishIdempotency";

type Row = {
  id: string;
  idempotency_key: string;
  provider: string;
  target_ref: string | null;
  promotion_id: string | null;
  request_hash: string;
  status: "processing" | "succeeded" | "failed";
  external_post_id: string | null;
  error_message: string | null;
  published_by: string | null;
  attempts: number;
  updated_at: string;
};

/** Minimal in-memory Supabase stand-in emulating UNIQUE(provider, idempotency_key). */
function makeFakeAdmin() {
  const rows: Row[] = [];
  let counter = 0;

  class Builder {
    private op: "insert" | "select" | "update" = "select";
    private payload: Record<string, unknown> = {};
    private filters: Array<[string, unknown]> = [];
    private ltFilters: Array<[string, string]> = [];
    private orderAsc = true;
    private limitN: number | null = null;

    insert(payload: Record<string, unknown>) {
      this.op = "insert";
      this.payload = payload;
      return this;
    }
    update(payload: Record<string, unknown>) {
      this.op = "update";
      this.payload = payload;
      return this;
    }
    select(_cols?: string) {
      if (this.op !== "insert" && this.op !== "update") this.op = "select";
      return this;
    }
    eq(col: string, val: unknown) {
      this.filters.push([col, val]);
      return this;
    }
    lt(col: string, val: string) {
      this.ltFilters.push([col, val]);
      return this;
    }
    order(_col: string, opts?: { ascending?: boolean }) {
      this.orderAsc = opts?.ascending !== false;
      return this;
    }
    limit(n: number) {
      this.limitN = n;
      return this;
    }
    private matches(row: Row) {
      return this.filters.every(([c, v]) => (row as Record<string, unknown>)[c] === v);
    }
    private run() {
      if (this.op === "insert") {
        const p = this.payload as Partial<Row>;
        const dup = rows.find(
          (r) => r.provider === p.provider && r.idempotency_key === p.idempotency_key,
        );
        if (dup) {
          return { data: null, error: { code: "23505", message: "duplicate key" } };
        }
        const now = new Date().toISOString();
        const row: Row = {
          id: `row-${++counter}`,
          idempotency_key: String(p.idempotency_key),
          provider: String(p.provider),
          target_ref: (p.target_ref as string) ?? null,
          promotion_id: (p.promotion_id as string) ?? null,
          request_hash: String(p.request_hash),
          status: (p.status as Row["status"]) ?? "processing",
          external_post_id: null,
          error_message: null,
          published_by: (p.published_by as string) ?? null,
          attempts: typeof p.attempts === "number" ? p.attempts : 1,
          updated_at: now,
        };
        rows.push(row);
        return { data: { id: row.id, attempts: row.attempts }, error: null };
      }
      if (this.op === "update") {
        const target = rows.find((r) => this.matches(r));
        if (!target) return { data: null, error: null };
        Object.assign(target, this.payload);
        return { data: { id: target.id, attempts: target.attempts }, error: null };
      }
      let found = rows.filter((r) => this.matches(r));
      for (const [col, val] of this.ltFilters) {
        found = found.filter((r) => String((r as Record<string, unknown>)[col]) < val);
      }
      if (!this.orderAsc) found = [...found].reverse();
      if (this.limitN != null) found = found.slice(0, this.limitN);
      // maybeSingle / single path: if no lt/limit, return first match object
      if (this.ltFilters.length === 0 && this.limitN == null) {
        return { data: found[0] ?? null, error: null };
      }
      return { data: found, error: null };
    }
    single() {
      return Promise.resolve(this.run());
    }
    maybeSingle() {
      return Promise.resolve(this.run());
    }
    then(resolve: (v: unknown) => void) {
      resolve(this.run());
    }
  }

  const admin = { from: () => new Builder() } as unknown as SupabaseClient;
  return { admin, rows };
}

const baseIdentity: PublishIdentity = {
  provider: "facebook",
  targetRef: "page-1",
  promotionId: "promo-1",
  message: "Spring sale 20% off",
  link: "https://shalean.co.za/book",
};

describe("computeRequestHash / resolveIdempotencyKey", () => {
  it("is stable for identical content and differs for changed content", () => {
    const a = computeRequestHash(baseIdentity);
    const b = computeRequestHash({ ...baseIdentity });
    const c = computeRequestHash({ ...baseIdentity, message: "Different" });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });
  it("uses the explicit key when provided", () => {
    const hash = computeRequestHash(baseIdentity);
    expect(resolveIdempotencyKey({ ...baseIdentity, explicitKey: "manual-1" }, hash)).toBe("manual-1");
    expect(resolveIdempotencyKey(baseIdentity, hash)).toBe(hash);
  });
});

describe("isStuckProcessing", () => {
  it("treats rows older than TTL as stuck", () => {
    const now = Date.parse("2026-07-17T12:00:00.000Z");
    const fresh = new Date(now - 60_000).toISOString();
    const stale = new Date(now - STUCK_PROCESSING_TTL_MS - 1).toISOString();
    expect(isStuckProcessing(fresh, now)).toBe(false);
    expect(isStuckProcessing(stale, now)).toBe(true);
  });
});

describe("claimPublish state machine (MKT-001A / WS4 + MKT-001B)", () => {
  it("claims a brand-new publish", async () => {
    const { admin } = makeFakeAdmin();
    const res = await claimPublish(admin, baseIdentity, "admin@shalean.co.za");
    expect(res.outcome).toBe("claimed");
    if (res.outcome === "claimed") expect(res.attempts).toBe(1);
  });

  it("returns in_progress for an immediate/concurrent duplicate", async () => {
    const { admin } = makeFakeAdmin();
    const first = await claimPublish(admin, baseIdentity, "admin@shalean.co.za");
    expect(first.outcome).toBe("claimed");
    const second = await claimPublish(admin, baseIdentity, "admin@shalean.co.za");
    expect(second.outcome).toBe("in_progress");
  });

  it("replays the original result for a completed duplicate", async () => {
    const { admin } = makeFakeAdmin();
    const first = await claimPublish(admin, baseIdentity, "admin@shalean.co.za");
    if (first.outcome !== "claimed") throw new Error("expected claimed");
    await markPublishSucceeded(admin, first.id, "fb-post-999");
    const replay = await claimPublish(admin, baseIdentity, "admin@shalean.co.za");
    expect(replay).toEqual({ outcome: "duplicate_succeeded", externalPostId: "fb-post-999" });
  });

  it("allows a retry after a failed attempt and increments attempts", async () => {
    const { admin, rows } = makeFakeAdmin();
    const first = await claimPublish(admin, baseIdentity, "admin@shalean.co.za");
    if (first.outcome !== "claimed") throw new Error("expected claimed");
    await markPublishFailed(admin, first.id, "provider 500");
    const retry = await claimPublish(admin, baseIdentity, "admin@shalean.co.za");
    expect(retry.outcome).toBe("retry");
    if (retry.outcome === "retry") expect(retry.attempts).toBe(2);
    expect(rows[0]!.attempts).toBe(2);
  });

  it("reclaims stuck processing rows after TTL", async () => {
    const { admin, rows } = makeFakeAdmin();
    const first = await claimPublish(admin, baseIdentity, "admin@shalean.co.za");
    if (first.outcome !== "claimed") throw new Error("expected claimed");
    rows[0]!.updated_at = new Date(Date.now() - STUCK_PROCESSING_TTL_MS - 5_000).toISOString();
    const reclaim = await claimPublish(admin, baseIdentity, "admin@shalean.co.za");
    expect(reclaim.outcome).toBe("retry");
    if (reclaim.outcome === "retry") expect(reclaim.attempts).toBe(2);
  });

  it("rejects the same explicit key with a different payload (conflict)", async () => {
    const { admin } = makeFakeAdmin();
    const a = await claimPublish(admin, { ...baseIdentity, explicitKey: "k1" }, "admin@shalean.co.za");
    if (a.outcome !== "claimed") throw new Error("expected claimed");
    await markPublishSucceeded(admin, a.id, "fb-1");
    const conflict = await claimPublish(
      admin,
      { ...baseIdentity, explicitKey: "k1", message: "Totally different content" },
      "admin@shalean.co.za",
    );
    expect(conflict.outcome).toBe("conflict");
  });

  it("scopes independently by provider / target account", async () => {
    const { admin } = makeFakeAdmin();
    const fb = await claimPublish(admin, baseIdentity, "admin@shalean.co.za");
    const gb = await claimPublish(
      admin,
      { ...baseIdentity, provider: "google_business", targetRef: "google_business" },
      "admin@shalean.co.za",
    );
    expect(fb.outcome).toBe("claimed");
    expect(gb.outcome).toBe("claimed");
  });

  it("permits a deliberate second publish using a NEW explicit key", async () => {
    const { admin } = makeFakeAdmin();
    const a = await claimPublish(admin, baseIdentity, "admin@shalean.co.za");
    if (a.outcome !== "claimed") throw new Error("expected claimed");
    await markPublishSucceeded(admin, a.id, "fb-1");
    const b = await claimPublish(admin, { ...baseIdentity, explicitKey: "repost-2" }, "admin@shalean.co.za");
    expect(b.outcome).toBe("claimed");
  });

  it("records external post id on success and error on failure", async () => {
    const { admin, rows } = makeFakeAdmin();
    const first = await claimPublish(admin, baseIdentity, "admin@shalean.co.za");
    if (first.outcome !== "claimed") throw new Error("expected claimed");
    await markPublishSucceeded(admin, first.id, "post-abc");
    expect(rows[0]!.status).toBe("succeeded");
    expect(rows[0]!.external_post_id).toBe("post-abc");

    const { admin: admin2, rows: rows2 } = makeFakeAdmin();
    const c2 = await claimPublish(admin2, baseIdentity, "admin@shalean.co.za");
    if (c2.outcome !== "claimed") throw new Error("expected claimed");
    await markPublishFailed(admin2, c2.id, "boom");
    expect(rows2[0]!.status).toBe("failed");
    expect(rows2[0]!.error_message).toBe("boom");
  });
});

describe("recoverStuckPublishClaims", () => {
  it("marks abandoned processing rows as failed", async () => {
    const { admin, rows } = makeFakeAdmin();
    const first = await claimPublish(admin, baseIdentity, "admin@shalean.co.za");
    if (first.outcome !== "claimed") throw new Error("expected claimed");
    rows[0]!.updated_at = new Date(Date.now() - STUCK_PROCESSING_TTL_MS - 1_000).toISOString();

    const result = await recoverStuckPublishClaims(admin);
    expect(result.scanned).toBe(1);
    expect(result.recovered).toBe(1);
    expect(rows[0]!.status).toBe("failed");
    expect(rows[0]!.error_message).toMatch(/Abandoned/i);
  });
});
