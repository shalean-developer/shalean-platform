import crypto from "node:crypto";

export type TeamMemberAddCachedResponse = { status: number; body: unknown };

const TTL_SEC = 120;
const MEMORY_MAX = 2000;
const memory = new Map<string, { expiresAt: number; entry: TeamMemberAddCachedResponse }>();

function pruneMemory() {
  const now = Date.now();
  for (const [k, v] of memory) {
    if (v.expiresAt <= now) memory.delete(k);
  }
  if (memory.size <= MEMORY_MAX) return;
  const keys = [...memory.keys()].slice(0, memory.size - MEMORY_MAX + 100);
  for (const k of keys) memory.delete(k);
}

export function teamMemberAddIdempotencyFingerprint(teamId: string, idempotencyKey: string, cleanerIds: string[]): string {
  const sorted = [...cleanerIds].sort().join("\n");
  return crypto.createHash("sha256").update(`${teamId}\n${idempotencyKey}\n${sorted}`).digest("hex");
}

function upstashEnv(): { baseUrl: string; token: string } | null {
  const baseUrl = process.env.UPSTASH_REDIS_REST_URL?.replace(/\/$/, "") ?? "";
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? "";
  if (!baseUrl || !token) return null;
  return { baseUrl, token };
}

async function redisPipeline(commands: unknown[][]): Promise<unknown[] | null> {
  const env = upstashEnv();
  if (!env) return null;
  try {
    const res = await fetch(`${env.baseUrl}/pipeline`, {
      method: "POST",
      headers: { Authorization: `Bearer ${env.token}`, "Content-Type": "application/json" },
      body: JSON.stringify(commands),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as unknown;
    return Array.isArray(data) ? data : null;
  } catch {
    return null;
  }
}

function firstPipelineResult(data: unknown[] | null): unknown {
  if (!data || data.length === 0) return null;
  const first = data[0];
  if (first && typeof first === "object" && "result" in first) {
    return (first as { result: unknown }).result;
  }
  return first;
}

const redisKey = (fingerprint: string) => `idemp:admin_team_members_add:${fingerprint}`;

export async function getCachedTeamMemberAddResponse(fingerprint: string): Promise<TeamMemberAddCachedResponse | null> {
  const rk = redisKey(fingerprint);
  const fromRedis = await redisPipeline([["GET", rk]]);
  const rawGet = firstPipelineResult(fromRedis);
  if (typeof rawGet === "string" && rawGet.length > 0) {
    try {
      return JSON.parse(rawGet) as TeamMemberAddCachedResponse;
    } catch {
      return null;
    }
  }

  pruneMemory();
  const hit = memory.get(fingerprint);
  if (!hit || hit.expiresAt <= Date.now()) {
    if (hit) memory.delete(fingerprint);
    return null;
  }
  return hit.entry;
}

export async function setCachedTeamMemberAddResponse(
  fingerprint: string,
  entry: TeamMemberAddCachedResponse,
): Promise<void> {
  const serialized = JSON.stringify(entry);
  const rk = redisKey(fingerprint);
  const piped = await redisPipeline([["SET", rk, serialized, "EX", String(TTL_SEC)]]);
  if (piped !== null) return;

  pruneMemory();
  memory.set(fingerprint, { expiresAt: Date.now() + TTL_SEC * 1000, entry });
}
