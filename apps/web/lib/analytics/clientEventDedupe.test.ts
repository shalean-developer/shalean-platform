import { beforeEach, describe, expect, it } from "vitest";
import { clearClientEventDedupeForTests, shouldSendClientEvent } from "./clientEventDedupe";

describe("shouldSendClientEvent", () => {
  beforeEach(clearClientEventDedupeForTests);

  it("suppresses an identical remount event even when its timestamp changes", () => {
    expect(shouldSendClientEvent("growth", { event: "view", timestamp: "first" })).toBe(true);
    expect(shouldSendClientEvent("growth", { event: "view", timestamp: "second" })).toBe(false);
  });

  it("preserves distinct interactions", () => {
    expect(shouldSendClientEvent("growth", { event: "click", target: "one" })).toBe(true);
    expect(shouldSendClientEvent("growth", { event: "click", target: "two" })).toBe(true);
  });
});
