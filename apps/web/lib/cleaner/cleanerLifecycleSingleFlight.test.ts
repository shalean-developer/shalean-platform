import { describe, expect, it } from "vitest";
import { createSingleFlight } from "@/lib/cleaner/cleanerLifecycleSingleFlight";

describe("createSingleFlight", () => {
  it("runs only one concurrent execution", async () => {
    const gate = createSingleFlight();
    let active = 0;
    let maxActive = 0;
    const slow = () =>
      new Promise<number>((resolve) => {
        active++;
        maxActive = Math.max(maxActive, active);
        setTimeout(() => {
          active--;
          resolve(1);
        }, 20);
      });
    const a = gate.run(slow);
    const b = gate.run(slow);
    const [ra, rb] = await Promise.all([a, b]);
    expect(maxActive).toBe(1);
    expect(ra).toBe(1);
    expect(rb).toBeUndefined();
  });
});
