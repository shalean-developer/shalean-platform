import { randomBytes } from "node:crypto";

/** Short correlation id for team assignment failures (UI ↔ logs). */
export function newTeamAssignmentErrorId(): string {
  return `TA-${randomBytes(4).toString("hex").toUpperCase()}`;
}
