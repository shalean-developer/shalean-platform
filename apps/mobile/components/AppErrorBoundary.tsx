import type { ErrorInfo, ReactNode } from "react";
import { AppErrorBoundary as SharedErrorBoundary } from "@shalean/mobile-ui";
import { diagnosticLog } from "@/lib/diagnostics/logger";

type Props = { children: ReactNode; onReset?: () => void };

function logError(error: Error, info: ErrorInfo) {
  diagnosticLog.error("Unhandled UI error", {
    message: error.message,
    componentStack: info.componentStack?.slice(0, 500),
  });
}

/** Cleaner error boundary — shared UI + local diagnostics logging. */
export function AppErrorBoundary({ children, onReset }: Props) {
  return (
    <SharedErrorBoundary onReset={onReset} onError={logError}>
      {children}
    </SharedErrorBoundary>
  );
}
