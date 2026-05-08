import { getPaystackBaseUrl } from "@/lib/payout/paystackOrigin";
import { SOUTH_AFRICAN_PAYSTACK_BANKS } from "@/lib/cleaner/southAfricanPaystackBanks";

/** Safe wire shape for cleaner bank pickers (no Paystack secrets). */
export type SouthAfricanBankWire = {
  code: string;
  name: string;
  active?: boolean;
};

export type SouthAfricanBanksResult = {
  banks: SouthAfricanBankWire[];
  source: "paystack" | "fallback" | "stale_cache";
  paystackOk: boolean;
  fetchedAtMs: number;
  cacheHit: boolean;
  duplicateCodesDropped: number;
  inactiveFiltered: number;
};

type PaystackBankRow = {
  name?: unknown;
  code?: unknown;
  active?: unknown;
};

type PaystackListMeta = {
  total?: number;
  page?: number;
  perPage?: number;
};

type PaystackListJson = {
  status?: boolean;
  message?: string;
  data?: PaystackBankRow[];
  meta?: PaystackListMeta;
};

const CACHE_FRESH_MS = 6 * 60 * 60 * 1000; // 6h
const STALE_SERVE_MS = 24 * 60 * 60 * 1000; // stale-if-error up to 24h
const MAX_PAGES = 40;
const PER_PAGE = 100;

let memoryCache: {
  banks: SouthAfricanBankWire[];
  fetchedAtMs: number;
  source: "paystack" | "fallback";
  duplicateCodesDropped: number;
  inactiveFiltered: number;
} | null = null;

function logCatalog(event: string, payload: Record<string, unknown>): void {
  const line = `[south-african-banks] ${event} ${JSON.stringify(payload)}`;
  if (event.includes("fallback") || event.includes("error")) {
    console.warn(line);
  } else if (process.env.TRACE_PAYSTACK_BANKS === "1") {
    console.info(line);
  }
}

/** Exported for tests — normalizes one Paystack `/bank` row. */
export function normalizePaystackBankRow(row: PaystackBankRow): SouthAfricanBankWire | null {
  const name = typeof row.name === "string" ? row.name.trim() : "";
  const codeRaw = row.code;
  const code =
    typeof codeRaw === "string"
      ? codeRaw.trim()
      : typeof codeRaw === "number" && Number.isFinite(codeRaw)
        ? String(Math.trunc(codeRaw))
        : "";
  if (!name || !code) return null;
  const active = typeof row.active === "boolean" ? row.active : undefined;
  return { code, name, active: active ?? true };
}

/** Exported for tests — dedupe by `code` (first occurrence wins). */
export function dedupeBanksByCode(banks: SouthAfricanBankWire[]): { banks: SouthAfricanBankWire[]; dropped: number } {
  const seen = new Set<string>();
  const out: SouthAfricanBankWire[] = [];
  let dropped = 0;
  for (const b of banks) {
    const k = b.code.trim();
    if (!k) continue;
    if (seen.has(k)) {
      dropped += 1;
      continue;
    }
    seen.add(k);
    out.push(b);
  }
  return { banks: out, dropped };
}

function staticFallbackBanks(): SouthAfricanBankWire[] {
  return SOUTH_AFRICAN_PAYSTACK_BANKS.map((b) => ({ code: b.code, name: b.name, active: true }));
}

async function fetchPaystackZarBanksAllPages(secret: string): Promise<{
  banks: SouthAfricanBankWire[];
  duplicateCodesDropped: number;
  inactiveFiltered: number;
} | null> {
  const origin = getPaystackBaseUrl();
  const collected: SouthAfricanBankWire[] = [];
  let inactiveFiltered = 0;
  let page = 1;

  while (page <= MAX_PAGES) {
    const url = new URL(`${origin}/bank`);
    url.searchParams.set("currency", "ZAR");
    url.searchParams.set("perPage", String(PER_PAGE));
    url.searchParams.set("page", String(page));

    let res: Response;
    try {
      res = await fetch(url.toString(), {
        method: "GET",
        headers: {
          Authorization: `Bearer ${secret}`,
          "Content-Type": "application/json",
        },
        cache: "no-store",
      });
    } catch {
      return null;
    }

    const json = (await res.json().catch(() => ({}))) as PaystackListJson;
    if (!res.ok || json.status === false) {
      logCatalog("paystack_list_error", {
        httpStatus: res.status,
        message: typeof json.message === "string" ? json.message : null,
        page,
      });
      return null;
    }

    const rows = Array.isArray(json.data) ? json.data : [];
    if (rows.length === 0) break;

    for (const row of rows) {
      if (typeof row.active === "boolean" && row.active === false) {
        inactiveFiltered += 1;
        continue;
      }
      const n = normalizePaystackBankRow(row);
      if (n) collected.push(n);
    }

    if (rows.length < PER_PAGE) break;
    page += 1;
  }

  const { banks, dropped } = dedupeBanksByCode(collected);
  banks.sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }));
  return { banks, duplicateCodesDropped: dropped, inactiveFiltered };
}

/**
 * Returns ZA banks for Paystack `basa` recipients: prefers Paystack List Banks (`currency=ZAR`),
 * with in-memory TTL cache and degraded static fallback (`SOUTH_AFRICAN_PAYSTACK_BANKS`).
 */
