import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { Secrets } from './crypto';
import { processCustomerPhoto, processPublicImage } from './images';
import { MockPaymentProvider } from './payments';
import { contentType, LocalStorage, publicUrl, S3Storage, signV4 } from './storage';

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

describe('S3 storage (Cloudflare R2)', () => {
  it('signs exactly like the AWS Signature V4 documentation example (GET Object)', () => {
    // https://docs.aws.amazon.com/AmazonS3/latest/API/sig-v4-header-based-auth.html – "Example: GET Object"
    const h = signV4({
      method: 'GET',
      host: 'examplebucket.s3.amazonaws.com',
      path: '/test.txt',
      headers: { range: 'bytes=0-9' },
      payloadHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      region: 'us-east-1',
      service: 's3',
      accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
      secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
      now: new Date('2013-05-24T00:00:00Z'),
    });
    expect(h.authorization).toBe(
      'AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request, ' +
        'SignedHeaders=host;range;x-amz-content-sha256;x-amz-date, ' +
        'Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41',
    );
    expect(h['x-amz-date']).toBe('20130524T000000Z');
    expect(h).not.toHaveProperty('host');
  });

  function fakeS3() {
    const objects = new Map<string, Buffer>();
    const calls: { method: string; url: string; headers: Record<string, string> }[] = [];
    const fetchFn = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      calls.push({ method, url, headers: init?.headers as Record<string, string> });
      if (method === 'PUT') {
        objects.set(url, Buffer.from(init!.body as Uint8Array));
        return new Response(null, { status: 200 });
      }
      if (method === 'DELETE') {
        objects.delete(url);
        return new Response(null, { status: 204 });
      }
      const obj = objects.get(url);
      return obj ? new Response(new Uint8Array(obj), { status: 200 }) : new Response('NoSuchKey', { status: 404 });
    }) as typeof fetch;
    const s3 = new S3Storage(
      { endpoint: 'https://acc.r2.cloudflarestorage.com', bucket: 'shani-media', accessKeyId: 'id', secretAccessKey: 'secret', region: 'auto' },
      fetchFn,
    );
    return { s3, calls };
  }

  it('puts, gets and removes objects with path-style signed requests', async () => {
    const { s3, calls } = fakeS3();
    await s3.put('public/a.webp', Buffer.from('pic'));
    expect(calls[0]!.url).toBe('https://acc.r2.cloudflarestorage.com/shani-media/public/a.webp');
    expect(calls[0]!.headers['content-type']).toBe('image/webp');
    expect(calls[0]!.headers.authorization).toMatch(/^AWS4-HMAC-SHA256 Credential=id\/\d{8}\/auto\/s3\/aws4_request, SignedHeaders=content-type;host;x-amz-content-sha256;x-amz-date, Signature=[0-9a-f]{64}$/);
    expect((await s3.get('public/a.webp')).toString()).toBe('pic');
    await s3.remove('public/a.webp');
    await expect(s3.get('public/a.webp')).rejects.toMatchObject({ code: 'ENOENT' });
    await s3.remove('public/a.webp'); // deleting a missing file is fine
  });

  it('refuses path traversal keys before sending anything', async () => {
    const { s3, calls } = fakeS3();
    await expect(s3.put('../etc/passwd', Buffer.from('x'))).rejects.toThrow('bad storage key');
    await expect(s3.get('private/..')).rejects.toThrow('bad storage key');
    await expect(s3.get('other/a.jpg')).rejects.toThrow('bad storage key');
    expect(calls).toHaveLength(0);
  });

  it('knows the picture content types', () => {
    expect(contentType('public/a.webp')).toBe('image/webp');
    expect(contentType('private/b.JPG')).toBe('image/jpeg');
    expect(contentType('public/c.bin')).toBe('application/octet-stream');
  });
});
