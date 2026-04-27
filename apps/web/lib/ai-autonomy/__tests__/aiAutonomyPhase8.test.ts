import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { isAiAutonomyEnabled, isAiAutoRolloutEnabled, isAiTimingOptimizationEnabled } from "@/lib/ai-autonomy/aiAutonomyEnv";

describe("Phase 8 safety defaults", () => {
  const env = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...env };
    delete process.env.AI_AUTONOMY_ENABLED;
    delete process.env.AI_AUTO_ROLLOUT_ENABLED;
    delete process.env.AI_TIMING_OPTIMIZATION_ENABLED;
  });

  afterEach(() => {
    process.env = env;
  });

  it("disables all autonomy flags by default", () => {
    expect(isAiAutonomyEnabled()).toBe(false);
    expect(isAiAutoRolloutEnabled()).toBe(false);
    expect(isAiTimingOptimizationEnabled()).toBe(false);
  });

  it("enables flags only when set true", () => {
    process.env.AI_AUTONOMY_ENABLED = "true";
    process.env.AI_AUTO_ROLLOUT_ENABLED = "1";
    process.env.AI_TIMING_OPTIMIZATION_ENABLED = "true";
    expect(isAiAutonomyEnabled()).toBe(true);
    expect(isAiAutoRolloutEnabled()).toBe(true);
    expect(isAiTimingOptimizationEnabled()).toBe(true);
  });
});
