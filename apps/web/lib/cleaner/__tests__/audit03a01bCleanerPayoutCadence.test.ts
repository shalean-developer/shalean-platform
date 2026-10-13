import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  CLEANER_PAYOUT_BANK_READY_COPY,
  CLEANER_PAYOUT_HELP_COPY,
  CLEANER_PAYOUT_RECRUITMENT_COPY,
  CLEANER_PAYOUT_RECRUITMENT_SEO_PHRASE,
  cleanerMonthlyPayoutCadenceJohannesburg,
} from "@shalean/utils/cleanerPayoutCadence";

const WEB_ROOT = process.cwd();
const REPO_ROOT = join(WEB_ROOT, "../..");

function readRepo(path: string): string {
  return readFileSync(join(REPO_ROOT, path), "utf8");
}

const LIVE_PAYOUT_COPY_FILES = [
  "apps/web/app/cleaner/profile/page.tsx",
  "apps/web/components/cleaner/CleanerPayoutSettingsPanel.tsx",
  "apps/web/components/cleaner-dashboard/CleanerEarningsScreen.tsx",
  "apps/web/app/(ui-redesign)/jobs/profile/help/page.tsx",
  "apps/mobile/constants/helpContent.ts",
  "apps/web/lib/cleaner/applyPageContent.ts",
  "apps/web/lib/seo/cleanerApplyLandingSeo.ts",
  "apps/web/lib/cleaner/earningsInsightsSeries.ts",
];

const FORBIDDEN_PROMISES = [
  "weekly payouts",
  "weekly payout",
  "paid weekly",
  "paid every week",
  "weekly schedule",
  "company Friday schedule",
  "Payouts run weekly on Fridays",
  "next weekly transfer",
  "next weekly payout batch",
  "Jobs must be completed before Thursday 23:59",
];

describe("AUDIT-03A-01B cleaner payout cadence convergence", () => {
  it("defines one monthly Johannesburg payout-period contract without a promised payment weekday", () => {
    const now = new Date("2026-10-13T12:00:00+02:00");
    const cadence = cleanerMonthlyPayoutCadenceJohannesburg(now);

    expect(cadence.periodStartYmd).toBe("2026-10-01");
    expect(cadence.periodEndYmd).toBe("2026-10-31");
    expect(cadence.daysRemaining).toBe(18);
    expect(cadence.headline).toContain("Monthly payout period");
    expect(cadence.paymentMethodLabel).toBe("Bank transfer");
    expect(CLEANER_PAYOUT_HELP_COPY).toContain("After the month closes");
    expect(CLEANER_PAYOUT_HELP_COPY).toContain("released by bank transfer");
    expect(CLEANER_PAYOUT_BANK_READY_COPY).toContain("monthly bank-transfer payouts");
    expect(CLEANER_PAYOUT_RECRUITMENT_COPY).toContain("Monthly bank-transfer payouts");
    expect(CLEANER_PAYOUT_RECRUITMENT_SEO_PHRASE).toBe("monthly bank-transfer payouts");
  });

  it("removes weekly/Monday/Friday payout promises from every live cleaner-facing surface", () => {
    for (const path of LIVE_PAYOUT_COPY_FILES) {
      const source = readRepo(path);
      for (const phrase of FORBIDDEN_PROMISES) {
        expect(source.toLowerCase(), `${path} still contains: ${phrase}`).not.toContain(
          phrase.toLowerCase(),
        );
      }
    }
  });

  it("profile surfaces use the API monthly payout headline instead of a synthetic Friday date", () => {
    for (const path of [
      "apps/web/app/cleaner/profile/page.tsx",
      "apps/web/components/cleaner/CleanerPayoutSettingsPanel.tsx",
    ]) {
      const source = readRepo(path);
      expect(source).toContain("summary.payout_schedule_headline");
      expect(source).not.toContain("payoutTargetFridayYmd");
      expect(source).not.toContain("nextPayoutDateLine");
    }
  });

  it("web and mobile help consume the shared cadence copy", () => {
    expect(readRepo("apps/web/app/(ui-redesign)/jobs/profile/help/page.tsx")).toContain(
      "CLEANER_PAYOUT_HELP_COPY",
    );
    expect(readRepo("apps/mobile/constants/helpContent.ts")).toContain(
      "CLEANER_PAYOUT_HELP_COPY",
    );
  });

  it("public cleaner recruitment no longer claims weekly pay", () => {
    const content = readRepo("apps/web/lib/cleaner/applyPageContent.ts");
    const seo = readRepo("apps/web/lib/seo/cleanerApplyLandingSeo.ts");

    expect(content).toContain("CLEANER_PAYOUT_RECRUITMENT_COPY");
    expect(content).not.toContain("get paid every week");
    expect(seo).toContain("CLEANER_PAYOUT_RECRUITMENT_SEO_PHRASE");
  });
});
