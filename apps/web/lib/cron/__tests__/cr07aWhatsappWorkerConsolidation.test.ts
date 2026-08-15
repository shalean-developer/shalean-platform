import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(process.cwd(), "../..");
const cronRoute = readFileSync(
  resolve(process.cwd(), "app/api/cron/whatsapp-worker/route.ts"),
  "utf8",
);
const supabaseConfig = readFileSync(resolve(repoRoot, "supabase/config.toml"), "utf8");
const retiredReadme = readFileSync(
  resolve(repoRoot, "supabase/functions/whatsapp-worker/README.md"),
  "utf8",
);

describe("CR-07A WhatsApp worker consolidation", () => {
  it("keeps the provider-aware Next.js worker as the canonical executable path", () => {
    expect(cronRoute).toContain("@/lib/whatsapp/providerQueue");
    expect(cronRoute).toContain("processWhatsAppPendingBatchViaProvider");
  });

  it("removes the duplicate executable Supabase Edge worker", () => {
    for (const file of [
      "index.ts",
      "flushJob.ts",
      "processBatch.ts",
      "listPending.ts",
      "queueUtils.ts",
      "types.ts",
    ]) {
      expect(existsSync(resolve(repoRoot, "supabase/functions/whatsapp-worker", file))).toBe(false);
    }
    expect(supabaseConfig).not.toContain("[functions.whatsapp-worker]");
  });

  it("documents that the retired Edge worker must not be redeployed", () => {
    expect(retiredReadme).toContain("Canonical production worker");
    expect(retiredReadme).toContain("Do not redeploy");
    expect(retiredReadme).toContain("providerQueue.ts");
  });
});
