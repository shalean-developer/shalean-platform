import { describe, expect, it } from "vitest";
import { ownsDocumentRow } from "@/lib/customer/documentOwnership";

describe("ownsDocumentRow", () => {
  const viewerId = "11111111-1111-4111-8111-111111111111";
  const otherId = "22222222-2222-4222-8222-222222222222";
  const viewer = { id: viewerId, email: "me@example.com" };

  it("allows when owner id matches viewer", () => {
    expect(ownsDocumentRow({ ownerId: viewerId, ownerEmail: "other@x.com" }, viewer)).toBe(true);
  });

  it("denies when owner id belongs to another account even if email matches", () => {
    expect(
      ownsDocumentRow({ ownerId: otherId, ownerEmail: "me@example.com" }, viewer),
    ).toBe(false);
  });

  it("allows orphan row when owner id unset and email matches viewer", () => {
    expect(
      ownsDocumentRow({ ownerId: null, ownerEmail: "Me@Example.com" }, viewer),
    ).toBe(true);
  });

  it("denies orphan row when email does not match viewer", () => {
    expect(
      ownsDocumentRow({ ownerId: null, ownerEmail: "you@example.com" }, viewer),
    ).toBe(false);
  });
});
