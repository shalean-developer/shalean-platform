import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Stage 03 targeted Zoho repair payment durability", () => {
  it("persists every newly allocated payment ID before fallible metadata upsert", () => {
    const source = readFileSync(resolve(process.cwd(), "lib/accounting/invE2e01dTargetedRepair.ts"), "utf8");
    const pattern = /await settleQueue\(admin, tx, queueId, paid\.paymentId\);\s*await upsertInvoiceSyncMetadata\(admin, \{/g;
    expect([...source.matchAll(pattern)]).toHaveLength(3);
    expect([...source.matchAll(/await settleQueue\(admin, tx, queueId, paid\.paymentId\);/g)]).toHaveLength(3);
  });
});
