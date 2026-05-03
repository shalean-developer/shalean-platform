/**
 * Focus the app window and navigate when the user clicks a system notification.
 * Uses `navigate` when provided (SPA); falls back to full navigation if `router` is not ready or throws.
 */
export function wireBrowserNotificationClick(
  notification: Notification,
  href: string,
  navigate?: (href: string) => void,
): void {
  notification.onclick = () => {
    try {
      window.focus();
    } catch {
      /* ignore */
    }
    try {
      if (typeof navigate === "function") {
        navigate(href);
      } else {
        window.location.href = href;
      }
    } catch {
      window.location.href = href;
    }
    try {
      notification.close();
    } catch {
      /* ignore */
    }
  };
}
