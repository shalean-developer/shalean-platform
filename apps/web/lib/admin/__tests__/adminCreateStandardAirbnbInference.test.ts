import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(join(process.cwd(), "app/admin/bookings/create/page.tsx"), "utf8");

describe("admin create booking service guards", () => {
  it("does not offer retired quick as an admin-created service", () => {
    const optionsBlock = source.match(/const SERVICE_OPTIONS[\s\S]*?\];/)?.[0] ?? "";
    expect(optionsBlock).toContain('value: "standard"');
    expect(optionsBlock).toContain('value: "airbnb"');
    expect(optionsBlock).not.toContain('"quick"');
  });

  it("does not convert Standard to Airbnb for on-demand customers", () => {
    expect(source).not.toContain('schedule_type === "on_demand" ? "airbnb"');
    expect(source).not.toContain("schedule_type === 'on_demand' ? 'airbnb'");
    expect(source).not.toMatch(/service:\s*[^,\n]*schedule_type[^,\n]*airbnb/);
    expect(source).not.toMatch(/service:\s*[^,\n]*standard[^,\n]*airbnb/);
  });

  it("submits the explicit selected service and sanitizes hydrated draft services", () => {
    expect(source).toContain("service: form.service");
    expect(source.match(/parseBookingServiceId\(o\.service\) \?\?/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
  });
});
