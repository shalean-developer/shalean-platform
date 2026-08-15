import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const providerQueue = readFileSync(
  resolve(process.cwd(), "lib/whatsapp/providerQueue.ts"),
  "utf8",
);
const legacyQueue = readFileSync(
  resolve(process.cwd(), "lib/whatsapp/queue.ts"),
  "utf8",
);
const retryRoute = readFileSync(
  resolve(process.cwd(), "lib/notifications/notificationRetry.ts"),
  "utf8",
);

describe("CR-07B immediate WhatsApp processing", () => {
  it("flushes a newly inserted provider-aware queue job immediately", () => {
    const enqueueStart = providerQueue.indexOf("export async function enqueueProviderWhatsApp");
    expect(enqueueStart).toBeGreaterThan(-1);
    const enqueueSource = providerQueue.slice(enqueueStart);

    expect(enqueueSource).toContain('from("whatsapp_queue").insert(insert)');
    expect(enqueueSource).toContain("await flushWhatsAppJobViaProvider(params.admin, id)");
    expect(enqueueSource.indexOf("await flushWhatsAppJobViaProvider(params.admin, id)")).toBeGreaterThan(
      enqueueSource.indexOf('from("whatsapp_queue").insert(insert)'),
    );
  });

  it("keeps failed immediate attempts eligible for cron retry instead of aborting enqueue", () => {
    expect(providerQueue).toContain("status: dead ? \"dead\" : \"pending\"");
    expect(providerQueue).toContain("next_attempt_at: nextAttemptAt");
    expect(providerQueue).toContain("return { id };");
  });

  it("preserves immediate delivery for the older notification-retry queue path", () => {
    expect(legacyQueue).toContain("export async function flushWhatsAppJobById");
    expect(retryRoute).toContain("await flushWhatsAppJobById(admin, enq.id)");
  });
});
