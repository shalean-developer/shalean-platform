import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  FCO_EQUIPMENT_SESSION_COOKIE,
  hashFcoEquipmentSession,
  issueFcoEquipmentSession,
  readFcoEquipmentSession,
  setFcoEquipmentSessionCookie,
} from "@/lib/booking-v2/fcoEquipmentSession";

beforeEach(() => vi.stubEnv("FCO_01_EQUIPMENT_RECEIPT_SECRET", "fco-test-cookie-signing-secret-with-sufficient-entropy"));
afterEach(() => vi.unstubAllEnvs());

describe("FCO-01 server-authenticated browser session", () => {
  it("issues and reuses only a server-authenticated session", () => {
    const session = issueFcoEquipmentSession(new Request("https://test.example/"));
    expect(session).toMatch(/^[a-f0-9]{64}\.[a-f0-9]{64}$/);
    const request = new Request("https://test.example/", {
      headers: { cookie: FCO_EQUIPMENT_SESSION_COOKIE + "=" + session },
    });
    expect(readFcoEquipmentSession(request)).toBe(session);
    expect(issueFcoEquipmentSession(request)).toBe(session);
    expect(hashFcoEquipmentSession(session)).toMatch(/^[a-f0-9]{64}$/);
  });

  it("does not trust arbitrary, forged, or modified browser cookies", () => {
    const session = issueFcoEquipmentSession(new Request("https://test.example/"));
    for (const supplied of [
      "a".repeat(64),
      "a".repeat(64) + "." + "b".repeat(64),
      session.replace(/^./, session.startsWith("a") ? "b" : "a"),
      "",
    ]) {
      const request = new Request("https://test.example/", {
        headers: { cookie: FCO_EQUIPMENT_SESSION_COOKIE + "=" + supplied },
      });
      expect(readFcoEquipmentSession(request)).toBeNull();
      expect(issueFcoEquipmentSession(request)).not.toBe(supplied);
    }
  });

  it("sets an HttpOnly scoped short-lived cookie, not a public JS value", () => {
    const session = issueFcoEquipmentSession(new Request("https://test.example/"));
    const response = new Response("ok");
    setFcoEquipmentSessionCookie(response, session);
    const header = response.headers.get("set-cookie") ?? "";
    expect(header).toContain("HttpOnly");
    expect(header).toContain("SameSite=Lax");
    expect(header).toContain("Path=/api/booking-v2");
    expect(header).toContain("Max-Age=600");
    expect(header).toContain(session);
  });
});
