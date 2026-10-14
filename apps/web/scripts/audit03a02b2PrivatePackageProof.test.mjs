import { test } from "node:test";
import assert from "node:assert/strict";
import { verifyPrivateArtifact } from "./audit03a02b2PrivatePackageProof.mjs";
import { readFileSync } from "node:fs";

const good = {deployment_environment:"staging",target_host:"pricing-test.shalean.co.za",supabase_ref:"uwvnmluiqbczeduzjgse",server_secrets_baked_in:false,artifact_sha:"a".repeat(40)};
test("staging-only private artifact proof has zero external calls or writes",()=>{
 const report=verifyPrivateArtifact(good,"private",{SHALEAN_APP_ENV:"staging"});
 assert.equal(report.external_requests,0);
 assert.equal(report.financial_writes,0);
 assert.equal(report.live_zoho_audit,false);
});
test("rejects prod metadata, nonprivate execution and embedded secrets",()=>{
 for(const changed of [{deployment_environment:"production"},{supabase_ref:"paqjwfulwywtsyyvdxrq"},{server_secrets_baked_in:true},{artifact_sha:"invalid"}])
  assert.throws(()=>verifyPrivateArtifact({...good,...changed},"private",{}));
 assert.throws(()=>verifyPrivateArtifact(good,"public",{}));
 assert.throws(()=>verifyPrivateArtifact(good,"private",{SHALEAN_APP_ENV:"production"}));
});
test("staging workflow packages proof outside public and never starts it",()=>{
 const source=readFileSync(new URL("../../../.github/workflows/prebuilt-plesk-staging.yml",import.meta.url),"utf8");
 assert.match(source,/install -m 0600 apps\/web\/scripts\/audit03a02b2PrivatePackageProof\.mjs "\$STAGE\/private-audit\//);
 assert.match(source,/test ! -e "\$STAGE\/public\/private-audit\/audit03a02b2PrivatePackageProof\.mjs"/);
 assert.doesNotMatch(source,/node "\$STAGE\/private-audit\/audit03a02b2PrivatePackageProof\.mjs"/);
});
