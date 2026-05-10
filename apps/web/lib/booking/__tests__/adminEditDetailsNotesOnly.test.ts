import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  isAdminEditBookingDetailsNotesOnlyBody,
  mergeSnapshotAdminNotes,
  type AdminEditBookingDetailsBody,
} from "@/lib/booking/adminEditBookingDetails";

describe("admin edit-details notes-only slice", () => {
  const libPath = join(process.cwd(), "lib/booking/adminEditBookingDetails.ts");

  it("isAdminEditBookingDetailsNotesOnlyBody matches notes without pricing fields", () => {
    const base: AdminEditBookingDetailsBody = { client_updated_at: "t" };
    expect(isAdminEditBookingDetailsNotesOnlyBody({ ...base, notes: "hello" })).toBe(true);
    expect(isAdminEditBookingDetailsNotesOnlyBody({ ...base, notes: "x", bedrooms: 2 })).toBe(false);
    expect(isAdminEditBookingDetailsNotesOnlyBody({ ...base, notes: "x", bathrooms: 1 })).toBe(false);
    expect(isAdminEditBookingDetailsNotesOnlyBody({ ...base, notes: "x", extras: ["a"] })).toBe(false);
    expect(isAdminEditBookingDetailsNotesOnlyBody({ ...base, bedrooms: 2 })).toBe(false);
  });

  it("mergeSnapshotAdminNotes preserves existing snapshot keys", () => {
    const snap = { locked: { service: "standard" }, other: 1 };
    const out = mergeSnapshotAdminNotes(snap, "ops note") as Record<string, unknown>;
    expect(out.locked).toEqual(snap.locked);
    expect(out.other).toBe(1);
    expect(out.admin_notes).toBe("ops note");
  });

  it("mergeSnapshotAdminNotes uses admin_notes-only object for invalid snapshot (edge case)", () => {
    const out = mergeSnapshotAdminNotes(null, "n") as Record<string, unknown>;
    expect(out).toEqual({ admin_notes: "n" });
  });

  it("executeNotesOnlyAdminEditBookingDetails omits repricing, earnings, dispatch dedupe, booking_changes", () => {
    const src = readFileSync(libPath, "utf8");
    const start = src.indexOf("async function executeNotesOnlyAdminEditBookingDetails");
    expect(start).toBeGreaterThan(-1);
    const end = src.indexOf("async function executeRepricingAdminEditBookingDetails", start);
    expect(end).toBeGreaterThan(start);
    const slice = src.slice(start, end);
    expect(slice).not.toContain("replace_booking_line_items_atomic");
    expect(slice).not.toContain("resetBookingCleanerLineEarnings");
    expect(slice).not.toContain("persistCleanerPayoutIfUnset");
    expect(slice).not.toContain("tryClaimNotificationDedupe");
    expect(slice).not.toMatch(/\.from\(\s*["']booking_changes["']\s*\)/);
    expect(slice).not.toContain("routeBookingNotificationEvent");
  });

  it("bookingOperations adminUpdateBookingNotes delegates without notification router", () => {
    const src = readFileSync(join(process.cwd(), "lib/booking/bookingOperations.ts"), "utf8");
    expect(src).toMatch(/export async function adminUpdateBookingNotes[\s\S]*?return adminEditBookingDetailsNotesOnly\(/);
    const notesIdx = src.indexOf("export async function adminUpdateBookingNotes");
    const nextFn = src.indexOf("\nexport async function ", notesIdx + 1);
    const block = nextFn === -1 ? src.slice(notesIdx) : src.slice(notesIdx, nextFn);
    expect(block).not.toContain("routeBookingNotificationEvent");
  });
});
