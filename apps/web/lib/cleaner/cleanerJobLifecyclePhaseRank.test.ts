import { describe, expect, it } from "vitest";
import {
  type LifecycleWireLike,
  lifecyclePhaseRankFromWire,
  mergeLifecyclePatchOntoIncoming,
  pickIncomingJobAvoidPhaseRegression,
} from "@/lib/cleaner/cleanerJobLifecyclePhaseRank";

describe("mergeLifecyclePatchOntoIncoming", () => {
  it("overlays cleaner_response_status without dropping other incoming fields", () => {
    const incoming = { status: "assigned", cleaner_response_status: "pending" as const };
    const patch = { cleaner_response_status: "accepted" as const };
    expect(mergeLifecyclePatchOntoIncoming(incoming, patch)).toEqual({
      status: "assigned",
      cleaner_response_status: "accepted",
    });
  });
});

describe("pickIncomingJobAvoidPhaseRegression", () => {
  it("merges optimistic lifecycle onto incoming when server GET lags behind patch (accept / complete)", () => {
    const prev: LifecycleWireLike = { status: "in_progress", started_at: "2026-01-01T10:00:00Z" };
    const incoming: LifecycleWireLike = { status: "in_progress", started_at: "2026-01-01T10:00:00Z" };
    const patch = { status: "completed" as const, completed_at: "2026-01-01T11:00:00Z" };
    expect(pickIncomingJobAvoidPhaseRegression(prev, incoming, patch)).toEqual({
      status: "completed",
      started_at: "2026-01-01T10:00:00Z",
      completed_at: "2026-01-01T11:00:00Z",
    });
  });

  it("merges accepted ack onto stale assigned payload after accept", () => {
    const prev: LifecycleWireLike = { status: "assigned", cleaner_response_status: "pending" };
    const incoming: LifecycleWireLike = { status: "assigned", cleaner_response_status: "pending" };
    const patch = { cleaner_response_status: "accepted" as const };
    expect(pickIncomingJobAvoidPhaseRegression(prev, incoming, patch)).toEqual({
      status: "assigned",
      cleaner_response_status: "accepted",
    });
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

  it("merges session/cache `prev` onto stale GET when no optimistic patch (navigate away after accept)", () => {
    const prev: LifecycleWireLike = { status: "assigned", cleaner_response_status: "accepted" };
    const incoming: LifecycleWireLike = { status: "assigned", cleaner_response_status: "pending" };
    expect(pickIncomingJobAvoidPhaseRegression(prev, incoming, null)).toEqual({
      status: "assigned",
      cleaner_response_status: "accepted",
    });
  });
});

describe("lifecyclePhaseRankFromWire", () => {
  it("ranks completed above in_progress", () => {
    expect(lifecyclePhaseRankFromWire({ status: "completed" })).toBeGreaterThan(
      lifecyclePhaseRankFromWire({ status: "in_progress" }),
    );
  });
});
