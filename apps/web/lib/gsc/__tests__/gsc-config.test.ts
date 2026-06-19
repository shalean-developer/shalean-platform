import { describe, expect, it } from "vitest";
import {
  buildGscDateRange,
  formatGscYmd,
  normalizeGscPrivateKey,
  readGscSyncDays,
} from "@/lib/gsc/gsc-config";

describe("normalizeGscPrivateKey", () => {
  it("converts escaped newlines", () => {
    expect(normalizeGscPrivateKey("line1\\nline2")).toBe("line1\nline2");
  });
});

describe("buildGscDateRange", () => {
  it("ends on yesterday UTC", () => {
    const now = new Date("2026-06-20T12:00:00.000Z");
    const range = buildGscDateRange(7, now);
    expect(range.endDate).toBe("2026-06-19");
    expect(range.startDate).toBe("2026-06-13");
  });
});

describe("formatGscYmd", () => {
  it("formats UTC dates", () => {
    expect(formatGscYmd(new Date("2026-01-05T00:00:00.000Z"))).toBe("2026-01-05");
  });
});

describe("readGscSyncDays", () => {
  it("defaults to 90", () => {
    const prev = process.env.GSC_SYNC_DAYS;
    delete process.env.GSC_SYNC_DAYS;
    expect(readGscSyncDays()).toBe(90);
    if (prev) process.env.GSC_SYNC_DAYS = prev;
  });
});
