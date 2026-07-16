import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:dns/promises", () => ({
  lookup: vi.fn(),
}));

import { lookup } from "node:dns/promises";
import {
  assertSafeHttpUrl,
  fetchRemoteImageSafely,
  isBlockedIp,
  SafeMediaUrlError,
} from "@/lib/security/safeRemoteMedia";

const mockLookup = vi.mocked(lookup);

function resolvesTo(...ips: string[]) {
  mockLookup.mockResolvedValue(ips.map((address) => ({ address, family: address.includes(":") ? 6 : 4 })) as never);
}

describe("isBlockedIp", () => {
  it("blocks IPv4 loopback / private / link-local / metadata / reserved", () => {
    for (const ip of [
      "127.0.0.1",
      "127.9.9.9",
      "10.0.0.5",
      "172.16.0.1",
      "172.31.255.255",
      "192.168.1.1",
      "169.254.169.254", // cloud metadata
      "169.254.170.2", // ECS metadata
      "100.64.0.1", // CGNAT
      "0.0.0.0",
      "224.0.0.1", // multicast
      "240.0.0.1", // reserved
      "255.255.255.255",
    ]) {
      expect(isBlockedIp(ip), ip).toBe(true);
    }
  });

  it("allows public IPv4", () => {
    for (const ip of ["8.8.8.8", "1.1.1.1", "93.184.216.34"]) {
      expect(isBlockedIp(ip), ip).toBe(false);
    }
  });

  it("blocks IPv6 loopback / ULA / link-local / mapped-private / doc", () => {
    for (const ip of [
      "::1",
      "::",
      "fc00::1",
      "fd12:3456::1",
      "fe80::1",
      "ff02::1",
      "::ffff:127.0.0.1", // IPv4-mapped loopback
      "::ffff:10.0.0.1", // IPv4-mapped private
      "2001:db8::1", // documentation
    ]) {
      expect(isBlockedIp(ip), ip).toBe(true);
    }
  });

  it("allows public IPv6 and fails closed on garbage", () => {
    expect(isBlockedIp("2606:4700:4700::1111")).toBe(false);
    expect(isBlockedIp("not-an-ip")).toBe(true);
  });
});

describe("assertSafeHttpUrl", () => {
  it("accepts a normal public https URL", () => {
    expect(() => assertSafeHttpUrl("https://cdn.shalean.co.za/a.png")).not.toThrow();
  });

  it("rejects http (insecure scheme)", () => {
    expect(() => assertSafeHttpUrl("http://example.com/a.png")).toThrow(SafeMediaUrlError);
  });

  it("rejects embedded credentials", () => {
    try {
      assertSafeHttpUrl("https://user:pass@example.com/a.png");
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(SafeMediaUrlError);
      expect((e as SafeMediaUrlError).code).toBe("embedded_credentials");
    }
  });

  it("rejects malformed URL", () => {
    expect(() => assertSafeHttpUrl("::::not a url")).toThrow(SafeMediaUrlError);
  });

  it("rejects localhost and .internal hostnames", () => {
    expect(() => assertSafeHttpUrl("https://localhost/a.png")).toThrow(SafeMediaUrlError);
    expect(() => assertSafeHttpUrl("https://foo.internal/a.png")).toThrow(SafeMediaUrlError);
  });

  it("rejects literal private / metadata IP hosts", () => {
    expect(() => assertSafeHttpUrl("https://127.0.0.1/a.png")).toThrow(SafeMediaUrlError);
    expect(() => assertSafeHttpUrl("https://169.254.169.254/latest/meta-data")).toThrow(
      SafeMediaUrlError,
    );
    expect(() => assertSafeHttpUrl("https://[::1]/a.png")).toThrow(SafeMediaUrlError);
  });
});

