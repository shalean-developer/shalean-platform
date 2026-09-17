import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  join(process.cwd(), "src/features/booking-v2/components/BookingV2SummaryPanel.tsx"),
  "utf8",
);

describe("compact booking summary panel", () => {
  it("groups primary booking information into concise editable rows", () => {
    expect(source).toContain('label="Service"');
    expect(source).toContain('label="Address"');
    expect(source).toContain('label="Schedule"');
    expect(source).toContain('label="Cleaners"');
    expect(source).toContain('label="Home"');
    expect(source).not.toContain('label="Property"');
    expect(source).not.toContain('label="Rooms"');
  });

  it("keeps secondary details collapsed by default", () => {
    expect(source).toContain("const [moreDetailsOpen, setMoreDetailsOpen] = useState(false)");
    expect(source).toContain("<span>More details</span>");
    expect(source).toContain("{moreDetailsOpen ? (");
    expect(source).toContain('label="Pets & supplies"');
  });

  it("shows the exact first-30-day package as due today for recurring bookings", () => {
    expect(source).toContain("const recurringPrepayment =");
    expect(source).toContain("recurringPrepayment.grossPackageZar");
    expect(source).toContain("Pay all visits now");
    expect(source).toContain('recurringPrepayment ? "Due today" : "Est. price"');
    expect(source).not.toContain('values.bookingType === "recurring" ? "Price per visit"');
  });
});
