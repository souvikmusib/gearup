import { logger } from '../../common/logger';

export class EmailClient {
  private apiKey = process.env.EMAIL_API_KEY;
  private from = process.env.EMAIL_FROM_ADDRESS;

  async send(to: string, subject: string, body: string) {
    if (!this.apiKey || !this.from) {
      logger.warn('Email not configured — EMAIL_API_KEY / EMAIL_FROM_ADDRESS missing');
      return { providerMessageId: 'not-configured' };
    }

    const res = await fetch('https://api.email-provider.com/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify({ from: this.from, to, subject, body }),
    });

    const data = (await res.json()) as { id?: string };
    return { providerMessageId: data.id ?? 'unknown' };
  }
}
