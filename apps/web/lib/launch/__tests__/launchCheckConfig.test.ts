import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  buildLaunchCheckSetupHints,
  isLaunchCheckConfigReady,
  isLaunchCheckEnabled,
} from "@/lib/launch/launchCheckConfig";
import type { LaunchCheckConfigResolved } from "@/lib/launch/types";

function sampleConfig(overrides: Partial<LaunchCheckConfigResolved> = {}): LaunchCheckConfigResolved {
  return {
    customerUserId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    cleanerId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    cleanerUserId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    adminUserId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    adminEmail: "admin@example.com",
    sources: {
      customerUserId: "discovered",
      cleanerId: "discovered",
      cleanerUserId: "discovered",
      adminUserId: "session",
    },
    ...overrides,
  };
}

describe("isLaunchCheckConfigReady", () => {
  it("requires customer and admin ids", () => {
    expect(isLaunchCheckConfigReady(sampleConfig())).toBe(true);
    expect(isLaunchCheckConfigReady(sampleConfig({ customerUserId: null }))).toBe(false);
    expect(isLaunchCheckConfigReady(sampleConfig({ adminUserId: null }))).toBe(false);
  });
});

describe("buildLaunchCheckSetupHints", () => {
  it("flags missing identities", () => {
    const hints = buildLaunchCheckSetupHints(
      sampleConfig({
        customerUserId: null,
        cleanerId: null,
        cleanerUserId: null,
        adminUserId: null,
      }),
    );
    expect(hints.some((h) => h.includes("customer"))).toBe(true);
    expect(hints.some((h) => h.includes("Admin"))).toBe(true);
    expect(hints.some((h) => h.includes("cleaner"))).toBe(true);
  });
});

describe("isLaunchCheckEnabled", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  it("is enabled outside production by default", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("VERCEL_ENV", "");
    expect(isLaunchCheckEnabled()).toBe(true);
  });
});
