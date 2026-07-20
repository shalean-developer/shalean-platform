/**
 * PR-build route matrix — probes proposed app (localhost / preview), not production.
 *
 * Verifies:
 * - exact build SHA (via /ci-build-sha.txt when present)
 * - ten short location URLs → 308 → /locations → 200 (no loops)
 * - homepage does not emit those short-slug hrefs (canonical linking)
 * - privacy / data-deletion / terms / Meta callback behaviour
 *
 * `npm run validate:pr-build-routes`
 * Requires AUDIT_BASE_URL (e.g. http://127.0.0.1:3000).
 */

import { createHmac } from "node:crypto";
import {
  extractSameOriginLinks,
  fetchWithNoRedirect,
  resolveAuditBaseUrl,
} from "@/lib/seo/liveSeoCrawl";

const SHORT_LOCATION_SLUGS = [
  "beacon-hill",
  "big-bay",
  "bonnie-brook",
  "maitland",
  "noordhoek",
  "muizenberg",
  "melkbosstrand",
  "sun-valley",
  "zevenwacht",
  "ysterplaat",
] as const;

const baseEnv = resolveAuditBaseUrl(process.env.AUDIT_BASE_URL);
const expectedSha = process.env.EXPECTED_GIT_SHA?.trim() || "";
const metaSecret =
  process.env.FACEBOOK_APP_SECRET?.trim() || process.env.META_APP_SECRET?.trim() || "";

type Hop = { url: string; status: number; location: string | null };

function encodeMetaBase64Url(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function makeSignedRequest(payload: object, secret: string): string {
  const encodedPayload = encodeMetaBase64Url(Buffer.from(JSON.stringify(payload), "utf8"));
  const sig = createHmac("sha256", secret).update(encodedPayload).digest();
  return `${encodeMetaBase64Url(sig)}.${encodedPayload}`;
}

async function followRedirects(startPath: string, maxHops = 5): Promise<{ hops: Hop[]; final: Hop }> {
  const hops: Hop[] = [];
  let url = startPath.startsWith("http") ? startPath : `${baseEnv}${startPath}`;
  for (let i = 0; i < maxHops; i++) {
    const res = await fetchWithNoRedirect(url);
    const hop: Hop = { url, status: res.status, location: res.location };
    hops.push(hop);
    if (res.status !== 301 && res.status !== 302 && res.status !== 307 && res.status !== 308) {
      return { hops, final: hop };
    }
    if (!res.location) {
      return { hops, final: hop };
    }
    url = new URL(res.location, url).toString();
  }
  throw new Error(`redirect_loop_or_too_many_hops:${startPath}`);
}

function pathOnly(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname.replace(/\/+$/, "") || "/";
  } catch {
    return url;
  }
}

