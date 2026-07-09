export const EXPENSE_RECEIPT_BUCKET = "expense-receipts";
export const EXPENSE_RECEIPT_MAX_BYTES = 10 * 1024 * 1024;

export const EXPENSE_RECEIPT_ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
]);

export function expenseReceiptExtensionForMime(mime: string): string | null {
  switch (mime) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
    case "application/pdf":
      return "pdf";
    default:
      return null;
  }
}

export function isExpenseReceiptImage(mime: string | null | undefined): boolean {
  return Boolean(mime?.startsWith("image/"));
}
