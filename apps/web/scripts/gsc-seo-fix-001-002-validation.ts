/**
 * SEO-FIX-001/002 — authorized GSC validation CLI (scoped).
 *
 * Prefer invoking via the authenticated Production cron:
 *   POST /api/cron/gsc-seo-fix-001-002-validate
 * with Bearer CRON_SECRET + confirm phrase (uses Vercel Production GSC_* in-place).
 *
 * Local/one-shot with Production env pulled into gitignored .env.local:
 *   cd apps/web
 *   # vercel env pull .env.local --environment=production   (do not commit)
 *   npm run gsc:seo-fix-001-002-validate -- --confirm=SEO-FIX-001/002-GSC-ONLY
 *
 * Modes:
 *   --mode=validate       inspect ×5 + conditional sitemap submit once
 *   --mode=inspect-only   inspect ×5 only (weekly)
 *
 * Never logs GSC_PRIVATE_KEY / raw GSC_CLIENT_EMAIL.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  runSeoFix001002Validation,
  type SeoFix001002Mode,
  SEO_FIX_001_002_CONFIRM_PHRASE,
} from "@/lib/gsc/seo-fix-001-002-validation";

function parseArgs(argv: string[]): { mode: SeoFix001002Mode; confirm: string | null } {
  let mode: SeoFix001002Mode = "validate";
  let confirm: string | null = process.env.SEO_FIX_001_002_CONFIRM?.trim() || null;

  for (const arg of argv) {
    if (arg.startsWith("--mode=")) {
      const v = arg.slice("--mode=".length);
      if (v === "validate" || v === "inspect-only") mode = v;
      else throw new Error(`Invalid --mode=${v} (expected validate|inspect-only)`);
    } else if (arg.startsWith("--confirm=")) {
      confirm = arg.slice("--confirm=".length);
    } else if (arg === "--confirm") {
      // next token handled below if needed — prefer --confirm=
    }
  }

  const confirmIdx = argv.indexOf("--confirm");
  if (confirmIdx >= 0 && argv[confirmIdx + 1] && !argv[confirmIdx + 1]!.startsWith("--")) {
    confirm = argv[confirmIdx + 1]!;
  }

  return { mode, confirm };
}

async function main() {
  const { mode, confirm } = parseArgs(process.argv.slice(2));
  if (!confirm) {
    console.error(
      `Missing confirmation. Pass --confirm=${SEO_FIX_001_002_CONFIRM_PHRASE}`,
    );
    process.exit(2);
  }

  const evidence = await runSeoFix001002Validation({
    mode,
    confirmPhrase: confirm,
  });

  const outDir = path.join(process.cwd(), "tmp");
  mkdirSync(outDir, { recursive: true });
  const stamp = evidence.authorizedAt.replace(/[:.]/g, "-");
  const jsonPath = path.join(outDir, `gsc-seo-fix-001-002-validation-${stamp}.json`);
  writeFileSync(jsonPath, JSON.stringify(evidence, null, 2));
  console.log(`[evidence] wrote ${jsonPath}`);
  console.log(`[evidence] secretsLogged=${evidence.secretsLogged}`);
  console.log(
    `[evidence] sitemapDecision=${evidence.sitemap?.action ?? "n/a"} requestIndexingUiRequired=${evidence.requestIndexingUiRequired}`,
  );

  if (evidence.errors.length > 0) {
    console.error(`[done] completed with ${evidence.errors.length} error(s)`);
    process.exit(1);
  }
  console.log(`[done] SEO-FIX-001/002 GSC ${mode} succeeded`);
}

main().catch((err) => {
  const msg = err instanceof Error ? err.message : String(err);
  // Never dump credential material if a library error embeds it.
  console.error(msg.replace(/BEGIN PRIVATE KEY[\s\S]*?END PRIVATE KEY/g, "[REDACTED_KEY]"));
  process.exit(1);
});
