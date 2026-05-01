declare module "@paystack/inline-js" {
  type PaystackTransaction = Record<string, unknown>;

  type NewTransactionOptions = {
    key: string;
    email: string;
    amount: number;
    reference?: string;
    currency?: string;
    onSuccess?: (transaction: PaystackTransaction) => void;
    onCancel?: () => void;
  };

  export default class PaystackPop {
    newTransaction(options: NewTransactionOptions): void;
  }
}
