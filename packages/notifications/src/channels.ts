export type Channel = 'WHATSAPP' | 'EMAIL';

export interface ChannelProvider {
  send(to: string, subject: string | null, body: string): Promise<{ providerMessageId?: string }>;
}