async function main(): Promise<void> {
  const failures: string[] = [];
  console.log(`[validate-pr-build-routes] Base ${baseEnv}`);
  if (expectedSha) console.log(`[validate-pr-build-routes] EXPECTED_GIT_SHA ${expectedSha}`);

  // --- Build SHA proof ---
  const shaRes = await fetchWithNoRedirect(`${baseEnv}/ci-build-sha.txt`);
  if (expectedSha) {
    if (shaRes.status !== 200) {
      failures.push(`/ci-build-sha.txt → HTTP ${shaRes.status} (required when EXPECTED_GIT_SHA is set)`);
    } else {
      const served = shaRes.body.trim();
      console.log(`[validate-pr-build-routes] served SHA ${served}`);
      if (served !== expectedSha) {
        failures.push(`build SHA mismatch: served=${served} expected=${expectedSha}`);
      } else {
        console.log("[validate-pr-build-routes] OK — served build SHA equals PR head");
      }
    }
  } else if (shaRes.status === 200) {
    console.log(`[validate-pr-build-routes] served SHA ${shaRes.body.trim()} (EXPECTED_GIT_SHA unset)`);
  }

  // --- Ten short location URLs ---
  console.log("\n[locations] short-slug redirect matrix");
  for (const slug of SHORT_LOCATION_SLUGS) {
    const path = `/locations/${slug}`;
    try {
      const { hops, final } = await followRedirects(path);
      const initial = hops[0]!;
      const redirectTarget = initial.location ? pathOnly(new URL(initial.location, initial.url).toString()) : null;
      const okInitial = initial.status === 308;
      const okTarget = redirectTarget === "/locations";
      const okFinal = final.status === 200 && pathOnly(final.url) === "/locations";
      const loop = hops.length > 3;
      console.log(
        `  ${path} → initial=${initial.status} location=${redirectTarget ?? "—"} final=${final.status} canonical=${pathOnly(final.url)} hops=${hops.length}`,
      );
      if (!okInitial) failures.push(`${path}: expected initial 308, got ${initial.status}`);
      if (!okTarget) failures.push(`${path}: expected redirect to /locations, got ${redirectTarget}`);
      if (!okFinal) failures.push(`${path}: expected final 200 /locations, got ${final.status} ${pathOnly(final.url)}`);
      if (loop) failures.push(`${path}: too many hops (possible loop)`);
    } catch (err) {
      failures.push(`${path}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // --- Homepage linking ---
  console.log("\n[homepage] short-slug href hygiene");
  const home = await fetchWithNoRedirect(`${baseEnv}/`);
  if (home.status !== 200) {
    failures.push(`seed / → HTTP ${home.status} (cannot verify homepage links)`);
  } else {
    const links = extractSameOriginLinks(home.body, `${baseEnv}/`);
    const shortLinked = SHORT_LOCATION_SLUGS.filter((slug) =>
      links.some((l) => pathOnly(l) === `/locations/${slug}`),
    );
    if (shortLinked.length) {
      failures.push(
        `homepage still links short location URLs (prefer canonical): ${shortLinked.map((s) => `/locations/${s}`).join(", ")}`,
      );
    } else {
      console.log("  OK — homepage does not emit the ten short /locations/{slug} hrefs");
    }
    const hubLinked = links.some((l) => /\/locations\/.+-cleaning-services$/.test(pathOnly(l)));
    if (!hubLinked) {
      failures.push("homepage missing expected /locations/{hub}-cleaning-services catalogue links");
    } else {
      console.log("  OK — homepage includes catalogue hub links");
    }
  }

  // --- Compliance routes ---
  console.log("\n[compliance] privacy / data-deletion / terms");
  const privacy = await followRedirects("/privacy");
  console.log(
    `  /privacy → initial=${privacy.hops[0]?.status} → final=${privacy.final.status} ${pathOnly(privacy.final.url)}`,
  );
  if (privacy.hops[0]?.status !== 308 && privacy.hops[0]?.status !== 301) {
    failures.push(`/privacy: expected permanent redirect (308/301), got ${privacy.hops[0]?.status}`);
  }
  if (pathOnly(privacy.final.url) !== "/privacy-policy" || privacy.final.status !== 200) {
    failures.push(`/privacy: expected final 200 /privacy-policy`);
  }

  for (const path of ["/privacy-policy", "/data-deletion", "/terms-of-service"] as const) {
    const res = await fetchWithNoRedirect(`${baseEnv}${path}`);
    console.log(`  ${path} → ${res.status}`);
    if (res.status !== 200) failures.push(`${path}: expected 200, got ${res.status}`);
  }

  const statusEmpty = await fetchWithNoRedirect(`${baseEnv}/data-deletion/status`);
  console.log(`  /data-deletion/status → ${statusEmpty.status}`);
  if (statusEmpty.status !== 200) failures.push(`/data-deletion/status: expected 200, got ${statusEmpty.status}`);
  if (statusEmpty.status === 200 && !/confirmation code|data deletion/i.test(statusEmpty.body)) {
    failures.push(`/data-deletion/status: missing expected instructional copy`);
  }

  const instructions = await fetchWithNoRedirect(`${baseEnv}/data-deletion`);
  if (instructions.status === 200 && !/acknowledg/i.test(instructions.body)) {
    failures.push(`/data-deletion: missing acknowledgement-vs-completion distinction`);
  }
  if (instructions.status === 200 && !/publishing history/i.test(instructions.body)) {
    failures.push(`/data-deletion: missing publishing-history scope clarification`);
  }
  if (
    instructions.status === 200 &&
    /automatically deleted all|auto-wipe customer/i.test(instructions.body)
  ) {
    failures.push(`/data-deletion: must not claim automatic customer wipe`);
  }

  const privacyPage = await fetchWithNoRedirect(`${baseEnv}/privacy-policy`);
  if (privacyPage.status === 200 && !/Information Regulator/i.test(privacyPage.body)) {
    failures.push(`/privacy-policy: missing Information Regulator reference`);
  }
  if (privacyPage.status === 200 && !/social/i.test(privacyPage.body)) {
    failures.push(`/privacy-policy: missing social-integration disclosure`);
  }

  // --- Meta callback against running server ---
  console.log("\n[compliance] POST /api/meta/data-deletion");
  if (!metaSecret) {
    failures.push("FACEBOOK_APP_SECRET (or META_APP_SECRET) required to exercise Meta callback against PR build");
  } else {
    const bad = await fetch(`${baseEnv}/api/meta/data-deletion`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ signed_request: "not.valid" }),
      redirect: "manual",
    });
    console.log(`  invalid signed_request → ${bad.status}`);
    if (bad.status !== 400) failures.push(`invalid signed_request: expected 400, got ${bad.status}`);

    const userId = "meta-ci-user-999";
    const signed = makeSignedRequest({ algorithm: "HMAC-SHA256", user_id: userId, issued_at: 1 }, metaSecret);
    const good = await fetch(`${baseEnv}/api/meta/data-deletion`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ signed_request: signed }),
      redirect: "manual",
    });
    const goodText = await good.text();
    console.log(`  valid signed_request → ${good.status}`);
    if (good.status !== 200) {
      failures.push(`valid signed_request: expected 200, got ${good.status} body=${goodText.slice(0, 200)}`);
    } else {
      let json: { url?: string; confirmation_code?: string };
      try {
        json = JSON.parse(goodText) as { url?: string; confirmation_code?: string };
      } catch {
        failures.push(`valid callback: response is not JSON`);
        json = {};
      }
      if (!json.url || !json.confirmation_code) {
        failures.push(`valid callback: missing url/confirmation_code (Meta required shape)`);
      } else {
        if (!json.url.includes("/data-deletion/status")) {
          failures.push(`valid callback: url must point at status page, got ${json.url}`);
        }
        if (goodText.includes(userId)) {
          failures.push(`valid callback: response must not contain Meta user_id (PII)`);
        }
        const statusUrl = json.url.startsWith("http")
          ? json.url.replace(/^https?:\/\/[^/]+/i, baseEnv)
          : `${baseEnv}${json.url.startsWith("/") ? json.url : `/${json.url}`}`;
        // Prefer following confirmation on same host under test
        const localStatus = `${baseEnv}/data-deletion/status?code=${encodeURIComponent(json.confirmation_code)}`;
        const st = await fetchWithNoRedirect(localStatus);
        console.log(`  status page with code → ${st.status} (ack url host may be canonical)`);
        if (st.status !== 200) failures.push(`status with confirmation code: expected 200, got ${st.status}`);
        if (st.status === 200 && !/acknowledged|Request acknowledged/i.test(st.body)) {
          failures.push(`status with code: expected acknowledged copy`);
        }
        if (st.status === 200 && /automatically deleted|auto-wipe|permanently erased all booking/i.test(st.body)) {
          failures.push(`status copy must not claim automatic customer/business deletion`);
        }
        void statusUrl;
      }
    }
  }

  if (failures.length) {
    console.error(`\n[validate-pr-build-routes] FAILED (${failures.length})\n`);
    for (const f of failures) console.error(`  ${f}`);
    process.exit(1);
  }

  console.log("\n[validate-pr-build-routes] OK");
}

void main();

export {};
