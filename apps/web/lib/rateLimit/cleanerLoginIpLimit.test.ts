import { describe, expect, it } from "vitest";
import {
  allowCleanerLoginIpRequest,
  allowCleanerLoginPhoneRequest,
} from "@/lib/rateLimit/cleanerLoginIpLimit";

describe("allowCleanerLoginIpRequest", () => {
  it("allows under cap then blocks the next attempt", () => {
    const key = `test-ip:${Math.random()}`;
    for (let i = 0; i < 5; i++) {
      expect(allowCleanerLoginIpRequest(key)).toBe(true);
    }
    expect(allowCleanerLoginIpRequest(key)).toBe(false);
  });
});

describe("allowCleanerLoginPhoneRequest", () => {
  it("allows under cap then blocks the next attempt", () => {
    const key = `test-phone:${Math.random()}`;
    for (let i = 0; i < 10; i++) {
      expect(allowCleanerLoginPhoneRequest(key)).toBe(true);
    }
    expect(allowCleanerLoginPhoneRequest(key)).toBe(false);
  });
});
