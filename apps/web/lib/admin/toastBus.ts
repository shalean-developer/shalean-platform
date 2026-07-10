import { showToast } from "@/components/ui/notifications";
import type { ToastKind } from "@/components/ui/notifications";

export type AdminToastKind = "success" | "error" | "info";

export type AdminToastDetail = { message: string; kind: AdminToastKind };

/** @deprecated Toast rendering is handled globally by NotificationProvider. */
export function emitAdminToast(message: string, kind: AdminToastKind = "info"): void {
  // Guard against accidental object payloads like `{ type, message }`.
  if (message && typeof message === "object") {
    const obj = message as { message?: unknown; type?: unknown; kind?: unknown };
    const text = typeof obj.message === "string" ? obj.message : String(obj.message ?? "");
    const k =
      obj.kind === "success" || obj.kind === "error" || obj.kind === "info"
        ? obj.kind
        : obj.type === "success" || obj.type === "error" || obj.type === "info"
          ? obj.type
          : kind;
    showToast(text, k as ToastKind);
    return;
  }
  showToast(String(message ?? ""), kind as ToastKind);
}

/** @deprecated No-op — subscribe via global toast bus in NotificationProvider. */
export function subscribeAdminToast(_handler: (d: AdminToastDetail) => void): () => void {
  return () => {};
}
