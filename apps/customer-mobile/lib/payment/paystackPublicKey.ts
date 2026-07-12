import { PAYSTACK_PUBLIC_KEY } from "@/constants/config";

/** Session cache: prefer the key from confirm/precheck so Inline matches verify. */
let serverPaystackPublicKey = "";

export function setServerPaystackPublicKey(key: string | null | undefined) {
  const trimmed = (key ?? "").trim();
  if (trimmed.startsWith("pk_")) {
    serverPaystackPublicKey = trimmed;
  }
}

export function resolvePaystackPublicKey(): string {
  return serverPaystackPublicKey || PAYSTACK_PUBLIC_KEY;
}

export function paystackKeyLooksMismatchedForApi(apiBaseUrl: string, publicKey: string): boolean {
  const host = apiBaseUrl.toLowerCase();
  const isProdApi =
    host.includes("shalean.co.za") || host.includes("shalean.com") || host.includes("vercel.app");
  const isTestKey = publicKey.trim().startsWith("pk_test_");
  return Boolean(isProdApi && isTestKey);
}
