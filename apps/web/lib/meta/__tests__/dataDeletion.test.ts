import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildMetaDataDeletionAck,
  decodeMetaBase64Url,
  hashMetaUserIdForAudit,
  issueDataDeletionConfirmationCode,
  parseMetaSignedRequest,
  verifyDataDeletionConfirmationCode,
} from "@/lib/meta/dataDeletion";

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

describe("meta dataDeletion", () => {
  afterEach(() => {
    delete process.env.FACEBOOK_APP_SECRET;
    delete process.env.META_APP_SECRET;
  });

  it("parses a valid signed_request", () => {
    process.env.FACEBOOK_APP_SECRET = "test-secret";
    const signed = makeSignedRequest({ algorithm: "HMAC-SHA256", user_id: "12345", issued_at: 1 }, "test-secret");
    const parsed = parseMetaSignedRequest(signed);
    expect(parsed?.user_id).toBe("12345");
  });

  it("rejects tampered signed_request", () => {
    process.env.FACEBOOK_APP_SECRET = "test-secret";
    const signed = makeSignedRequest({ user_id: "12345" }, "test-secret");
    expect(parseMetaSignedRequest(signed + "x")).toBeNull();
    expect(parseMetaSignedRequest(signed, "other-secret")).toBeNull();
  });

  it("rejects unexpected signed_request algorithm", () => {
    process.env.FACEBOOK_APP_SECRET = "test-secret";
    const signed = makeSignedRequest(
      { algorithm: "HMAC-SHA1", user_id: "12345" },
      "test-secret",
    );
    expect(parseMetaSignedRequest(signed)).toBeNull();
  });

  it("issues and verifies confirmation codes without storing PII", () => {
    process.env.FACEBOOK_APP_SECRET = "test-secret";
    const code = issueDataDeletionConfirmationCode();
    expect(code).toBeTruthy();
    expect(verifyDataDeletionConfirmationCode(code!)).toEqual(
      expect.objectContaining({ ok: true }),
    );
    expect(verifyDataDeletionConfirmationCode("not-a-code")).toEqual({ ok: false });
    expect(hashMetaUserIdForAudit("12345")).toHaveLength(16);
    expect(hashMetaUserIdForAudit("12345")).not.toContain("12345");
  });

  it("builds ack payload with status URL", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://shalean.co.za";
    const ack = buildMetaDataDeletionAck("abc.def.ghi");
    expect(ack.confirmation_code).toBe("abc.def.ghi");
    expect(ack.url).toContain("/data-deletion/status");
    expect(ack.url).toContain("code=abc.def.ghi");
  });

  it("decodes meta base64url", () => {
    expect(decodeMetaBase64Url(encodeMetaBase64Url(Buffer.from("hi"))).toString("utf8")).toBe("hi");
  });
});
