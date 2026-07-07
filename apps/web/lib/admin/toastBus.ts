import { showToast } from "@/components/ui/notifications";
import type { ToastKind } from "@/components/ui/notifications";

export type AdminToastKind = "success" | "error" | "info";

export type AdminToastDetail = { message: string; kind: AdminToastKind };

/** @deprecated Toast rendering is handled globally by NotificationProvider. */
export function emitAdminToast(message: string, kind: AdminToastKind = "info"): void {
  showToast(message, kind as ToastKind);
}

/** @deprecated No-op — subscribe via global toast bus in NotificationProvider. */
export function subscribeAdminToast(_handler: (d: AdminToastDetail) => void): () => void {
  return () => {};
}
