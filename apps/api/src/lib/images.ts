import sharp from 'sharp';
import { HttpError } from './http';

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const ALLOWED = new Set(['jpeg', 'png', 'webp']);

/** Decode for real (not trusting the file name/MIME), so non-images are rejected. */
async function inspect(buf: Buffer) {
  try {
    const meta = await sharp(buf).metadata();
    if (!meta.format || !ALLOWED.has(meta.format) || !meta.width || !meta.height) throw new Error('format');
    if (meta.width * meta.height > 60_000_000) throw new Error('too big');
    return meta;
  } catch {
    throw new HttpError(415, 'UNSUPPORTED_IMAGE', 'ניתן להעלות רק תמונות JPG, PNG או WEBP');
  }
}

/**
 * Customer photo: rotate by EXIF, cap size, re-encode as JPEG.
 * sharp drops all metadata (EXIF, GPS location) unless told to keep it.
 */
export async function processCustomerPhoto(buf: Buffer): Promise<Buffer> {
  await inspect(buf);
  return sharp(buf).rotate().resize({ width: 2400, height: 2400, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 88 }).toBuffer();
}

export async function thumbnail(buf: Buffer, size = 240): Promise<Buffer> {
  return sharp(buf).resize({ width: size, height: size, fit: 'cover' }).jpeg({ quality: 75 }).toBuffer();
}

/** Product / page picture for the shop: WEBP, max 1600px, metadata stripped. */
export async function processPublicImage(buf: Buffer): Promise<Buffer> {
  await inspect(buf);
  return sharp(buf).rotate().resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
}
