import { describe, expect, it } from "vitest";
import {
  formatUpcomingSchedulePrimaryTimeLine,
  minutesUntilJobStartJohannesburg,
  parseJobStartJohannesburgInstantMs,
  resolveUpcomingPrimaryCta,
} from "@/lib/cleaner/cleanerUpcomingScheduleJohannesburg";

describe("parseJobStartJohannesburgInstantMs", () => {
  it("parses wall time as SAST (+2)", () => {
    const ms = parseJobStartJohannesburgInstantMs("2026-04-28", "14:00");
    expect(ms).toBe(Date.parse("2026-04-28T14:00:00+02:00"));
  });
});

describe("minutesUntilJobStartJohannesburg", () => {
  it("returns positive minutes before start", () => {
    const now = new Date(Date.parse("2026-04-28T13:00:00+02:00"));
    const m = minutesUntilJobStartJohannesburg("2026-04-28", "14:00", now);
    expect(m).toBe(60);
  });
});

describe("formatUpcomingSchedulePrimaryTimeLine", () => {
  it("shows In N min same JHB day when within 120 min", () => {
    const now = new Date(Date.parse("2026-04-28T13:15:00+02:00"));
    const line = formatUpcomingSchedulePrimaryTimeLine("2026-04-28", "14:00", now);
    expect(line).toMatch(/^In 45 min$/);
  });

  it("shows Today · HH:mm when far same day", () => {
    const now = new Date(Date.parse("2026-04-28T08:00:00+02:00"));
    const line = formatUpcomingSchedulePrimaryTimeLine("2026-04-28", "14:00", now);
    expect(line).toBe("Today · 14:00");
  });
});

describe("resolveUpcomingPrimaryCta", () => {
  it("returns view_details when en_route and more than 90 min", () => {
    const r = resolveUpcomingPrimaryCta({ kind: "en_route" }, 91);
    expect(r).toEqual({ kind: "view_details" });
  });

  it("returns Prepare to leave between 30 and 90 min", () => {
    const r = resolveUpcomingPrimaryCta({ kind: "en_route" }, 45);
    expect(r).toEqual({ kind: "lifecycle", action: "en_route", label: "Prepare to leave" });
  });

  it("returns Start travel at 30 min boundary", () => {
    const r = resolveUpcomingPrimaryCta({ kind: "en_route" }, 30);
    expect(r).toEqual({ kind: "lifecycle", action: "en_route", label: "Start travel" });
  });
});
