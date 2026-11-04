import { test } from "vitest";
import { strict as assert } from "node:assert";
import { decideMarketingEligibility, type MarketingEligibilityEvidence } from "../marketingEligibility";
const valid = (): MarketingEligibilityEvidence => ({
 recipientValid: true, customerIdentityVerified: true, consent: "granted",
 crmUnsubscribed: false, locallySuppressed: false, providerStateFresh: true,
 providerUnsubscribed: false, providerSuppressed: false,
});
test("explicit consent and verified clean preferences permit marketing", () => {
 assert.deepEqual(decideMarketingEligibility(valid()), { allowed: true });
});
for (const consent of ["unknown", "denied", "error"] as const) {
 test("blocks consent state "+consent, () => assert.equal(decideMarketingEligibility({...valid(), consent}).allowed, false));
}
for (const field of ["recipientValid","customerIdentityVerified","providerStateFresh"] as const) {
 test("blocks missing "+field, () => assert.equal(decideMarketingEligibility({...valid(),[field]:false}).allowed,false));
}
for (const field of ["crmUnsubscribed","locallySuppressed","providerUnsubscribed","providerSuppressed"] as const) {
 test("blocks positive "+field, () => assert.equal(decideMarketingEligibility({...valid(),[field]:true}).allowed,false));
 test("blocks unknown "+field, () => assert.equal(decideMarketingEligibility({...valid(),[field]:null}).allowed,false));
}
