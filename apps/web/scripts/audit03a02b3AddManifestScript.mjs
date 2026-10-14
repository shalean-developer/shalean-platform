import { readFileSync, writeFileSync } from "node:fs";
const file = process.argv[2];
if (!file || !file.endsWith("/package.json")) throw new Error("Staging package manifest required");
const pkg = JSON.parse(readFileSync(file,"utf8"));
pkg.scripts = {...pkg.scripts, "audit:03a02b3:env-presence":"node private-audit/audit03a02b2PleskEnvPreflight.mjs"};
writeFileSync(file, JSON.stringify(pkg,null,2)+"\n");
