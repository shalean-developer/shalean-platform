import { describe, expect, it } from "vitest";
import {
  buildGscDateRange,
  buildGscPreviousDateRange,
  formatGscYmd,
  normalizeGscPrivateKey,
  pctChange,
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

describe("buildGscPreviousDateRange", () => {
  it("returns the prior non-overlapping window", () => {
    const now = new Date("2026-06-20T12:00:00.000Z");
    const current = buildGscDateRange(7, now);
    const previous = buildGscPreviousDateRange(7, now);
    expect(current.startDate).toBe("2026-06-13");
    expect(previous.endDate).toBe("2026-06-12");
    expect(previous.startDate).toBe("2026-06-06");
  });
});

describe("pctChange", () => {
  it("computes percent delta", () => {
    expect(pctChange(120, 100)).toBe(20);
    expect(pctChange(0, 0)).toBeNull();
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
