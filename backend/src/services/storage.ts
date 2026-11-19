import fs from 'node:fs/promises';
import path from 'node:path';
import { randomToken } from '@/lib/crypto';
import { env } from '@/lib/env';
import { ApiError } from '@/lib/errors';

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const LOCAL_DIR = path.resolve(process.cwd(), '.uploads');
export const MEDIA_NAME = /^[a-z]+-[A-Z0-9]+-[A-Za-z0-9_-]{16}\.(jpg|png|webp)$/;

type Sniffed = { ext: 'jpg' | 'png' | 'webp'; mime: string };

/** Trusts the bytes, never the filename or the browser-supplied type. SVG and GIF are refused on purpose (scriptable / animated). */
export function sniffImage(b: Uint8Array): Sniffed | null {
  if (b.length > 12 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { ext: 'jpg', mime: 'image/jpeg' };
  if (b.length > 12 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return { ext: 'png', mime: 'image/png' };
  const tag = (o: number, s: string) => [...s].every((c, i) => b[o + i] === c.charCodeAt(0));
  if (b.length > 12 && tag(0, 'RIFF') && tag(8, 'WEBP')) return { ext: 'webp', mime: 'image/webp' };
  return null;
}

/** Stores one product image and returns the URL to save on the product. */
export async function storeProductImage(kind: 'saree' | 'ornament', productId: string, bytes: Uint8Array): Promise<string> {
  if (bytes.length === 0) throw new ApiError('bad_request', 'Choose a photo to upload');
  if (bytes.length > MAX_IMAGE_BYTES) throw new ApiError('bad_request', 'That photo is over 5 MB. Please use a smaller one');
  const type = sniffImage(bytes);
  if (!type) throw new ApiError('bad_request', 'Please upload a JPG, PNG or WebP photo');
  if (!/^[A-Z]{2}\d{5}$/.test(productId)) throw new ApiError('bad_request', 'Invalid product');
  const name = `${kind}-${productId}-${randomToken(12)}.${type.ext}`;
  const e = env();

  if (e.STORAGE_DRIVER === 'supabase') {
    if (!e.SUPABASE_URL || !e.SUPABASE_SERVICE_ROLE_KEY) throw new ApiError('internal', 'Image storage is not configured');
    const res = await fetch(`${e.SUPABASE_URL}/storage/v1/object/${e.SUPABASE_BUCKET}/${name}`, {
      method: 'POST', headers: { authorization: `Bearer ${e.SUPABASE_SERVICE_ROLE_KEY}`, apikey: e.SUPABASE_SERVICE_ROLE_KEY, 'content-type': type.mime, 'cache-control': 'public, max-age=31536000, immutable' },
      body: Buffer.from(bytes), signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) { console.error('[storage] upload failed', res.status); throw new ApiError('internal', 'Could not store the photo. Please try again'); }
    return `${e.SUPABASE_URL}/storage/v1/object/public/${e.SUPABASE_BUCKET}/${name}`;
  }
  await fs.mkdir(LOCAL_DIR, { recursive: true });
  await fs.writeFile(path.join(LOCAL_DIR, name), bytes, { flag: 'wx' });
  return `/media/${name}`;
}
