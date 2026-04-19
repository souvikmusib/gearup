import { logger } from '../../common/logger';

export class SupabaseStorage {
  private url = process.env.SUPABASE_URL;
  private key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  async upload(bucket: string, fileName: string, buffer: Buffer, mimeType: string) {
    if (!this.url || !this.key) {
      logger.warn('Supabase not configured — SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing');
      return { path: `stub://${bucket}/${fileName}` };
    }

    const res = await fetch(`${this.url}/storage/v1/object/${bucket}/${fileName}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.key}`, 'Content-Type': mimeType },
      body: buffer,
    });

    const data = (await res.json()) as { Key?: string };
    return { path: data.Key ?? `${bucket}/${fileName}` };
  }

  getPublicUrl(bucket: string, filePath: string) {
    if (!this.url) return { publicUrl: `stub://${bucket}/${filePath}` };
    return { publicUrl: `${this.url}/storage/v1/object/public/${bucket}/${filePath}` };
  }
}
