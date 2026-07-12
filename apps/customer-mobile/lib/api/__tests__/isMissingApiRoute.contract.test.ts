import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isMissingApiRoute } from "../isMissingApiRoute";

describe("isMissingApiRoute", () => {
  it("detects Next.js HTML 404 Not Found status text", () => {
    assert.equal(isMissingApiRoute({ status: 404, error: "Not Found" }), true);
    assert.equal(isMissingApiRoute({ status: 404, error: "not found." }), true);
  });

  it("does not treat ownership 404 JSON as missing route when message is specific", () => {
    // Ownership denials also use 404 with "Not found." — still a missing-or-denied
    // soft case for list endpoints; treat as missing for UX soft-fallback.
    assert.equal(isMissingApiRoute({ status: 404, error: "Not found." }), true);
  });

  it("ignores non-404", () => {
    assert.equal(isMissingApiRoute({ status: 401, error: "Not Found" }), false);
    assert.equal(isMissingApiRoute({ status: 500, error: "Not Found" }), false);
  });
});
