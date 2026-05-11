import { describe, expect, it } from "vitest";
import { assignmentTruthPatchForOfferAccept } from "@/lib/dispatch/assignmentTruth";

describe("assignmentTruthPatchForOfferAccept", () => {
  const cid = "AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE";

  it("fills assignment_type user_selected when missing and selected_cleaner_id matches", () => {
    expect(
      assignmentTruthPatchForOfferAccept({
        acceptedCleanerId: cid,
        assignmentTypeBefore: null,
        selectedCleanerId: cid,
      }),
    ).toEqual({ assignment_type: "user_selected", fallback_reason: null });
  });

  it("fills assignment_type auto_dispatch when missing and no selected_cleaner_id", () => {
    expect(
      assignmentTruthPatchForOfferAccept({
        acceptedCleanerId: cid,
        assignmentTypeBefore: undefined,
        selectedCleanerId: null,
      }),
    ).toEqual({ assignment_type: "auto_dispatch" });
  });

  it("fills auto_dispatch when selected cleaner differs", () => {
    const other = "BBBBBBBB-BBBB-CCCC-DDDD-EEEEEEEEEEEE";
    expect(
      assignmentTruthPatchForOfferAccept({
        acceptedCleanerId: cid,
        assignmentTypeBefore: null,
        selectedCleanerId: other,
      }),
    ).toEqual({ assignment_type: "auto_dispatch" });
  });

  it("does not overwrite existing assignment_type", () => {
    expect(
      assignmentTruthPatchForOfferAccept({
        acceptedCleanerId: cid,
        assignmentTypeBefore: "user_selected",
        selectedCleanerId: cid,
      }),
    ).toEqual({ fallback_reason: null });
  });

  it("clears fallback_reason when honored cleaner accepts (case-insensitive uuid)", () => {
    expect(
      assignmentTruthPatchForOfferAccept({
        acceptedCleanerId: cid.toLowerCase(),
        assignmentTypeBefore: "user_selected",
        selectedCleanerId: cid.toUpperCase(),
      }),
    ).toEqual({ fallback_reason: null });
  });

  it("does not clear fallback when accepted cleaner is not the selected id", () => {
    const other = "BBBBBBBB-BBBB-CCCC-DDDD-EEEEEEEEEEEE";
    expect(
      assignmentTruthPatchForOfferAccept({
        acceptedCleanerId: cid,
        assignmentTypeBefore: "auto_fallback",
        selectedCleanerId: other,
      }),
    ).toEqual({});
  });
});