describe("fetchRemoteImageSafely", () => {
  const realFetch = globalThis.fetch;

  beforeEach(() => {
    mockLookup.mockReset();
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
    vi.restoreAllMocks();
  });

  function mockFetchOnce(response: Response) {
    globalThis.fetch = vi.fn().mockResolvedValue(response) as unknown as typeof fetch;
  }

  function imageResponse(bytes: number, mime = "image/png"): Response {
    const body = new Uint8Array(bytes).fill(7);
    return new Response(body, { status: 200, headers: { "content-type": mime } });
  }

  it("downloads a valid public https image", async () => {
    resolvesTo("93.184.216.34");
    mockFetchOnce(imageResponse(2048, "image/png"));
    const res = await fetchRemoteImageSafely("https://cdn.example.com/a.png");
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.mime).toBe("image/png");
      expect(res.ext).toBe("png");
      expect(res.bytes).toBe(2048);
    }
  });

  it("rejects http URLs", async () => {
    const res = await fetchRemoteImageSafely("http://cdn.example.com/a.png");
    expect(res).toMatchObject({ ok: false, code: "insecure_scheme" });
  });

  it("rejects localhost / 127.0.0.1 / IPv6 loopback literals", async () => {
    expect(await fetchRemoteImageSafely("https://localhost/a.png")).toMatchObject({
      ok: false,
      code: "blocked_host",
    });
    expect(await fetchRemoteImageSafely("https://127.0.0.1/a.png")).toMatchObject({
      ok: false,
      code: "blocked_host",
    });
    expect(await fetchRemoteImageSafely("https://[::1]/a.png")).toMatchObject({
      ok: false,
      code: "blocked_host",
    });
  });

  it("rejects a hostname that resolves to a private / metadata address", async () => {
    resolvesTo("169.254.169.254");
    const res = await fetchRemoteImageSafely("https://evil.example.com/a.png");
    expect(res).toMatchObject({ ok: false, code: "blocked_host" });

    resolvesTo("10.0.0.5");
    const res2 = await fetchRemoteImageSafely("https://evil2.example.com/a.png");
    expect(res2).toMatchObject({ ok: false, code: "blocked_host" });
  });

  it("rejects credentials and malformed URLs", async () => {
    expect(await fetchRemoteImageSafely("https://u:p@example.com/a.png")).toMatchObject({
      ok: false,
      code: "embedded_credentials",
    });
    expect(await fetchRemoteImageSafely("http://[bad")).toMatchObject({ ok: false });
  });

  it("revalidates redirects and blocks public → private hops", async () => {
    resolvesTo("93.184.216.34");
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(null, { status: 302, headers: { location: "https://169.254.169.254/x" } }),
      ) as unknown as typeof fetch;
    const res = await fetchRemoteImageSafely("https://cdn.example.com/a.png");
    expect(res).toMatchObject({ ok: false, code: "blocked_host" });
  });

  it("stops after too many redirects", async () => {
    resolvesTo("93.184.216.34");
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(null, { status: 302, headers: { location: "https://cdn2.example.com/a.png" } }),
      ) as unknown as typeof fetch;
    const res = await fetchRemoteImageSafely("https://cdn.example.com/a.png", { maxRedirects: 2 });
    expect(res).toMatchObject({ ok: false, code: "too_many_redirects" });
  });

  it("rejects oversized responses (content-length)", async () => {
    resolvesTo("93.184.216.34");
    mockFetchOnce(
      new Response(new Uint8Array(10), {
        status: 200,
        headers: { "content-type": "image/png", "content-length": String(20 * 1024 * 1024) },
      }),
    );
    const res = await fetchRemoteImageSafely("https://cdn.example.com/a.png");
    expect(res).toMatchObject({ ok: false, code: "too_large" });
  });

  it("rejects oversized responses (streamed, no content-length)", async () => {
    resolvesTo("93.184.216.34");
    mockFetchOnce(imageResponse(1024, "image/png"));
    const res = await fetchRemoteImageSafely("https://cdn.example.com/a.png", { maxBytes: 256 });
    expect(res).toMatchObject({ ok: false, code: "too_large" });
  });

  it("rejects wrong content type and HTML posing as an image", async () => {
    resolvesTo("93.184.216.34");
    mockFetchOnce(
      new Response("<html></html>", { status: 200, headers: { "content-type": "text/html" } }),
    );
    const res = await fetchRemoteImageSafely("https://cdn.example.com/a.png");
    expect(res).toMatchObject({ ok: false, code: "content_type" });
  });

  it("rejects unsupported image format (svg)", async () => {
    resolvesTo("93.184.216.34");
    mockFetchOnce(
      new Response("<svg/>", { status: 200, headers: { "content-type": "image/svg+xml" } }),
    );
    const res = await fetchRemoteImageSafely("https://cdn.example.com/a.png");
    expect(res).toMatchObject({ ok: false, code: "unsupported_format" });
  });

  it("returns http_error for non-2xx", async () => {
    resolvesTo("93.184.216.34");
    mockFetchOnce(new Response("nope", { status: 404, headers: { "content-type": "image/png" } }));
    const res = await fetchRemoteImageSafely("https://cdn.example.com/a.png");
    expect(res).toMatchObject({ ok: false, code: "http_error" });
  });

  it("maps aborts to a timeout error", async () => {
    resolvesTo("93.184.216.34");
    globalThis.fetch = vi.fn().mockImplementation(() => {
      const err = new Error("aborted");
      err.name = "AbortError";
      return Promise.reject(err);
    }) as unknown as typeof fetch;
    const res = await fetchRemoteImageSafely("https://cdn.example.com/a.png");
    expect(res).toMatchObject({ ok: false, code: "timeout" });
  });
});
