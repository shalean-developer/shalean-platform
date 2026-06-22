/** Admin console at `/office` and `/office/*` — excludes public SEO paths like `/office-cleaning/sea-point`. */
export function isOfficePortalPath(pathname: string): boolean {
  const path = pathname.replace(/\/+$/, "") || "/";
  return path === "/office" || path.startsWith("/office/");
}
