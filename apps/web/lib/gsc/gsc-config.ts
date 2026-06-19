export type GscCredentials = {
  clientEmail: string;
  privateKey: string;
  siteUrl: string;
};

export type GscDateRange = {
  startDate: string;
  endDate: string;
};

export type GscPagePerformanceRow = {
  pageUrl: string;
  clicks: number;
  impressions: number;
  ctr: number;
  avgPosition: number | null;
};

export function normalizeGscPrivateKey(raw: string): string {
  return raw.replace(/\\n/g, "\n");
}

export function readGscSyncDays(): number {
  const raw = process.env.GSC_SYNC_DAYS?.trim();
  const n = raw ? Number(raw) : 90;
  if (!Number.isFinite(n) || n < 1) return 90;
  return Math.min(Math.floor(n), 500);
}

/** GSC reporting lags — end on yesterday UTC, start `days` window inclusive. */
export function buildGscDateRange(days: number, now = new Date()): GscDateRange {
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  end.setUTCDate(end.getUTCDate() - 1);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - (days - 1));
  return { startDate: formatGscYmd(start), endDate: formatGscYmd(end) };
}

export function formatGscYmd(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function readGscCredentials(): GscCredentials | null {
  const clientEmail = process.env.GSC_CLIENT_EMAIL?.trim();
  const privateKeyRaw = process.env.GSC_PRIVATE_KEY?.trim();
  const siteUrl = process.env.GSC_SITE_URL?.trim();
  if (!clientEmail || !privateKeyRaw || !siteUrl) return null;
  return {
    clientEmail,
    privateKey: normalizeGscPrivateKey(privateKeyRaw),
    siteUrl,
  };
}

export function describeGscConfigError(err: unknown, siteUrl: string): string {
  const msg = err instanceof Error ? err.message : String(err);
  const lower = msg.toLowerCase();

  if (lower.includes("invalid_grant") || lower.includes("decrypt") || lower.includes("no key")) {
    return "Invalid GSC_PRIVATE_KEY — check the key format and escaped newlines (\\n).";
  }
  if (
    lower.includes("permission") ||
    lower.includes("forbidden") ||
    lower.includes("not a verified owner") ||
    lower.includes("insufficient permission")
  ) {
    return `GSC permission denied for ${siteUrl}. Add the service account email to Search Console with Full access.`;
  }
  if (lower.includes("not found") || lower.includes("404") || lower.includes("site")) {
    return `GSC property not found for GSC_SITE_URL=${siteUrl}. Use the exact property string (e.g. sc-domain:shalean.co.za or https://shalean.co.za/).`;
  }
  return msg;
}
