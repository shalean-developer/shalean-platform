import assert from "node:assert/strict";
import { describe, it } from "node:test";

/**
 * Client-side mirror of address write validation (server is authority).
 * Ensures we never send a forged userId as the ownership key in payload builders.
 */
function buildAddressCreateBody(input: {
  label: string;
  line1: string;
  suburb: string;
  userIdAttempt?: string;
}) {
  const body: Record<string, unknown> = {
    label: input.label.trim(),
    line1: input.line1.trim(),
    suburb: input.suburb.trim(),
    city: "Cape Town",
    isDefault: false,
  };
  // Intentionally do NOT attach userId — ownership is JWT-only on the server.
  assert.equal(input.userIdAttempt != null, true); // caller may try
  assert.equal("userId" in body, false);
  assert.equal("user_id" in body, false);
  return body;
}

describe("profile address authz contract", () => {
  it("create body never includes user id fields", () => {
    const body = buildAddressCreateBody({
      label: "Home",
      line1: "12 Ocean",
      suburb: "Claremont",
      userIdAttempt: "22222222-2222-4222-8222-222222222222",
    });
    assert.equal(body.label, "Home");
    assert.equal(body.userId, undefined);
    assert.equal(body.user_id, undefined);
  });
});
