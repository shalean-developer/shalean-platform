import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const wf = readFileSync(new URL("../../../.github/workflows/prebuilt-plesk-staging.yml",import.meta.url),"utf8");
const helper = readFileSync(new URL("./audit03a02b3AddManifestScript.mjs",import.meta.url),"utf8");
test("existing staging private preflight is registered as npm script without auto execution",()=>{
 assert.match(wf,/audit03a02b3AddManifestScript\.mjs "\$STAGE\/package\.json"/);
 assert.match(helper,/\/opt\/plesk\/node\/24\/bin\/node private-audit\/audit03a02b2PleskEnvPreflight\.mjs/);
 assert.doesNotMatch(wf,/npm run audit:03a02b3:env-presence/);
 assert.doesNotMatch(helper,/ZOHO_CLIENT_SECRET|ZOHO_REFRESH_TOKEN|SUPABASE_SERVICE_ROLE_KEY/);
});
