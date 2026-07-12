import { AppErrorBoundary as SharedErrorBoundary } from "@shalean/mobile-ui";
import type { ErrorInfo, ReactNode } from "react";
import { captureAppException } from "@/lib/monitoring/crashReporting";

type Props = { children: ReactNode; onReset?: () => void };

function logError(error: Error, info: ErrorInfo) {
  captureAppException(error, {
    componentStack: info.componentStack?.slice(0, 500) ?? null,
  });
}

/** Customer error boundary — shared UI + Sentry when DSN configured. */
export function AppErrorBoundary({ children, onReset }: Props) {
  return (
    <SharedErrorBoundary onReset={onReset} onError={logError}>
      {children}
    </SharedErrorBoundary>
  );
}
