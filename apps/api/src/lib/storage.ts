import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * Where files live. Keys look like "public/abc.webp" (product pictures, served at /media)
 * or "private/xyz.jpg" (customer photos, admin only).
 * Swap LocalStorage for an S3/R2 implementation when moving to the cloud.
 */
export interface StorageProvider {
  put(key: string, data: Buffer): Promise<void>;
  get(key: string): Promise<Buffer>;
  remove(key: string): Promise<void>;
  publicDir(): string;
}

export class LocalStorage implements StorageProvider {
  constructor(private root: string) {}
  private resolve(key: string): string {
    if (!/^(public|private)\/[\w.-]+$/.test(key)) throw new Error('bad storage key');
    return path.join(this.root, key);
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
  publicDir() {
    return path.join(this.root, 'public');
  }
}

export const publicUrl = (key: string | null | undefined): string | null =>
  key ? '/media/' + key.replace(/^public\//, '') : null;
