/**
 * CF-02: non-production Shalean deployments must never mutate Zoho Books.
 * Protect both live Shalean and FaraiOS test organisations.
 * Missing or unrecognised environment identity also fails closed.
 */
export function isZohoBooksWriteBlocked(appEnvironment: string | undefined): boolean {
  const identity = appEnvironment?.trim().toLowerCase();
  return identity !== "production" && identity !== "prod";
}
