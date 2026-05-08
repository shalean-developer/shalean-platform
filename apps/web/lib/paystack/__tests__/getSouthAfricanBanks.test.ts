import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("normalizePaystackBankRow", () => {
  it("parses string code and trims name", async () => {
    const { normalizePaystackBankRow } = await import("@/lib/paystack/getSouthAfricanBanks");
    expect(
      normalizePaystackBankRow({
        name: "  Discovery Bank  ",
        code: "679000",
        active: true,
      }),
    ).toEqual({ code: "679000", name: "Discovery Bank", active: true });
  });

  it("coerces numeric code", async () => {
    const { normalizePaystackBankRow } = await import("@/lib/paystack/getSouthAfricanBanks");
    expect(
      normalizePaystackBankRow({
        name: "Capitec",
        code: 470010,
      }),
    ).toEqual({ code: "470010", name: "Capitec", active: true });
  });

  it("returns null for missing name or code", async () => {
    const { normalizePaystackBankRow } = await import("@/lib/paystack/getSouthAfricanBanks");
    expect(normalizePaystackBankRow({ name: "", code: "1" })).toBeNull();
    expect(normalizePaystackBankRow({ name: "X", code: "" })).toBeNull();
  });
});

describe("dedupeBanksByCode", () => {
  it("keeps first and counts duplicates", async () => {
    const { dedupeBanksByCode } = await import("@/lib/paystack/getSouthAfricanBanks");
    const { banks, dropped } = dedupeBanksByCode([
      { code: "001", name: "A" },
      { code: "001", name: "B" },
      { code: "002", name: "C" },
    ]);
    expect(dropped).toBe(1);
    expect(banks).toEqual([
      { code: "001", name: "A" },
      { code: "002", name: "C" },
    ]);
  });
});

describe("sortSouthAfricanBanksForUi", () => {
  it("orders popular banks first then alphabetical", async () => {
    const { sortSouthAfricanBanksForUi } = await import("@/lib/paystack/getSouthAfricanBanks");
    const out = sortSouthAfricanBanksForUi([
      { code: "999", name: "Zeta Bank" },
      { code: "632005", name: "ABSA Bank" },
      { code: "470010", name: "Capitec Bank" },
      { code: "111", name: "Alpha Bank" },
    ]);
    expect(out.map((b) => b.code)).toEqual(["470010", "632005", "111", "999"]);
  });
});

describe("filterSouthAfricanBanksByQuery", () => {
  it("matches case-insensitive substrings and all tokens", async () => {
    const { filterSouthAfricanBanksByQuery } = await import("@/lib/paystack/getSouthAfricanBanks");
    const banks = [
      { code: "632005", name: "ABSA Bank" },
      { code: "250655", name: "First National Bank" },
      { code: "198765", name: "Nedbank" },
    ];
    expect(filterSouthAfricanBanksByQuery(banks, "ned").map((b) => b.code)).toEqual(["198765"]);
    expect(filterSouthAfricanBanksByQuery(banks, "first national").map((b) => b.code)).toEqual(["250655"]);
    expect(filterSouthAfricanBanksByQuery(banks, "632").map((b) => b.code)).toEqual(["632005"]);
  });
});

describe("getSouthAfricanBanks", () => {
  const originalKey = process.env.PAYSTACK_SECRET_KEY;
  const originalFetch = global.fetch;

  afterEach(() => {
    process.env.PAYSTACK_SECRET_KEY = originalKey;
    global.fetch = originalFetch;
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  beforeEach(async () => {
    const { clearSouthAfricanBanksCache } = await import("@/lib/paystack/getSouthAfricanBanks");
    clearSouthAfricanBanksCache();
  });

  it("uses static fallback when PAYSTACK_SECRET_KEY is unset", async () => {
    delete process.env.PAYSTACK_SECRET_KEY;
    const { getSouthAfricanBanks } = await import("@/lib/paystack/getSouthAfricanBanks");
    const r = await getSouthAfricanBanks();
    expect(r.source).toBe("fallback");
    expect(r.paystackOk).toBe(false);
    expect(r.banks.length).toBeGreaterThan(0);
    expect(r.cacheHit).toBe(false);
  });

  it("fetches from Paystack, dedupes, filters inactive, and caches", async () => {
    process.env.PAYSTACK_SECRET_KEY = "sk_test_dummy";

    const page1 = {
      status: true,
      data: [
        { name: "Zebra Bank", code: "111", active: true },
        { name: "Inactive Co", code: "222", active: false },
        { name: "Dup", code: "333", active: true },
        { name: "Dup2", code: "333", active: true },
      ],
      meta: { perPage: 100, page: 1 },
    };

    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes("/bank?") && url.includes("currency=ZAR") && url.includes("page=1")) {
        return new Response(JSON.stringify(page1), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url.includes("/bank?") && url.includes("page=2")) {
        return new Response(JSON.stringify({ status: true, data: [], meta: {} }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response("not found", { status: 404 });
    }) as typeof fetch;

    const { getSouthAfricanBanks } = await import("@/lib/paystack/getSouthAfricanBanks");
    const first = await getSouthAfricanBanks();
    expect(first.source).toBe("paystack");
    expect(first.paystackOk).toBe(true);
    expect(first.inactiveFiltered).toBe(1);
    expect(first.duplicateCodesDropped).toBe(1);
    expect(first.banks.map((b) => b.code)).toEqual(["333", "111"]);
    expect(first.cacheHit).toBe(false);

    const fetchCallsAfterFirst = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.length;
    const second = await getSouthAfricanBanks();
    expect(second.cacheHit).toBe(true);
    expect((global.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBe(fetchCallsAfterFirst);
  });

  it("falls back to static list when Paystack returns non-ok", async () => {
    process.env.PAYSTACK_SECRET_KEY = "sk_test_dummy";
    global.fetch = vi.fn(async () => new Response(JSON.stringify({ status: false, message: "nope" }), { status: 200 })) as typeof fetch;

    const { getSouthAfricanBanks } = await import("@/lib/paystack/getSouthAfricanBanks");
    const r = await getSouthAfricanBanks();
    expect(r.source).toBe("fallback");
    expect(r.banks.length).toBeGreaterThan(0);
  });

  it("serves stale cache after Paystack failure when fresh cache existed", async () => {
    process.env.PAYSTACK_SECRET_KEY = "sk_test_dummy";

    const okBody = {
      status: true,
      data: [{ name: "Only Bank", code: "999001", active: true }],
      meta: { perPage: 100, page: 1 },
    };

    let call = 0;
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (!url.includes("/bank")) return new Response("bad", { status: 404 });
      call += 1;
      if (call === 1) {
        return new Response(JSON.stringify(okBody), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      return new Response(JSON.stringify({ status: false }), { status: 500 });
    }) as typeof fetch;

    vi.useFakeTimers();
    const { getSouthAfricanBanks, clearSouthAfricanBanksCache } = await import("@/lib/paystack/getSouthAfricanBanks");

    const good = await getSouthAfricanBanks();
    expect(good.banks.some((b) => b.code === "999001")).toBe(true);

    vi.advanceTimersByTime(6 * 60 * 60 * 1000 + 60_000);
    const stale = await getSouthAfricanBanks({ forceRefresh: false });
    expect(stale.source).toBe("stale_cache");
    expect(stale.banks.some((b) => b.code === "999001")).toBe(true);

    clearSouthAfricanBanksCache();
  });
});
