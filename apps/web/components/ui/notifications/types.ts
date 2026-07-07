export type ToastKind = "success" | "error" | "info" | "warning";

export type ToastDetail = {
  message: string;
  kind: ToastKind;
};

export type ConfirmVariant = "default" | "destructive";

export type ConfirmOptions = {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: ConfirmVariant;
};

export type PromptOptions = {
  title: string;
  description?: string;
  defaultValue?: string;
  placeholder?: string;
  confirmLabel?: string;
  cancelLabel?: string;
};
