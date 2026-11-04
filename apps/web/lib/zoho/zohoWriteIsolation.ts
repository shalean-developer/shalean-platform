/**
 * CF-02: Shalean nonproduction environments must not mutate any Zoho Books
 * organisation. This includes live Shalean and FaraiOS TEST organisations.
 *
 * Deliberately no override key: a missing/unknown app environment fails closed.
 * Only an explicit production identity can use Zoho Books write endpoints.
 */
export function isZohoBooksWriteBlocked(appEnvironment: string | undefined): boolean {
  return appEnvironment?.trim().toLowerCase() !== "production";
}
