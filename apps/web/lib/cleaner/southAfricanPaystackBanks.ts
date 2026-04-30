/** Paystack SA recipient bank codes (cleaner payout onboarding). */
export const SOUTH_AFRICAN_PAYSTACK_BANKS = [
  { code: "632005", name: "ABSA Bank" },
  { code: "470010", name: "Capitec Bank" },
  { code: "250655", name: "First National Bank" },
  { code: "580105", name: "Investec Bank" },
  { code: "198765", name: "Nedbank" },
  { code: "051001", name: "Standard Bank" },
  { code: "678910", name: "TymeBank" },
] as const;

export function bankDisplayNameFromCode(code: string | null | undefined): string {
  const c = String(code ?? "").trim();
  const hit = SOUTH_AFRICAN_PAYSTACK_BANKS.find((b) => b.code === c);
  return hit?.name ?? (c ? `Bank (${c})` : "—");
}