export async function getSouthAfricanBanks(opts?: {
  /** Bypass fresh TTL and refetch Paystack (still uses stale-if-error on failure). */
  forceRefresh?: boolean;
}): Promise<SouthAfricanBanksResult> {
  const forceRefresh = opts?.forceRefresh === true;
  const now = Date.now();

  if (!forceRefresh && memoryCache && now - memoryCache.fetchedAtMs < CACHE_FRESH_MS) {
    logCatalog("cache_hit", {
      count: memoryCache.banks.length,
      ageMs: now - memoryCache.fetchedAtMs,
      source: memoryCache.source,
    });
    return {
      banks: memoryCache.banks,
      source: memoryCache.source,
      paystackOk: memoryCache.source === "paystack",
      fetchedAtMs: memoryCache.fetchedAtMs,
      cacheHit: true,
      duplicateCodesDropped: memoryCache.duplicateCodesDropped,
      inactiveFiltered: memoryCache.inactiveFiltered,
    };
  }

  const secret = process.env.PAYSTACK_SECRET_KEY?.trim();
  if (!secret) {
    const banks = staticFallbackBanks();
    memoryCache = {
      banks,
      fetchedAtMs: now,
      source: "fallback",
      duplicateCodesDropped: 0,
      inactiveFiltered: 0,
    };
    logCatalog("fallback_no_secret", { count: banks.length });
    return {
      banks,
      source: "fallback",
      paystackOk: false,
      fetchedAtMs: now,
      cacheHit: false,
      duplicateCodesDropped: 0,
      inactiveFiltered: 0,
    };
  }

  const fresh = await fetchPaystackZarBanksAllPages(secret);

  if (fresh && fresh.banks.length > 0) {
    memoryCache = {
      banks: fresh.banks,
      fetchedAtMs: now,
      source: "paystack",
      duplicateCodesDropped: fresh.duplicateCodesDropped,
      inactiveFiltered: fresh.inactiveFiltered,
    };
    logCatalog("paystack_ok", {
      count: fresh.banks.length,
      duplicateCodesDropped: fresh.duplicateCodesDropped,
      inactiveFiltered: fresh.inactiveFiltered,
    });
    return {
      banks: fresh.banks,
      source: "paystack",
      paystackOk: true,
      fetchedAtMs: now,
      cacheHit: false,
      duplicateCodesDropped: fresh.duplicateCodesDropped,
      inactiveFiltered: fresh.inactiveFiltered,
    };
  }

  if (memoryCache && now - memoryCache.fetchedAtMs < STALE_SERVE_MS && memoryCache.banks.length > 0) {
    logCatalog("stale_cache_served", {
      count: memoryCache.banks.length,
      ageMs: now - memoryCache.fetchedAtMs,
      priorSource: memoryCache.source,
    });
    return {
      banks: memoryCache.banks,
      source: "stale_cache",
      paystackOk: false,
      fetchedAtMs: memoryCache.fetchedAtMs,
      cacheHit: true,
      duplicateCodesDropped: memoryCache.duplicateCodesDropped,
      inactiveFiltered: memoryCache.inactiveFiltered,
    };
  }

  const banks = staticFallbackBanks();
  memoryCache = {
    banks,
    fetchedAtMs: now,
    source: "fallback",
    duplicateCodesDropped: 0,
    inactiveFiltered: 0,
  };
  logCatalog("fallback_static", { count: banks.length, reason: fresh ? "empty_paystack" : "fetch_failed" });
  return {
    banks,
    source: "fallback",
    paystackOk: false,
    fetchedAtMs: now,
    cacheHit: false,
    duplicateCodesDropped: 0,
    inactiveFiltered: 0,
  };
}

/** Clears in-memory bank catalogue (e.g. after Paystack support confirms bank table update). */
export function clearSouthAfricanBanksCache(): void {
  memoryCache = null;
  logCatalog("cache_cleared", {});
}

/** Case-insensitive match; all space-separated tokens must appear in name or code. */
export function filterSouthAfricanBanksByQuery(banks: SouthAfricanBankWire[], query: string): SouthAfricanBankWire[] {
  const q = query.trim().toLowerCase();
  if (!q) return banks;
  const tokens = q.split(/\s+/).filter(Boolean);
  return banks.filter((b) => {
    const n = b.name.toLowerCase();
    const c = b.code.toLowerCase();
    return tokens.every((t) => n.includes(t) || c.includes(t));
  });
}

/**
 * Paystack ZA universal branch codes: Capitec, FNB, ABSA, Standard Bank, Nedbank — surfaced first in picker when present.
 * Remainder sorted A→Z by display name.
 */
export const POPULAR_SA_BANK_CODE_ORDER = ["470010", "250655", "632005", "051001", "198765"] as const;

/** Puts popular banks first (stable order), then alphabetical by name. */
export function sortSouthAfricanBanksForUi(list: SouthAfricanBankWire[]): SouthAfricanBankWire[] {
  const byCode = new Map(list.map((b) => [b.code.trim(), b]));
  const popular: SouthAfricanBankWire[] = [];
  for (const code of POPULAR_SA_BANK_CODE_ORDER) {
    const hit = byCode.get(code);
    if (hit) popular.push(hit);
  }
  const picked = new Set(popular.map((p) => p.code.trim()));
  const rest = list
    .filter((b) => !picked.has(b.code.trim()))
    .sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }));
  return [...popular, ...rest];
}
