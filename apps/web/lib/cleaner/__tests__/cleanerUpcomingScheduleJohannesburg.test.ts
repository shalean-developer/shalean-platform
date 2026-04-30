import { describe, expect, it } from "vitest";
import {
  formatUpcomingSchedulePrimaryTimeLine,
  minutesUntilJobStartJohannesburg,
  parseJobStartJohannesburgInstantMs,
  resolveUpcomingPrimaryCta,
  upcomingScheduleStatusChip,
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

describe("upcomingScheduleStatusChip", () => {
  it("does not show late before cleaner has accepted", () => {
    const row = { status: "assigned", cleaner_response_status: "pending", en_route_at: null };
    expect(upcomingScheduleStatusChip(row, -30)).toBe("upcoming");
  });

  it("shows late after accept when past start", () => {
    const row = { status: "assigned", cleaner_response_status: "accepted", en_route_at: null };
    expect(upcomingScheduleStatusChip(row, -30)).toBe("late");
  });
});

describe("resolveUpcomingPrimaryCta", () => {
  it("returns On my way for en_route regardless of minutes until start", () => {
    expect(resolveUpcomingPrimaryCta({ kind: "en_route" }, 91)).toEqual({
      kind: "lifecycle",
      action: "en_route",
      label: "On my way",
    });
    expect(resolveUpcomingPrimaryCta({ kind: "en_route" }, 45)).toEqual({
      kind: "lifecycle",
      action: "en_route",
      label: "On my way",
    });
    expect(resolveUpcomingPrimaryCta({ kind: "en_route" }, -20)).toEqual({
      kind: "lifecycle",
      action: "en_route",
      label: "On my way",
    });
  });
});
