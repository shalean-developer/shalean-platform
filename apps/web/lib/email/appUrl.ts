/** Site origin for email links. No trailing slash. */
export function getPublicAppUrlBase(): string {
  const raw = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (!raw) return "http://localhost:3000";
  return raw.replace(/\/+$/, "");
}
