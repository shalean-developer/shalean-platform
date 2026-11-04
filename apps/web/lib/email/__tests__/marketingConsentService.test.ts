import { test } from "node:test";
import { strict as assert } from "node:assert";
import { MARKETING_POLICY_VERSION } from "../marketingConsentService";
test("consent policy version is fixed, not client-defined", () => {
  assert.equal(MARKETING_POLICY_VERSION, "marketing-email-2026-11-v1");
});
