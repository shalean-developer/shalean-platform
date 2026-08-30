import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  appendStoredReferralToHref,
  clearStoredReferral,
  getStoredReferral,
  setReferralCapture,
} from "./client";

class MemoryStorage {
  private values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

describe("referral client capture", () => {
  beforeEach(() => {
    vi.stubGlobal("window", {
      localStorage: new MemoryStorage(),
      location: { origin: "http://localhost:3000" },
    });
  });

  it("stores normalized customer referral codes", () => {
    setReferralCapture(" abc123 ", "customer");
    expect(getStoredReferral("customer")).toBe("ABC123");
  });

  it("appends a stored referral code to the booking URL", () => {
    setReferralCapture("abc123", "customer");
    expect(appendStoredReferralToHref("/book")).toBe("/book?ref=ABC123");
  });

  it("preserves existing booking query parameters when appending attribution", () => {
    setReferralCapture("abc123", "customer");
    expect(appendStoredReferralToHref("/book?service=deep")).toBe(
      "/book?service=deep&ref=ABC123",
    );
  });

  it("does not overwrite an explicit referral already on the destination URL", () => {
    setReferralCapture("abc123", "customer");
    expect(appendStoredReferralToHref("/book?ref=OTHER")).toBe("/book?ref=OTHER");
  });

  it("keeps customer and cleaner referral captures isolated", () => {
    setReferralCapture("cleaner123", "cleaner");
    expect(appendStoredReferralToHref("/book", "customer")).toBe("/book");
    expect(getStoredReferral("cleaner")).toBe("CLEANER123");
    clearStoredReferral("cleaner");
    expect(getStoredReferral("cleaner")).toBeNull();
  });
});
