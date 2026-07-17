import { describe, expect, it, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  computePublishJobBackoffMs,
  PUBLISH_JOB_BACKOFF_BASE_MS,
  PUBLISH_JOB_BACKOFF_CAP_MS,
} from "@/lib/promotions/publishJobBackoff";
import {
  claimDuePublishJobs,
  enqueuePublishJob,
  executePublishJob,
  leaseSpecificPublishJob,
  recoverExpiredPublishJobLeases,
  replayDeadLetterJob,
  sanitizePublishJobPayload,
  type SocialPublishJobRow,
  type SocialPublishJobStatus,
} from "@/lib/promotions/publishJobs";
import {
  ProviderRegistry,
  setProviderRegistryForTests,
} from "@/lib/promotions/providers/registry";
import type { PublishRequest, PublishResult, SocialProvider } from "@/lib/promotions/providers/types";
import { classifyPublishFailure } from "@/lib/promotions/publishProviderErrors";

vi.mock("@/lib/promotions/publishObservability", () => ({
  createPublishCorrelationId: () => "corr-test",
  fingerprintPublishPayload: () => "fp-test",
  logPublishEvent: vi.fn(async () => undefined),
}));

type JobRow = SocialPublishJobRow;
type LedgerRow = {
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

function makeStores() {
  const jobs: JobRow[] = [];
  const ledger: LedgerRow[] = [];
  let jobCounter = 0;
  let ledgerCounter = 0;

  function matches(row: Record<string, unknown>, filters: Array<[string, unknown]>) {
    return filters.every(([c, v]) => row[c] === v);
  }

  function matchesIn(row: Record<string, unknown>, inFilters: Array<[string, unknown[]]>) {
    return inFilters.every(([c, vals]) => vals.includes(row[c] as never));
  }

  class Builder {
    private table: "social_publish_jobs" | "marketing_publish_idempotency" | "social_publish_history" =
      "social_publish_jobs";
    private op: "insert" | "select" | "update" = "select";
    private payload: Record<string, unknown> = {};
    private filters: Array<[string, unknown]> = [];
    private inFilters: Array<[string, unknown[]]> = [];
    private ltFilters: Array<[string, string]> = [];
    private lteFilters: Array<[string, string]> = [];
    private orderAsc = true;
    private limitN: number | null = null;

    constructor(table: Builder["table"]) {
      this.table = table;
    }
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
    in(col: string, vals: unknown[]) {
      this.inFilters.push([col, vals]);
      return this;
    }
    lt(col: string, val: string) {
      this.ltFilters.push([col, val]);
      return this;
    }
    lte(col: string, val: string) {
      this.lteFilters.push([col, val]);
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
    private jobMatches(row: JobRow) {
      const r = row as unknown as Record<string, unknown>;
      if (!matches(r, this.filters)) return false;
      if (!matchesIn(r, this.inFilters)) return false;
      for (const [c, v] of this.ltFilters) {
        if (String(r[c] ?? "") >= v) return false;
      }
      for (const [c, v] of this.lteFilters) {
        if (String(r[c] ?? "") > v) return false;
      }
      return true;
    }
    private ledgerMatches(row: LedgerRow) {
      const r = row as unknown as Record<string, unknown>;
      if (!matches(r, this.filters)) return false;
      if (!matchesIn(r, this.inFilters)) return false;
      return true;
    }
    private run() {
      if (this.table === "social_publish_history") {
        return { data: { id: "hist" }, error: null };
      }

      if (this.table === "marketing_publish_idempotency") {
        if (this.op === "insert") {
          const p = this.payload as Partial<LedgerRow>;
          const dup = ledger.find(
            (r) => r.provider === p.provider && r.idempotency_key === p.idempotency_key,
          );
          if (dup) return { data: null, error: { code: "23505", message: "duplicate key" } };
          const now = new Date().toISOString();
          const row: LedgerRow = {
            id: `ledger-${++ledgerCounter}`,
            idempotency_key: String(p.idempotency_key),
            provider: String(p.provider),
            target_ref: (p.target_ref as string) ?? null,
            promotion_id: (p.promotion_id as string) ?? null,
            request_hash: String(p.request_hash),
            status: (p.status as LedgerRow["status"]) ?? "processing",
            external_post_id: null,
            error_message: null,
            published_by: (p.published_by as string) ?? null,
            attempts: typeof p.attempts === "number" ? p.attempts : 1,
            updated_at: now,
          };
          ledger.push(row);
          return { data: { ...row }, error: null };
        }
        if (this.op === "update") {
          const row = ledger.find((r) => this.ledgerMatches(r));
          if (!row) return { data: null, error: null };
          Object.assign(row, this.payload, { updated_at: new Date().toISOString() });
          return { data: { ...row }, error: null };
        }
        let rows = ledger.filter((r) => this.ledgerMatches(r));
        if (this.limitN != null) rows = rows.slice(0, this.limitN);
        return { data: rows.map((r) => ({ ...r })), error: null };
      }

      // social_publish_jobs
      if (this.op === "insert") {
        const p = this.payload as Partial<JobRow>;
        const active = jobs.find(
          (r) =>
            r.provider === p.provider &&
            r.idempotency_key === p.idempotency_key &&
            ["queued", "leased", "retryable"].includes(r.status),
        );
        if (active) return { data: null, error: { code: "23505", message: "duplicate key" } };
        const now = new Date().toISOString();
        const row: JobRow = {
          id: `job-${++jobCounter}`,
          provider: p.provider as JobRow["provider"],
          idempotency_key: String(p.idempotency_key),
          request_hash: String(p.request_hash),
          target_ref: (p.target_ref as string) ?? null,
          promotion_id: (p.promotion_id as string) ?? null,
          campaign_name: (p.campaign_name as string) ?? null,
          payload: (p.payload as JobRow["payload"]) ?? { message: "" },
          published_by: String(p.published_by ?? ""),
          correlation_id: String(p.correlation_id ?? "corr"),
          status: (p.status as SocialPublishJobStatus) ?? "queued",
          scheduled_for: String(p.scheduled_for ?? now),
          next_attempt_at: (p.next_attempt_at as string) ?? null,
          attempts: typeof p.attempts === "number" ? p.attempts : 0,
          max_attempts: typeof p.max_attempts === "number" ? p.max_attempts : 5,
          last_error: null,
          failure_class: null,
          retryable: null,
          external_post_id: null,
          ledger_id: null,
          lease_holder: null,
          lease_expires_at: null,
          dead_lettered_at: null,
          replayed_from_job_id: (p.replayed_from_job_id as string) ?? null,
          cancelled_at: null,
          processed_at: null,
          created_at: now,
          updated_at: now,
        };
        jobs.push(row);
        return { data: { ...row }, error: null };
      }

      if (this.op === "update") {
        const row = jobs.find((r) => this.jobMatches(r));
        if (!row) return { data: null, error: null };
        Object.assign(row, this.payload, { updated_at: new Date().toISOString() });
        return { data: { ...row }, error: null };
      }

      let rows = jobs.filter((r) => this.jobMatches(r));
      rows = [...rows].sort((a, b) =>
        this.orderAsc
          ? a.scheduled_for.localeCompare(b.scheduled_for)
          : b.scheduled_for.localeCompare(a.scheduled_for),
      );
      if (this.limitN != null) rows = rows.slice(0, this.limitN);
      return { data: rows.map((r) => ({ ...r })), error: null };
    }

    then(resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) {
      try {
        return Promise.resolve(this.run()).then(resolve, reject);
      } catch (e) {
        return Promise.reject(e).then(resolve, reject);
      }
    }
    single() {
      const r = this.run();
      const data = Array.isArray(r.data) ? r.data[0] ?? null : r.data;
      return Promise.resolve({ data, error: r.error });
    }
    maybeSingle() {
      const r = this.run();
      const data = Array.isArray(r.data) ? r.data[0] ?? null : r.data;
      return Promise.resolve({ data, error: r.error });
    }
  }

  const admin = {
    from(table: string) {
      return new Builder(table as Builder["table"]);
    },
    rpc(name: string, _args?: Record<string, unknown>) {
      if (name === "claim_social_publish_jobs") {
        return Promise.resolve({ data: null, error: { message: "rpc unavailable in fake" } });
      }
      if (name === "recover_expired_social_publish_leases") {
        return Promise.resolve({ data: null, error: { message: "rpc unavailable in fake" } });
      }
      return Promise.resolve({ data: null, error: { message: `unknown rpc ${name}` } });
    },
    _jobs: jobs,
    _ledger: ledger,
  };

  return admin as unknown as SupabaseClient & { _jobs: JobRow[]; _ledger: LedgerRow[] };
}

function mockProvider(opts: {
  publishImpl?: (req: PublishRequest) => Promise<PublishResult>;
  publishCalls?: { count: number };
}): SocialProvider {
  const calls = opts.publishCalls ?? { count: 0 };
  return {
    key: "facebook",
    version: "test",
    displayName: "Facebook",
    async connect() {
      return { ok: true, status: await this.validateConnection() };
    },
    async disconnect() {
      return { ok: true };
    },
    async refreshAccessToken() {
      return { ok: true };
    },
    async validateConnection() {
      return {
        provider: "facebook",
        connected: true,
        configured: true,
        health: "healthy",
        statusLabel: "ok",
        targetRef: "page-1",
        displayName: "Test Page",
        hint: null,
      };
    },
    validateContent(request) {
      if (!request.message.trim()) return { ok: false, error: "Message required." };
      return { ok: true };
    },
    async publish(request) {
      calls.count += 1;
      if (opts.publishImpl) return opts.publishImpl(request);
      return { ok: true, externalPostId: `ext-${calls.count}`, postId: `ext-${calls.count}` };
    },
    getCapabilities() {
      return {
        images: true,
        multipleImages: false,
        video: false,
        links: true,
        scheduling: false,
        locationPosts: false,
        characterLimit: null,
        richFormatting: false,
        requiresImage: false,
        publishEnabled: true,
      };
    },
    classifyError(raw) {
      return classifyPublishFailure({
        provider: "facebook",
        httpStatus: raw.httpStatus,
        rawMessage: raw.rawMessage,
        transportHint: raw.transportHint,
      });
    },
    normalizeResponse() {
      return { ok: false, error: "unused" };
    },
    async resolveTargetRef() {
      return "page-1";
    },
  };
}

describe("MKT-001B.2 publish job backoff", () => {
  it("is bounded and deterministic with fixed random", () => {
    const d1 = computePublishJobBackoffMs({
      attemptsAfterFailure: 1,
      random: () => 0.5,
    });
    const d2 = computePublishJobBackoffMs({
      attemptsAfterFailure: 1,
      random: () => 0.5,
    });
    expect(d1).toBe(d2);
    expect(d1).toBe(Math.round(PUBLISH_JOB_BACKOFF_BASE_MS * 2 * 1.0));

    const capped = computePublishJobBackoffMs({
      attemptsAfterFailure: 20,
      random: () => 1,
    });
    expect(capped).toBe(PUBLISH_JOB_BACKOFF_CAP_MS);
  });

  it("honors retryAfterMs as a floor", () => {
    const delay = computePublishJobBackoffMs({
      attemptsAfterFailure: 1,
      retryAfterMs: 180_000,
      random: () => 0.5,
    });
    expect(delay).toBe(180_000);
  });
});

describe("MKT-001B.2 sanitize payload", () => {
  it("strips imageDataUrl and providerPayload secrets", () => {
    const sanitized = sanitizePublishJobPayload({
      message: "Hello",
      imageDataUrl: "data:image/png;base64,SECRET",
      imageUrl: "https://cdn.example/x.png",
      link: "https://example.com",
      providerPayload: { accessToken: "tok_secret" },
    });
    expect(sanitized).toEqual({
      message: "Hello",
      link: "https://example.com",
      promotionId: null,
      campaignName: null,
      imageUrl: "https://cdn.example/x.png",
    });
    expect(JSON.stringify(sanitized)).not.toContain("SECRET");
    expect(JSON.stringify(sanitized)).not.toContain("tok_secret");
    expect(JSON.stringify(sanitized)).not.toContain("imageDataUrl");
  });
});

describe("MKT-001B.2 durable queue safety gates", () => {
  beforeEach(() => {
    const registry = new ProviderRegistry();
    registry.register(mockProvider({}));
    setProviderRegistryForTests(registry);
  });

  it("enqueue retries do not create duplicate logical jobs", async () => {
    const admin = makeStores();
    const args = {
      admin,
      provider: "facebook" as const,
      request: { message: "Same post" },
      publishedBy: "admin@test",
      targetRef: "page-1",
    };
    const a = await enqueuePublishJob(args);
    const b = await enqueuePublishJob(args);
    expect(a.outcome).toBe("enqueued");
    expect(b.outcome).toBe("existing_active");
    if (a.outcome === "enqueued" && b.outcome === "existing_active") {
      expect(a.job.id).toBe(b.job.id);
    }
    expect(admin._jobs.filter((j) => j.status === "queued").length).toBe(1);
  });

  it("concurrent workers cannot claim the same job", async () => {
    const admin = makeStores();
    const enq = await enqueuePublishJob({
      admin,
      provider: "facebook",
      request: { message: "Race" },
      publishedBy: "admin@test",
      targetRef: "page-1",
    });
    expect(enq.outcome).toBe("enqueued");

    const [w1, w2] = await Promise.all([
      claimDuePublishJobs(admin, { holder: "worker-a", limit: 5 }),
      claimDuePublishJobs(admin, { holder: "worker-b", limit: 5 }),
    ]);
    const ids = [...w1.jobs, ...w2.jobs].map((j) => j.id);
    expect(ids.length).toBe(1);
    expect(new Set(ids).size).toBe(1);
  });

  it("lease expiry permits safe recovery after worker death", async () => {
    const admin = makeStores();
    const enq = await enqueuePublishJob({
      admin,
      provider: "facebook",
      request: { message: "Lease" },
      publishedBy: "admin@test",
      targetRef: "page-1",
    });
    expect(enq.outcome).toBe("enqueued");
    if (enq.outcome !== "enqueued") return;

    const leased = await leaseSpecificPublishJob(admin, enq.job.id, "dead-worker", 60);
    expect(leased?.status).toBe("leased");
    // Expire lease
    admin._jobs[0].lease_expires_at = new Date(Date.now() - 1000).toISOString();

    const recovered = await recoverExpiredPublishJobLeases(admin);
    expect(recovered.recovered).toBe(1);
    expect(admin._jobs[0].status).toBe("queued");
    expect(admin._jobs[0].lease_holder).toBeNull();

    const again = await claimDuePublishJobs(admin, { holder: "worker-b", limit: 5 });
    expect(again.jobs).toHaveLength(1);
    expect(again.jobs[0].lease_holder).toBe("worker-b");
  });

  it("provider success then DB failure cannot cause a second external post", async () => {
    const admin = makeStores();
    const publishCalls = { count: 0 };
    const registry = new ProviderRegistry();
    registry.register(mockProvider({ publishCalls }));
    setProviderRegistryForTests(registry);

    const enq = await enqueuePublishJob({
      admin,
      provider: "facebook",
      request: { message: "Ack race" },
      publishedBy: "admin@test",
      targetRef: "page-1",
    });
    expect(enq.outcome).toBe("enqueued");
    if (enq.outcome !== "enqueued") return;

    const leased = await leaseSpecificPublishJob(admin, enq.job.id, "w1");
    expect(leased).toBeTruthy();
    const first = await executePublishJob({ admin, job: leased!, registry });
    expect(first.providerCalled).toBe(true);
    expect(publishCalls.count).toBe(1);
    expect(first.job.external_post_id).toBeTruthy();

    // Simulate crash after external id persisted but before/without terminal succeeded:
    // re-lease a synthetic job that still has external_post_id and leased status.
    admin._jobs[0].status = "leased";
    admin._jobs[0].lease_holder = "w2";
    admin._jobs[0].lease_expires_at = new Date(Date.now() + 60_000).toISOString();
    admin._jobs[0].processed_at = null;

    const second = await executePublishJob({
      admin,
      job: { ...admin._jobs[0] },
      registry,
    });
    expect(second.providerCalled).toBe(false);
    expect(publishCalls.count).toBe(1);
    expect(second.job.status).toBe("succeeded");
  });

  it("retryable errors move to retryable; permanent errors to dead_letter", async () => {
    const admin = makeStores();
    const registry = new ProviderRegistry();
    registry.register(
      mockProvider({
        publishImpl: async () => ({ ok: false, error: "rate limited", status: 429 }),
      }),
    );
    setProviderRegistryForTests(registry);

    const enq = await enqueuePublishJob({
      admin,
      provider: "facebook",
      request: { message: "Retryable" },
      publishedBy: "admin@test",
      targetRef: "page-1",
    });
    if (enq.outcome !== "enqueued") throw new Error("enqueue failed");
    const leased = await leaseSpecificPublishJob(admin, enq.job.id, "w1");
    const result = await executePublishJob({
      admin,
      job: leased!,
      registry,
      random: () => 0.5,
    });
    expect(result.job.status).toBe("retryable");
    expect(result.job.next_attempt_at).toBeTruthy();
    expect(result.job.failure_class).toBe("rate_limit");

    const admin2 = makeStores();
    const registry2 = new ProviderRegistry();
    registry2.register(
      mockProvider({
        publishImpl: async () => ({ ok: false, error: "bad token", status: 401 }),
      }),
    );
    setProviderRegistryForTests(registry2);
    const enq2 = await enqueuePublishJob({
      admin: admin2,
      provider: "facebook",
      request: { message: "Permanent" },
      publishedBy: "admin@test",
      targetRef: "page-1",
    });
    if (enq2.outcome !== "enqueued") throw new Error("enqueue failed");
    const leased2 = await leaseSpecificPublishJob(admin2, enq2.job.id, "w1");
    const result2 = await executePublishJob({ admin: admin2, job: leased2!, registry: registry2 });
    expect(result2.job.status).toBe("dead_letter");
    expect(result2.job.failure_class).toBe("auth");
  });

  it("jobs exceeding attempt threshold move to DLQ", async () => {
    const admin = makeStores();
    const registry = new ProviderRegistry();
    registry.register(
      mockProvider({
        publishImpl: async () => ({ ok: false, error: "unavailable", status: 503 }),
      }),
    );
    setProviderRegistryForTests(registry);

    const enq = await enqueuePublishJob({
      admin,
      provider: "facebook",
      request: { message: "Poison" },
      publishedBy: "admin@test",
      targetRef: "page-1",
      maxAttempts: 2,
    });
    if (enq.outcome !== "enqueued") throw new Error("enqueue failed");

    // Force attempts near max via manual lease with pre-set attempts
    admin._jobs[0].attempts = 1;
    admin._jobs[0].max_attempts = 2;
    const leased = await leaseSpecificPublishJob(admin, enq.job.id, "w1");
    // lease increments to 2
    expect(leased!.attempts).toBe(2);
    const result = await executePublishJob({
      admin,
      job: leased!,
      registry,
      random: () => 0.5,
    });
    expect(result.job.status).toBe("dead_letter");
  });

  it("DLQ replay is explicit, authorized path, and idempotent", async () => {
    const admin = makeStores();
    const enq = await enqueuePublishJob({
      admin,
      provider: "facebook",
      request: { message: "Replay me" },
      publishedBy: "admin@test",
      targetRef: "page-1",
    });
    if (enq.outcome !== "enqueued") throw new Error("enqueue failed");
    admin._jobs[0].status = "dead_letter";
    admin._jobs[0].dead_lettered_at = new Date().toISOString();
    admin._jobs[0].last_error = "auth";

    const first = await replayDeadLetterJob({
      admin,
      jobId: enq.job.id,
      actor: "admin@test",
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.idempotent).toBe(false);
    expect(first.job.status).toBe("queued");
    expect(first.job.replayed_from_job_id).toBe(enq.job.id);

    const second = await replayDeadLetterJob({
      admin,
      jobId: enq.job.id,
      actor: "admin@test",
    });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    // Source is still dead_letter; active job exists → idempotent existing_active on enqueue
    // OR replaying the DLQ id again creates conflict with active — should be idempotent existing
    expect(second.idempotent).toBe(true);

    // external_post_id present → no new provider work
    admin._jobs[0].status = "dead_letter";
    admin._jobs[0].external_post_id = "ext-already";
    const third = await replayDeadLetterJob({
      admin,
      jobId: admin._jobs[0].id,
      actor: "admin@test",
    });
    expect(third.ok).toBe(true);
    if (!third.ok) return;
    expect(third.reason).toBe("external_post_id_present");
    expect(third.job.status).toBe("succeeded");
  });
});
