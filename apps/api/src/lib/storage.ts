import { createHash, createHmac } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Config } from '../config';

/**
 * Where files live. Keys look like "public/abc.webp" (product pictures, served at /media)
 * or "private/xyz.jpg" (customer photos, admin only).
 * LocalStorage = a folder on disk (development, tests). S3Storage = Cloudflare R2 / any S3 API (production).
 */
export interface StorageProvider {
  put(key: string, data: Buffer): Promise<void>;
  /** throws an error with code "ENOENT" when the file doesn't exist */
  get(key: string): Promise<Buffer>;
  remove(key: string): Promise<void>;
}

const KEY_RE = /^(public|private)\/[\w.-]+$/;
function checkKey(key: string): string {
  if (!KEY_RE.test(key) || key.includes('..')) throw new Error('bad storage key');
  return key;
}

const notFound = (key: string) => Object.assign(new Error(`file not found: ${key}`), { code: 'ENOENT' });

export class LocalStorage implements StorageProvider {
  constructor(private root: string) {}
  private resolve(key: string): string {
    return path.join(this.root, checkKey(key));
  }
  async put(key: string, data: Buffer) {
    const file = this.resolve(key);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, data);
  }
  get(key: string) {
    return readFile(this.resolve(key));
  }
  async remove(key: string) {
    await rm(this.resolve(key), { force: true });
  }
}

export interface S3Options {
  /** e.g. https://<account-id>.r2.cloudflarestorage.com or http://localhost:9000 (MinIO) */
  endpoint: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** "auto" for Cloudflare R2 */
  region: string;
}

const sha256hex = (data: string | Buffer) => createHash('sha256').update(data).digest('hex');
const hmac = (key: string | Buffer, data: string) => createHmac('sha256', key).update(data).digest();

export interface SignInput {
  method: string;
  /** e.g. "localhost:9000" or "<account>.r2.cloudflarestorage.com" */
  host: string;
  /** already URI-encoded path, e.g. "/bucket/public/a.webp" */
  path: string;
  /** extra headers to sign (lower-case names) */
  headers?: Record<string, string>;
  payloadHash: string;
  region: string;
  service: string;
  accessKeyId: string;
  secretAccessKey: string;
  now: Date;
}

/** AWS Signature Version 4 (no query string). Returns the headers to send – everything except Host. */
export function signV4(i: SignInput): Record<string, string> {
  const amzDate = i.now.toISOString().replace(/[:-]|\.\d{3}/g, ''); // 20261113T120000Z
  const day = amzDate.slice(0, 8);
  const headers: Record<string, string> = {
    ...i.headers,
    host: i.host,
    'x-amz-content-sha256': i.payloadHash,
    'x-amz-date': amzDate,
  };
  const names = Object.keys(headers).sort();
  const signedHeaders = names.join(';');
  const canonical = [i.method, i.path, '', ...names.map((h) => `${h}:${headers[h]!.trim()}`), '', signedHeaders, i.payloadHash].join('\n');
  const scope = `${day}/${i.region}/${i.service}/aws4_request`;
  const toSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256hex(canonical)].join('\n');
  let k = hmac('AWS4' + i.secretAccessKey, day);
  for (const part of [i.region, i.service, 'aws4_request']) k = hmac(k, part);
  const signature = createHmac('sha256', k).update(toSign).digest('hex');
  const { host: _host, ...sent } = headers; // fetch sets Host itself
  return {
    ...sent,
    authorization: `AWS4-HMAC-SHA256 Credential=${i.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
  };
}

/**
 * Minimal S3 client (PUT / GET / DELETE object, path-style URLs, AWS Signature V4).
 * Hand-written to keep the AWS SDK out of the image; works with Cloudflare R2 and MinIO.
 */
export class S3Storage implements StorageProvider {
  private base: URL;
  constructor(
    private o: S3Options,
    private fetchFn: typeof fetch = fetch,
  ) {
    this.base = new URL(o.endpoint);
  }

  private request(method: 'GET' | 'PUT' | 'DELETE', key: string, body?: Buffer) {
    const url = new URL(`/${encodeURIComponent(this.o.bucket)}/${checkKey(key)}`, this.base);
    const headers = signV4({
      method,
      host: url.host,
      path: url.pathname,
      headers: body ? { 'content-type': contentType(key) } : undefined,
      payloadHash: sha256hex(body ?? ''),
      region: this.o.region,
      service: 's3',
      accessKeyId: this.o.accessKeyId,
      secretAccessKey: this.o.secretAccessKey,
      now: new Date(),
    });
    return this.fetchFn(url, { method, headers, body: body ? new Uint8Array(body) : undefined });
  }

  async put(key: string, data: Buffer) {
    const res = await this.request('PUT', key, data);
    if (!res.ok) throw new Error(`storage PUT ${key} failed: ${res.status} ${await res.text().catch(() => '')}`);
  }

  async get(key: string) {
    const res = await this.request('GET', key);
    if (res.status === 404) throw notFound(key);
    if (!res.ok) throw new Error(`storage GET ${key} failed: ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }

  async remove(key: string) {
    const res = await this.request('DELETE', key);
    if (!res.ok && res.status !== 404) throw new Error(`storage DELETE ${key} failed: ${res.status}`);
  }
}

export function createStorage(cfg: Config): StorageProvider {
  if (cfg.STORAGE_DRIVER === 's3') {
    return new S3Storage({
      endpoint: cfg.S3_ENDPOINT,
      bucket: cfg.S3_BUCKET,
      accessKeyId: cfg.S3_ACCESS_KEY_ID,
      secretAccessKey: cfg.S3_SECRET_ACCESS_KEY,
      region: cfg.S3_REGION,
    });
  }
  return new LocalStorage(cfg.UPLOAD_DIR);
}

const TYPES: Record<string, string> = {
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.avif': 'image/avif',
};
export const contentType = (key: string): string => TYPES[path.extname(key).toLowerCase()] ?? 'application/octet-stream';

export const publicUrl = (key: string | null | undefined): string | null =>
  key ? '/media/' + key.replace(/^public\//, '') : null;
