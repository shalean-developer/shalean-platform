/** Calendar math on `YYYY-MM-DD` strings (local date parts, not UTC). */
export function addDaysToYmd(dateYmd: string, days: number): string {
  const [y, m, d] = dateYmd.split("-").map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return dateYmd;
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

/** Start of wall-clock moment in Johannesburg (+02:00) as ISO UTC. */
export function johannesburgNineAmIso(dateYmd: string): string {
  const wall = `${dateYmd.trim()}T09:00:00+02:00`;
  const ms = Date.parse(wall);
  if (!Number.isFinite(ms)) return new Date().toISOString();
  return new Date(ms).toISOString();
}
