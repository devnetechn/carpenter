export interface RecordPaymentProviderInput {
  invoiceId: string;
  amount: number;
  method: string;
}

export interface PaymentProvider {
  recordPayment(input: RecordPaymentProviderInput): Promise<{ providerRef: string | null }>;
}

class ManualPaymentProvider implements PaymentProvider {
  async recordPayment(_input: RecordPaymentProviderInput): Promise<{ providerRef: string | null }> {
    return { providerRef: null };
  }
}

export const paymentProvider: PaymentProvider = new ManualPaymentProvider();
