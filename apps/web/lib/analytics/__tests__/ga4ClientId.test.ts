import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import {
  getGa4BrowserClientId,
  getGa4CheckoutIdentityFields,
  parseGaClientIdFromCookie,
} from "@/lib/analytics/ga4ClientId";

describe("parseGaClientIdFromCookie", () => {
  it("parses GA1.1.<a>.<b> cookies", () => {
    expect(parseGaClientIdFromCookie("GA1.1.1234567890.1712345678")).toBe("1234567890.1712345678");
  });

  it("accepts already-normalized ids", () => {
    expect(parseGaClientIdFromCookie("1234567890.1712345678")).toBe("1234567890.1712345678");
  });

  it("rejects invalid values", () => {
    expect(parseGaClientIdFromCookie("")).toBeNull();
    expect(parseGaClientIdFromCookie("not-a-ga-id")).toBeNull();
  });
});

describe("getGa4BrowserClientId", () => {
  const originalWindow = globalThis.window;
  const originalDocument = globalThis.document;

  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => {
          store.set(k, v);
        },
      },
    });
    vi.stubGlobal("document", { cookie: "" });
    delete process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
    delete process.env.GA4_MEASUREMENT_ID;
  });

  afterEach(() => {
    if (originalWindow === undefined) {
      // @ts-expect-error cleanup jsdom stub
      delete globalThis.window;
    } else {
      vi.stubGlobal("window", originalWindow);
    }
    if (originalDocument === undefined) {
      // @ts-expect-error cleanup jsdom stub
      delete globalThis.document;
    } else {
      vi.stubGlobal("document", originalDocument);
    }
    vi.unstubAllGlobals();
  });

  it("reads client id from _ga cookie", () => {
    vi.stubGlobal("document", { cookie: "_ga=GA1.1.1111111111.2222222222" });
    expect(getGa4BrowserClientId()).toBe("1111111111.2222222222");
    expect(getGa4CheckoutIdentityFields().gaClientId).toBe("1111111111.2222222222");
  });

  it("prefers the canonical stream session cookie over legacy", async () => {
    const { getGa4BrowserSessionId } = await import("@/lib/analytics/ga4ClientId");
    vi.stubGlobal("document", {
      cookie:
        "_ga_6JR2GPGPN3=GS1.1.9999999999; _ga_GEVTBDWTQW=GS2.1.s1712345678$o1$g0; _ga=GA1.1.1111111111.2222222222",
    });
    expect(getGa4BrowserSessionId()).toBe("1712345678");
  });
});
