import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const randomToken = (bytes = 32): string => randomBytes(bytes).toString('hex');
export const sha256 = (s: string): string => createHash('sha256').update(s).digest('hex');

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export class Secrets {
  private key: Buffer;
  constructor(private appSecret: string) {
    this.key = createHash('sha256').update('enc:' + appSecret).digest();
  }
  /** AES-256-GCM; output: iv.tag.ciphertext (base64url) */
  encrypt(plain: string): string {
    const iv = randomBytes(12);
    const c = createCipheriv('aes-256-gcm', this.key, iv);
    const enc = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
    return [iv, c.getAuthTag(), enc].map((b) => b.toString('base64url')).join('.');
  }
  decrypt(payload: string): string {
    const [iv, tag, enc] = payload.split('.').map((p) => Buffer.from(p, 'base64url'));
    if (!iv || !tag || !enc) throw new Error('bad payload');
    const d = createDecipheriv('aes-256-gcm', this.key, iv);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(enc), d.final()]).toString('utf8');
  }
  sign(data: string): string {
    return createHmac('sha256', 'sig:' + this.appSecret).update(data).digest('hex');
  }
  verify(data: string, signature: string): boolean {
    return typeof signature === 'string' && safeEqual(this.sign(data), signature);
  }
}
