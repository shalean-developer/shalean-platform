/** Routes that use the minimal auth shell (no marketing header/footer). */
export function isAuthShellRoute(pathname: string): boolean {
  const path = pathname.trim() || "/";
  if (path === "/login" || path.startsWith("/login/")) return true;
  if (path === "/signup" || path.startsWith("/signup/")) return true;
  if (path === "/auth" || path.startsWith("/auth/")) return true;
  if (path === "/admin/login") return true;
  if (path === "/cleaner/login") return true;
  if (path === "/complete-profile") return true;
  return false;
}
