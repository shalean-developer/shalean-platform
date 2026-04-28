/** Canonical machine codes for admin billing PATCH (API + UI). */
export const BillingSwitchCode = {
  EXISTING_ACTIVITY_THIS_MONTH: "EXISTING_ACTIVITY_THIS_MONTH",
  STRICT_CONFIRM_REQUIRED: "STRICT_CONFIRM_REQUIRED",
  NO_CHANGE: "NO_CHANGE",
  UPDATED: "UPDATED",
} as const;

export type BillingSwitchCodeType = (typeof BillingSwitchCode)[keyof typeof BillingSwitchCode];

export function isBillingSwitchTerminalCacheCode(code: unknown): code is BillingSwitchCodeType {
  return code === BillingSwitchCode.NO_CHANGE || code === BillingSwitchCode.UPDATED;
}
