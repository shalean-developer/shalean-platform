import { describe, expect, it } from "vitest";
import {
  adminBookingDispatchAttemptId,
  adminBookingSelectedAtCheckoutId,
} from "@/lib/admin/adminBookingAssignmentLabels";

const sel = "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";
const att = "b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e";
const asg = "c3d4e5f6-a7b8-4c9d-8e1f-2a3b4c5d6e7f";

describe("adminBookingAssignmentLabels", () => {
  it("surfaces checkout selection from selected_cleaner_id", () => {
    expect(adminBookingSelectedAtCheckoutId({ selected_cleaner_id: sel })).toBe(sel.toLowerCase());
  });

  it("hides dispatch attempt when attempted matches checkout selection", () => {
    expect(
      adminBookingDispatchAttemptId({
        selected_cleaner_id: sel,
        attempted_cleaner_id: sel,
        cleaner_id: null,
      }),
    ).toBe(null);
  });

  it("hides dispatch attempt when attempted matches assigned cleaner", () => {
    expect(
      adminBookingDispatchAttemptId({
        selected_cleaner_id: null,
        attempted_cleaner_id: asg,
        cleaner_id: asg,
      }),
    ).toBe(null);
  });

  it("shows dispatch attempt when it differs from both checkout and assigned", () => {
    expect(
      adminBookingDispatchAttemptId({
        selected_cleaner_id: sel,
        attempted_cleaner_id: att,
        cleaner_id: asg,
      }),
    ).toBe(att.toLowerCase());
  });

  it("shows dispatch attempt when checkout empty but attempted differs from assigned", () => {
    expect(
      adminBookingDispatchAttemptId({
        selected_cleaner_id: null,
        attempted_cleaner_id: att,
        cleaner_id: asg,
      }),
    ).toBe(att.toLowerCase());
  });
});
