import { describe, it, expect } from "vitest";
import { computeConfirmedIdle, type ComputeConfirmedIdleInput } from "@/lib/cleaner-dashboard/computeConfirmedIdle";

function input(overrides: Partial<ComputeConfirmedIdleInput> = {}): ComputeConfirmedIdleInput {
  return {
    loading: false,
    offersError: null,
    dashboardError: null,
    pendingOffersCount: 0,
    hasNextJob: false,
    hasActiveJob: false,
    receivingOffers: true,
    ...overrides,
  };
}

describe("computeConfirmedIdle", () => {
  it("is false while loading", () => {
    expect(computeConfirmedIdle(input({ loading: true }))).toBe(false);
  });

  it("is false when either fetch surface errored (data may be partial)", () => {
    expect(computeConfirmedIdle(input({ offersError: "boom" }))).toBe(false);
    expect(computeConfirmedIdle(input({ dashboardError: "boom" }))).toBe(false);
  });

  it("is false when a pending offer exists", () => {
    expect(computeConfirmedIdle(input({ pendingOffersCount: 1 }))).toBe(false);
  });

  it("is false when there is a next or active job", () => {
    expect(computeConfirmedIdle(input({ hasNextJob: true }))).toBe(false);
    expect(computeConfirmedIdle(input({ hasActiveJob: true }))).toBe(false);
  });

  it("is true when offers loaded successfully and the queue is empty (online cleaner)", () => {
    expect(computeConfirmedIdle(input({ receivingOffers: true }))).toBe(true);
  });

  it("is true when the cleaner has paused offers and the queue is empty", () => {
    expect(computeConfirmedIdle(input({ receivingOffers: false }))).toBe(true);
  });
});
