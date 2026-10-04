import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("INV-E2E-03G accounting queue starvation", () => {
  it("filters max-retry failed records before applying the queue limit", () => {
    const src = readFileSync(
      resolve(process.cwd(), "lib/accounting/processAccountingSyncQueue.ts"),
      "utf8",
    );

    expect(src).toContain(
      "sync_status.eq.pending,and(sync_status.eq.failed,retry_count.lt.${settings.max_retry_attempts})",
    );
    expect(src).toContain('.order("created_at", { ascending: true })');
    expect(src).toContain(".limit(limit)");
  });
});
