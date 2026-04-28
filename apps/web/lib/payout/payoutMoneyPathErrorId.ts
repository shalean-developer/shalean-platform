import { randomBytes } from "node:crypto";

/** Correlates money-path API responses with `system_logs` / ops (e.g. `PP-8F3A2B1C`). */
export function newPayoutMoneyPathErrorId(): string {
  return `PP-${randomBytes(4).toString("hex").toUpperCase()}`;
}
