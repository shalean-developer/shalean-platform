import {
  requireAnyAdminPermissionFromRequest,
  requireAdminPermissionFromRequest,
} from "@/lib/admin/requirePermission";

/** Office verification and live RBAC are required even for API calls outside the UI. */
export function requireBlogRead(request: Request) {
  return requireAnyAdminPermissionFromRequest(request, ["content.draft", "content.publish"]);
}

export function blogSavePermission(nextStatus: string, previousStatus?: string): "content.draft" | "content.publish" {
  return nextStatus !== "draft" || (previousStatus != null && previousStatus !== "draft")
    ? "content.publish"
    : "content.draft";
}

export function requireBlogSave(request: Request, nextStatus: string, previousStatus?: string) {
  return requireAdminPermissionFromRequest(request, blogSavePermission(nextStatus, previousStatus));
}
