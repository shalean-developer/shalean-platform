"use client";

import type { ReactNode } from "react";
import { ConfirmDialogHost } from "./confirm-dialog";
import { PromptDialogHost } from "./prompt-dialog";
import { ToastHost } from "./toast";

export function NotificationProvider({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
      <ToastHost />
      <ConfirmDialogHost />
      <PromptDialogHost />
    </>
  );
}
