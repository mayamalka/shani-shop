import type { Secrets } from './crypto';

export interface CreatePaymentInput {
  orderId: string;
  orderNumber: number;
  /** agorot */
  amount: number;
  description: string;
  customer: { fullName: string; email: string; phone: string };
}

export interface PaymentWebhookResult {
  orderId: string;
  providerRef: string;
  outcome: 'PAID' | 'FAILED';
}

/**
 * A payment provider's hosted payment page (Grow, PayPlus, Cardcom…).
 * To add a real provider: implement this interface in one file and register it in createPaymentProvider().
 */
export interface PaymentProvider {
  readonly name: string;
  /** Returns the URL of the provider's secure payment page to send the customer to. */
  createPayment(input: CreatePaymentInput): Promise<{ redirectUrl: string; providerRef: string | null }>;
  /** Verifies a server-to-server notification ("webhook"). Returns null if it is not authentic. */
  parseWebhook(headers: Record<string, string | string[] | undefined>, body: unknown): Promise<PaymentWebhookResult | null>;
}

/** Development stand-in: a fake payment page served by this API at /api/payments/mock/:orderId. */
export class MockPaymentProvider implements PaymentProvider {
  readonly name = 'mock';
  constructor(
    private apiUrl: string,
    private secrets: Secrets,
  ) {}

  async createPayment(input: CreatePaymentInput) {
    const sig = this.secrets.sign(`mock:${input.orderId}`);
    return { redirectUrl: `${this.apiUrl}/api/payments/mock/${input.orderId}?sig=${sig}`, providerRef: null };
  }

  pageSignatureOk(orderId: string, sig: string): boolean {
    return this.secrets.verify(`mock:${orderId}`, sig);
  }

  /** Webhook body: { orderId, outcome, ref }, header x-mock-signature = sign(JSON body) */
  async parseWebhook(headers: Record<string, string | string[] | undefined>, body: unknown) {
    const sig = headers['x-mock-signature'];
    if (typeof sig !== 'string' || !body || typeof body !== 'object') return null;
    const b = body as { orderId?: unknown; outcome?: unknown; ref?: unknown };
    if (typeof b.orderId !== 'string' || (b.outcome !== 'PAID' && b.outcome !== 'FAILED') || typeof b.ref !== 'string') return null;
    if (!this.secrets.verify(JSON.stringify({ orderId: b.orderId, outcome: b.outcome, ref: b.ref }), sig)) return null;
    const result: PaymentWebhookResult = { orderId: b.orderId, providerRef: b.ref, outcome: b.outcome };
    return result;
  }

  signWebhook(body: { orderId: string; outcome: 'PAID' | 'FAILED'; ref: string }): string {
    return this.secrets.sign(JSON.stringify({ orderId: body.orderId, outcome: body.outcome, ref: body.ref }));
  }
}
