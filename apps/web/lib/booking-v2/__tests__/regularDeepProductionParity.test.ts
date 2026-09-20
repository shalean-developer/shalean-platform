import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function source(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

const detailsSource = source("src/features/booking-v2/steps/Step1Details.tsx");
const scheduleSource = source("src/features/booking-v2/steps/Step2Schedule.tsx");
const summarySource = source("src/features/booking-v2/components/BookingV2SummaryPanel.tsx");
const teamAvailabilitySource = source(
  "src/features/booking-v2/components/TeamAvailabilitySection.tsx",
);

describe("Regular and Deep production parity while Moving stays isolated", () => {
  it("keeps property type visible with rooms for Regular and Deep only", () => {
    expect(detailsSource).toContain(
      'return isMovingCleaning\n        ? activeDetailsStage === "property"\n        : activeDetailsStage === "property" || activeDetailsStage === "rooms";',
    );
  });

  it("limits date-change team clearing to Moving Cleaning", () => {
    expect(scheduleSource).toContain(
      'if (isMovingCleaning && nextDate !== field.value) {',
    );
    expect(scheduleSource).not.toContain(
      'if (isTeamMode && nextDate !== field.value) {',
    );
  });

  it("preserves Deep team-selection auto-advance and Moving explicit continuation", () => {
    expect(scheduleSource).toContain(
      'if (isDeepCleaning) {\n                void goNext();\n              }',
    );
    expect(scheduleSource).toContain('{isMovingCleaning && isTeamMode ? (');
    expect(scheduleSource).toContain("Continue to Review →");
  });

  it("keeps stricter summary completion rules Moving-only", () => {
    expect(summarySource).toContain(
      'const extraRooms = isMovingCleaning',
    );
    expect(summarySource).toContain(
      'isMovingCleaning\n      ? Boolean(propertyLabel)',
    );
    expect(summarySource).toContain(
      'isMovingCleaning\n      ? roomsComplete',
    );
  });

  it("keeps Deep team availability on the production request path", () => {
    expect(teamAvailabilitySource).toContain(
      'if (serviceSlug !== "moving-cleaning") {',
    );
    expect(teamAvailabilitySource).toContain(
      'fetch(\`/api/booking-v2/team-availability?date=\${date}&service=\${serviceSlug}\`)',
    );
    expect(teamAvailabilitySource).toContain('cache: "no-store"');
  });
});
