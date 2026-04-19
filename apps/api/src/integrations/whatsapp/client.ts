import { logger } from '../../common/logger';

export class WhatsAppClient {
  private apiKey = process.env.WHATSAPP_API_KEY;
  private apiUrl = process.env.WHATSAPP_API_URL;

  async send(to: string, body: string) {
    if (!this.apiKey || !this.apiUrl) {
      logger.warn('WhatsApp not configured — WHATSAPP_API_KEY / WHATSAPP_API_URL missing');
      return { providerMessageId: 'not-configured' };
    }

    const res = await fetch(this.apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify({ to, body }),
    });

    const data = (await res.json()) as { id?: string };
    return { providerMessageId: data.id ?? 'unknown' };
  }
}
