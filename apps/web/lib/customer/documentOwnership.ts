/** Minimum normalized email length to treat as a stable ownership signal (avoids empty/"a"). */
const MIN_EMAIL_LEN = 3;

export type DocumentOwnershipRow = {
  ownerId: string | null;
  ownerEmail: string | null;
};

export type DocumentOwnershipViewer = {
  id: string;
  email: string | null;
};

/**
 * Whether the signed-in viewer may access a customer-owned document row:
 * — usual case: owner id matches auth uid;
 * — orphan repair: owner id is null/empty and stored email matches the viewer (normalized).
 *
 * Does **not** grant access when ownership points at another account (even if email matches).
 */
export function ownsDocumentRow(row: DocumentOwnershipRow, viewer: DocumentOwnershipViewer): boolean {
  const ownerId = String(row.ownerId ?? "").trim();
  if (ownerId) return ownerId === viewer.id;
  const rowEmail = String(row.ownerEmail ?? "")
    .trim()
    .toLowerCase();
  const viewerEmail = String(viewer.email ?? "")
    .trim()
    .toLowerCase();
  return rowEmail.length >= MIN_EMAIL_LEN && viewerEmail.length >= MIN_EMAIL_LEN && rowEmail === viewerEmail;
}
