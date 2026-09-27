import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  join(process.cwd(), "../../supabase/migrations/20260927210500_retire_disabled_review_sms_queue.sql"),
  "utf8",
);

describe("P3-13 review SMS retirement migration", () => {
  it("stops the database from creating SMS review prompts while SMS is disabled", () => {
    expect(sql).toContain("drop trigger if exists bookings_enqueue_review_prompt_on_completion");
  });

  it("clears only never-sent SMS review queue rows", () => {
    expect(sql).toContain("delete from public.review_sms_prompt_queue");
    expect(sql).toContain("where first_sent_at is null");
    expect(sql).toContain("and reminder_sent_at is null");
    expect(sql).not.toMatch(/truncate\s+(table\s+)?public\.review_sms_prompt_queue/i);
  });

  it("adds bounded retry state for a future explicitly governed SMS re-enable", () => {
    expect(sql).toContain("first_attempts integer not null default 0");
    expect(sql).toContain("reminder_attempts integer not null default 0");
    expect(sql).toContain("last_error text");
  });
});
