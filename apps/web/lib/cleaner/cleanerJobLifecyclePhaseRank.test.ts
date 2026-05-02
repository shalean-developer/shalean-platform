import { describe, expect, it } from "vitest";
import {
  type LifecycleWireLike,
  lifecyclePhaseRankFromWire,
  pickIncomingJobAvoidPhaseRegression,
} from "@/lib/cleaner/cleanerJobLifecyclePhaseRank";

describe("pickIncomingJobAvoidPhaseRegression", () => {
  it("keeps prev when optimistic is ahead of server", () => {
    const prev: LifecycleWireLike = { status: "in_progress", started_at: "2026-01-01T10:00:00Z" };
    const incoming: LifecycleWireLike = { status: "in_progress", started_at: "2026-01-01T10:00:00Z" };
    const patch = { status: "completed" as const, completed_at: "2026-01-01T11:00:00Z" };
    expect(pickIncomingJobAvoidPhaseRegression(prev, incoming, patch)).toBe(prev);
  });

  it("accepts server when it matches optimistic completion", () => {
    const prev: LifecycleWireLike = { status: "in_progress", started_at: "2026-01-01T10:00:00Z" };
    const incoming: LifecycleWireLike = { status: "completed", completed_at: "2026-01-01T11:00:00Z" };
    const patch = { status: "completed" as const, completed_at: "2026-01-01T11:00:00Z" };
    expect(pickIncomingJobAvoidPhaseRegression(prev, incoming, patch)).toBe(incoming);
  });

  it("accepts forward server progress", () => {
    const prev: LifecycleWireLike = { status: "confirmed" };
    const incoming: LifecycleWireLike = { status: "in_progress", started_at: "2026-01-01T10:00:00Z" };
    expect(pickIncomingJobAvoidPhaseRegression(prev, incoming, null)).toBe(incoming);
  });

  it("always accepts terminal incoming (cancelled)", () => {
    const prev: LifecycleWireLike = { status: "in_progress", started_at: "2026-01-01T10:00:00Z" };
    const incoming: LifecycleWireLike = { status: "cancelled" };
    expect(pickIncomingJobAvoidPhaseRegression(prev, incoming, null)).toBe(incoming);
  });

  it("keeps prev terminal when server lags with non-terminal", () => {
    const prev: LifecycleWireLike = { status: "cancelled" };
    const incoming: LifecycleWireLike = { status: "in_progress", started_at: "2026-01-01T10:00:00Z" };
    expect(pickIncomingJobAvoidPhaseRegression(prev, incoming, null)).toBe(prev);
  });

  it("does not regress from completed when server payload lags behind", () => {
    const prev: LifecycleWireLike = { status: "completed", completed_at: "2026-01-01T12:00:00Z" };
    const incoming: LifecycleWireLike = { status: "in_progress", started_at: "2026-01-01T10:00:00Z" };
    expect(pickIncomingJobAvoidPhaseRegression(prev, incoming, null)).toBe(prev);
  });
});

describe("lifecyclePhaseRankFromWire", () => {
  it("ranks completed above in_progress", () => {
    expect(lifecyclePhaseRankFromWire({ status: "completed" })).toBeGreaterThan(
      lifecyclePhaseRankFromWire({ status: "in_progress" }),
    );
  });
});
