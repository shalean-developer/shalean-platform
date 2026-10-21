import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Stage 03 CLI Zoho targeted repair durability", () => {
  it("persists all three verified payment IDs before fallible invoice metadata writes", () => {
    const source = readFileSync(resolve(process.cwd(), "scripts/repairZohoTargeted10.ts"), "utf8");
    const pair = /await settleQueue\(admin, tx, queueId, paid\.paymentId\);\s*await upsertInvoiceSyncMetadata\(admin, \{/g;
    expect([...source.matchAll(pair)]).toHaveLength(3);
    expect([...source.matchAll(/await settleQueue\(admin, tx, queueId, paid\.paymentId\)/g)]).toHaveLength(3);
  });
});
