import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { Secrets } from './crypto';
import { processCustomerPhoto, processPublicImage } from './images';
import { MockPaymentProvider } from './payments';
import { LocalStorage, publicUrl } from './storage';

const secrets = new Secrets('test-secret-'.padEnd(64, 'x'));

describe('Secrets', () => {
  it('encrypts and decrypts (AES-GCM) and detects tampering', () => {
    const enc = secrets.encrypt('JBSWY3DPEHPK3PXP');
    expect(enc).not.toContain('JBSWY3DPEHPK3PXP');
    expect(secrets.decrypt(enc)).toBe('JBSWY3DPEHPK3PXP');
    const [iv, tag, data] = enc.split('.');
    const tampered = [iv, tag, data!.slice(0, -2) + (data!.endsWith('A') ? 'BB' : 'AA')].join('.');
    expect(() => secrets.decrypt(tampered)).toThrow();
  });
  it('a different APP_SECRET cannot decrypt', () => {
    expect(() => new Secrets('another-'.padEnd(64, 'y')).decrypt(secrets.encrypt('x'))).toThrow();
  });
  it('signs and verifies', () => {
    const sig = secrets.sign('order:1');
    expect(secrets.verify('order:1', sig)).toBe(true);
    expect(secrets.verify('order:2', sig)).toBe(false);
    expect(secrets.verify('order:1', 'nope')).toBe(false);
  });
});

describe('mock payment provider', () => {
  const mock = new MockPaymentProvider('http://api.test', secrets);
  it('creates a signed payment page URL', async () => {
    const r = await mock.createPayment({ orderId: 'o1', orderNumber: 1001, amount: 30000, description: 'x', customer: { fullName: 'a', email: 'a@b.co', phone: '050' } });
    const sig = new URL(r.redirectUrl).searchParams.get('sig')!;
    expect(r.redirectUrl).toMatch(/^http:\/\/api\.test\/api\/payments\/mock\/o1\?sig=/);
    expect(mock.pageSignatureOk('o1', sig)).toBe(true);
    expect(mock.pageSignatureOk('o2', sig)).toBe(false);
  });
  it('accepts only correctly signed webhooks', async () => {
    const body = { orderId: 'o1', outcome: 'PAID' as const, ref: 'R1' };
    const sig = mock.signWebhook(body);
    expect(await mock.parseWebhook({ 'x-mock-signature': sig }, body)).toEqual({ orderId: 'o1', providerRef: 'R1', outcome: 'PAID' });
    expect(await mock.parseWebhook({ 'x-mock-signature': sig }, { ...body, orderId: 'o2' })).toBeNull();
    expect(await mock.parseWebhook({}, body)).toBeNull();
    expect(await mock.parseWebhook({ 'x-mock-signature': sig }, { ...body, outcome: 'HACKED' })).toBeNull();
  });
});

describe('images', () => {
  it('removes EXIF/GPS metadata from customer photos', async () => {
    const withGps = await sharp({ create: { width: 64, height: 48, channels: 3, background: '#f28c28' } })
      .jpeg()
      .withExif({ IFD0: { Copyright: 'secret-location-test' } })
      .toBuffer();
    expect((await sharp(withGps).metadata()).exif).toBeDefined();
    const out = await processCustomerPhoto(withGps);
    const meta = await sharp(out).metadata();
    expect(meta.exif).toBeUndefined();
    expect(meta.format).toBe('jpeg');
  });
  it('rejects files that are not real images', async () => {
    await expect(processCustomerPhoto(Buffer.from('<?php echo "hi"; ?>'))).rejects.toMatchObject({ status: 415 });
    const gif = await sharp({ create: { width: 4, height: 4, channels: 3, background: '#000' } }).gif().toBuffer();
    await expect(processPublicImage(gif)).rejects.toMatchObject({ status: 415 });
  });
  it('shrinks big pictures', async () => {
    const big = await sharp({ create: { width: 4000, height: 3000, channels: 3, background: '#fff' } }).png().toBuffer();
    const meta = await sharp(await processPublicImage(big)).metadata();
    expect(meta.width).toBe(1600);
    expect(meta.format).toBe('webp');
  });
});

describe('storage', () => {
  it('refuses path traversal keys', async () => {
    const s = new LocalStorage('/tmp/shani-test-storage');
    await expect(s.put('../etc/passwd', Buffer.from('x'))).rejects.toThrow();
    await expect(s.put('private/../../x', Buffer.from('x'))).rejects.toThrow();
  });
  it('maps public keys to /media URLs', () => {
    expect(publicUrl('public/a.webp')).toBe('/media/a.webp');
    expect(publicUrl(null)).toBeNull();
  });
});
