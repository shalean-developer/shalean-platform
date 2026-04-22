/**
 * Rewrites supabase/seed/cleaners_seed.sql: NULL emails → {digits}@cleaner.shalean.com
 * (aligns with apps/web/lib/cleaner/cleanerIdentity.ts for NOT NULL email + unique email).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const seedPath = path.join(__dirname, "..", "supabase", "seed", "cleaners_seed.sql");

function cleanerGeneratedLoginEmailFromE164PhoneLiteral(phoneSql) {
  const inner = phoneSql.startsWith("'") && phoneSql.endsWith("'") ? phoneSql.slice(1, -1) : phoneSql;
  let d = inner.replace(/\D/g, "");
  if (!d) return "'cleaner-unknown@cleaner.shalean.com'";
  if (d.startsWith("0")) d = `27${d.slice(1)}`;
  else if (!d.startsWith("27")) d = `27${d}`;
  return `'${d}@cleaner.shalean.com'`;
}

let s = fs.readFileSync(seedPath, "utf8");
const re = /, '(\+[0-9]+)', '(\+[0-9]+)', NULL, '(available|busy|offline)',/g;
s = s.replace(re, (_, p1, p2, st) => {
  const phoneSql = `'${p1}'`;
  const email = cleanerGeneratedLoginEmailFromE164PhoneLiteral(phoneSql);
  return `, '${p1}', '${p2}', ${email}, '${st}',`;
});

fs.writeFileSync(seedPath, s, "utf8");
console.log("Patched", seedPath);
