/** A suggested bank reference is an instruction, never settlement evidence. */
export function cleanerPaymentReference(paymentId: string, month: string): string {
  if (paymentId.length !== 13 || !/^SHL-CL-[0-9]{6}$/.test(paymentId)) throw new Error("Invalid cleaner payment ID");
  if (month.length !== 7 || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error("Invalid payment month");
  return `${paymentId}-${month.replace("-", "")}`;
}
