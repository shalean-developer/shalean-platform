import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST, GET } from "@/app/api/meta/data-deletion/route";
import {
  buildMetaDataDeletionAck,
  hashMetaUserIdForAudit,
} from "@/lib/meta/dataDeletion";

const RAW_META_USER_SENTINEL = "meta-user-raw-sentinel-984731";

const FORBIDDEN_IDENTITY_KEYS = [
  "user_id",
  "userId",
  "meta_user_id",
  "metaUserId",
  "email",
  "token",
  "access_token",
  "signed_request",
  "signedRequest",
] as const;

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

function assertPublicAckShape(json: unknown): asserts json is {
  url: string;
  confirmation_code: string;
} {
  expect(json).toEqual(
    expect.objectContaining({
      url: expect.any(String),
      confirmation_code: expect.any(String),
    }),
  );
  expect(Object.keys(json as object).sort()).toEqual(["confirmation_code", "url"]);
  for (const key of FORBIDDEN_IDENTITY_KEYS) {
    expect(json).not.toHaveProperty(key);
  }
}

function assertRawSentinelAbsent(parts: {
  json: { url: string; confirmation_code: string };
  serialized: string;
  loggedAck?: unknown;
}) {
  const { json, serialized, loggedAck } = parts;
  expect(json.url).not.toContain(RAW_META_USER_SENTINEL);
  expect(json.confirmation_code).not.toContain(RAW_META_USER_SENTINEL);
  expect(serialized).not.toContain(RAW_META_USER_SENTINEL);
  if (loggedAck !== undefined) {
    expect(JSON.stringify(loggedAck)).not.toContain(RAW_META_USER_SENTINEL);
  }
}

describe("POST /api/meta/data-deletion", () => {
  beforeEach(() => {
    process.env.FACEBOOK_APP_SECRET = "test-secret";
    process.env.NEXT_PUBLIC_SITE_URL = "https://shalean.co.za";
  });

  afterEach(() => {
    delete process.env.FACEBOOK_APP_SECRET;
    delete process.env.META_APP_SECRET;
    vi.restoreAllMocks();
  });

  it("returns confirmation url and code for a valid signed_request", async () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const signed = makeSignedRequest(
      { user_id: RAW_META_USER_SENTINEL, algorithm: "HMAC-SHA256" },
      "test-secret",
    );
    const body = new URLSearchParams({ signed_request: signed });
    const res = await POST(
      new Request("https://shalean.co.za/api/meta/data-deletion", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body,
      }),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as unknown;
    assertPublicAckShape(json);

    expect(json.confirmation_code).toMatch(/^[a-f0-9]+\.[a-z0-9]+\.[A-Za-z0-9_-]+$/);
    expect(json.url).toContain("/data-deletion/status");
    const statusUrl = new URL(json.url);
    expect(statusUrl.searchParams.get("code")).toBe(json.confirmation_code);

    const serialized = JSON.stringify(json);
    const loggedAck = infoSpy.mock.calls.find(
      (call) => call[0] === "[meta-data-deletion] request_ack",
    )?.[1];
    expect(loggedAck).toEqual(
      expect.objectContaining({
        userHash: hashMetaUserIdForAudit(RAW_META_USER_SENTINEL),
        confirmationCode: json.confirmation_code,
        status: "acknowledged_pending_operator",
        owner: "privacy-support",
      }),
    );
    assertRawSentinelAbsent({ json, serialized, loggedAck });
    expect(verifyConfirmationCodeNonIdentifying(json.confirmation_code)).toBe(true);
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
    const signed = makeSignedRequest(
      { user_id: RAW_META_USER_SENTINEL, algorithm: "HMAC-SHA256" },
      "wrong-secret",
    );
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

  it("does not fail when confirmation codes contain harmless substrings like 99", () => {
    // Regression: brittle `JSON.stringify(json).not.toContain("99")` false-failed
    // when a legitimate confirmation-code hash included …08299a8….
    const ack = buildMetaDataDeletionAck("abc08299a8def.tihit0.harmlessMacToken99");
    assertPublicAckShape(ack);
    const serialized = JSON.stringify(ack);
    expect(serialized).toContain("99");
    expect(serialized).not.toContain(RAW_META_USER_SENTINEL);
    for (const key of FORBIDDEN_IDENTITY_KEYS) {
      expect(ack).not.toHaveProperty(key);
    }
    expect(ack.url).not.toContain(RAW_META_USER_SENTINEL);
    expect(ack.confirmation_code).not.toContain(RAW_META_USER_SENTINEL);
  });
});

function verifyConfirmationCodeNonIdentifying(code: string): boolean {
  // Opaque nonce.issuedAt.mac — must not embed the raw Meta user sentinel.
  if (code.includes(RAW_META_USER_SENTINEL)) return false;
  if (!/^[a-f0-9]+\.[a-z0-9]+\.[A-Za-z0-9_-]+$/.test(code)) return false;
  const parts = code.split(".");
  return parts.length === 3 && parts.every((p) => p.length > 0);
}
