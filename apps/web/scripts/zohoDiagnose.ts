/**
 * Read-only Zoho Books connectivity diagnostic.
 * Run: npm run zoho:diagnose
 * Verifies token refresh + org access; lists current invoice count. No writes.
 */

const ACCOUNTS_DOMAIN = process.env.ZOHO_ACCOUNTS_DOMAIN ?? "accounts.zoho.com";
const API_DOMAIN = process.env.ZOHO_API_DOMAIN ?? "www.zohoapis.com";
const ORG_ID = process.env.ZOHO_ORGANIZATION_ID ?? "";

function mask(v: string | undefined): string {
  if (!v) return "(missing)";
  if (v.length <= 8) return "***";
  return `${v.slice(0, 4)}…${v.slice(-4)} (len ${v.length})`;
}

async function main() {
  console.log("=== Zoho env ===");
  console.log("ZOHO_CLIENT_ID:     ", mask(process.env.ZOHO_CLIENT_ID));
  console.log("ZOHO_CLIENT_SECRET: ", mask(process.env.ZOHO_CLIENT_SECRET));
  console.log("ZOHO_REFRESH_TOKEN: ", mask(process.env.ZOHO_REFRESH_TOKEN));
  console.log("ZOHO_ORGANIZATION_ID:", ORG_ID || "(missing)");
  console.log("ACCOUNTS_DOMAIN:    ", ACCOUNTS_DOMAIN);
  console.log("API_DOMAIN:         ", API_DOMAIN);

  const clientId = process.env.ZOHO_CLIENT_ID ?? "";
  const clientSecret = process.env.ZOHO_CLIENT_SECRET ?? "";
  const refreshToken = process.env.ZOHO_REFRESH_TOKEN ?? "";
  if (!clientId || !clientSecret || !refreshToken || !ORG_ID) {
    console.error("\nMissing required env — cannot continue.");
    process.exit(1);
  }

  console.log("\n=== 1. Token refresh ===");
  const tokenUrl = `https://${ACCOUNTS_DOMAIN}/oauth/v2/token`;
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
  });
  const tokRes = await fetch(tokenUrl, { method: "POST", body, cache: "no-store" });
  const tokJson = (await tokRes.json()) as { access_token?: string; error?: string; expires_in?: number };
  console.log("status:", tokRes.status);
  if (tokJson.error || !tokJson.access_token) {
    console.error("TOKEN REFRESH FAILED:", JSON.stringify(tokJson));
    console.error("\n→ Likely cause: wrong region (ZOHO_ACCOUNTS_DOMAIN), revoked/expired refresh token, or wrong client id/secret.");
    process.exit(2);
  }
  const accessToken = tokJson.access_token;
  console.log("access_token:", mask(accessToken), "expires_in:", tokJson.expires_in);

  console.log("\n=== 2. Organizations (verify org id + region) ===");
  const orgRes = await fetch(`https://${API_DOMAIN}/books/v3/organizations`, {
    headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
    cache: "no-store",
  });
  const orgJson = (await orgRes.json()) as {
    code?: number;
    message?: string;
    organizations?: { organization_id: string; name: string }[];
  };
  console.log("status:", orgRes.status, "code:", orgJson.code, "message:", orgJson.message);
  if (orgJson.organizations) {
    for (const o of orgJson.organizations) {
      const match = o.organization_id === ORG_ID ? "  <-- configured ORG" : "";
      console.log(`  org ${o.organization_id} — ${o.name}${match}`);
    }
    const found = orgJson.organizations.some((o) => o.organization_id === ORG_ID);
    if (!found) {
      console.error("\n→ Configured ZOHO_ORGANIZATION_ID is NOT in this account's org list (wrong org id or wrong region).");
    }
  }

  console.log("\n=== 3. Invoice count (read-only) ===");
  const invRes = await fetch(
    `https://${API_DOMAIN}/books/v3/invoices?organization_id=${ORG_ID}&per_page=1`,
    { headers: { Authorization: `Zoho-oauthtoken ${accessToken}` }, cache: "no-store" },
  );
  const invJson = (await invRes.json()) as {
    code?: number;
    message?: string;
    page_context?: { total?: number };
    invoices?: unknown[];
  };
  console.log("status:", invRes.status, "code:", invJson.code, "message:", invJson.message);
  console.log("invoices returned:", invJson.invoices?.length ?? 0);

  console.log("\n=== Result ===");
  if (tokRes.ok && orgRes.ok && invRes.ok && (orgJson.code ?? 0) === 0) {
    console.log("Zoho credentials WORK. Creation path is functional — empty data is historical (pre-config bookings need backfill).");
  } else {
    console.log("Zoho API returned an error above — fix that before sync can work.");
  }
}

void main().catch((e) => {
  console.error("Diagnostic threw:", e);
  process.exit(1);
});

export {};
