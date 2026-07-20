import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { POST, GET } from "@/app/api/meta/data-deletion/route";

function encodeMetaBase64Url(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function makeSignedRequest(payload: object, secret: string): string {
  const encodedPayload = encodeMetaBase64Url(Buffer.from(JSON.stringify(payload), "utf8"));
  const sig = createHmac("sha256", secret).update(encodedPayload).digest();
  return `${encodeMetaBase64Url(sig)}.${encodedPayload}`;
}

describe("POST /api/meta/data-deletion", () => {
  beforeEach(() => {
    process.env.FACEBOOK_APP_SECRET = "test-secret";
    process.env.NEXT_PUBLIC_SITE_URL = "https://shalean.co.za";
  });

  afterEach(() => {
    delete process.env.FACEBOOK_APP_SECRET;
    delete process.env.META_APP_SECRET;
  });

  it("returns confirmation url and code for a valid signed_request", async () => {
    const signed = makeSignedRequest({ user_id: "99", algorithm: "HMAC-SHA256" }, "test-secret");
    const body = new URLSearchParams({ signed_request: signed });
    const res = await POST(
      new Request("https://shalean.co.za/api/meta/data-deletion", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body,
      }),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { url: string; confirmation_code: string };
    expect(json.confirmation_code).toMatch(/^[a-f0-9]+\.[a-z0-9]+\.[A-Za-z0-9_-]+$/);
    expect(json.url).toContain("/data-deletion/status?code=");
    expect(JSON.stringify(json)).not.toContain("99");
  });

  it("rejects missing signed_request", async () => {
    const res = await POST(
      new Request("https://shalean.co.za/api/meta/data-deletion", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({}),
      }),
    );
    expect(res.status).toBe(400);
  });

  it("rejects invalid signature fail-closed", async () => {
    const signed = makeSignedRequest({ user_id: "99", algorithm: "HMAC-SHA256" }, "wrong-secret");
    const res = await POST(
      new Request("https://shalean.co.za/api/meta/data-deletion", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ signed_request: signed }),
      }),
    );
    expect(res.status).toBe(400);
  });

  it("rejects GET", async () => {
    const res = GET();
    expect(res.status).toBe(405);
  });
});
