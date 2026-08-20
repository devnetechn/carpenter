export interface SendEmailInput {
  to: string;
  subject: string;
  body: string;
}

export type SendEmailResult =
  | { status: "sent" }
  | { status: "failed"; error: string }
  | { status: "skipped"; reason: string };

export interface EmailProvider {
  send(input: SendEmailInput): Promise<SendEmailResult>;
}

export class NoopEmailProvider implements EmailProvider {
  async send(_input: SendEmailInput): Promise<SendEmailResult> {
    return { status: "skipped", reason: "No email provider configured (RESEND_API_KEY not set)" };
  }
}

export class ResendEmailProvider implements EmailProvider {
  constructor(
    private apiKey: string,
    private fromAddress: string
  ) {}

  async send(input: SendEmailInput): Promise<SendEmailResult> {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: this.fromAddress,
          to: input.to,
          subject: input.subject,
          text: input.body,
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        return { status: "failed", error: `Resend API error (${res.status}): ${text}` };
      }

      return { status: "sent" };
    } catch (err) {
      return { status: "failed", error: err instanceof Error ? err.message : "Unknown error" };
    }
  }
}

const apiKey = process.env.RESEND_API_KEY;
const fromAddress = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";

export const emailProvider: EmailProvider = apiKey
  ? new ResendEmailProvider(apiKey, fromAddress)
  : new NoopEmailProvider();
