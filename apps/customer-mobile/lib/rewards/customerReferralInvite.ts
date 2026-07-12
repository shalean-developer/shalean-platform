import { API_UPSTREAM_URL } from "@/constants/config";
import {
  buildReferralInviteUrl as buildInviteUrl,
  buildReferralShareMessage,
} from "@/lib/rewards/referralShare";

export { buildReferralShareMessage };

/** App wrapper — uses configured API origin for invite links. */
export function buildCustomerReferralInviteUrl(referralCode: string): string {
  return buildInviteUrl(referralCode, API_UPSTREAM_URL || "https://shalean.co.za");
}
