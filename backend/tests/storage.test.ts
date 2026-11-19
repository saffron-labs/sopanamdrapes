import { beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import { eq } from 'drizzle-orm';
import { sarees } from '@/db/schema';
import { MAX_IMAGE_BYTES, LOCAL_DIR, MEDIA_NAME, sniffImage, storeProductImage } from '@/services/storage';
import { addProductImage } from '@/services/admin-catalog';
import { seedCatalogue } from './fixtures';
import { freshDb } from './helpers';
import type { AdminCtx } from '@/lib/audit';

const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 73, 72, 68, 82]);
const jpg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70, 0, 1, 1]);
const webp = new Uint8Array([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50]);
const ctx = (role: AdminCtx['role']): AdminCtx => ({ id: '00000000-0000-0000-0000-000000000001', email: 'a@b.test', role, ip: '1.1.1.1', ua: 't' });

beforeEach(async () => { await freshDb(); });

describe('image upload', () => {
  it('accepts only real JPG/PNG/WebP bytes', () => {
    expect(sniffImage(png)?.ext).toBe('png');
    expect(sniffImage(jpg)?.ext).toBe('jpg');
    expect(sniffImage(webp)?.ext).toBe('webp');
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"></svg>');
    expect(sniffImage(svg)).toBeNull();
    expect(sniffImage(new TextEncoder().encode('GIF89a......'))).toBeNull();
    expect(sniffImage(new TextEncoder().encode('<html><script>alert(1)</script></html>'))).toBeNull();
  });

  it('rejects empty, oversized and disguised files, and stores valid ones under a random safe name', async () => {
    await expect(storeProductImage('saree', 'SA00001', new Uint8Array())).rejects.toThrow();
    await expect(storeProductImage('saree', 'SA00001', new Uint8Array(MAX_IMAGE_BYTES + 1).fill(0xff))).rejects.toThrow(/5 MB/);
    await expect(storeProductImage('saree', 'SA00001', new TextEncoder().encode('<svg onload=alert(1)>'.padEnd(40)))).rejects.toThrow(/JPG, PNG or WebP/);
    await expect(storeProductImage('saree', '../../etc', png)).rejects.toThrow();
    const url = await storeProductImage('saree', 'SA00001', png);
    expect(url).toMatch(/^\/media\//);
    const name = url.replace('/media/', '');
    expect(MEDIA_NAME.test(name)).toBe(true);
    await fs.rm(`${LOCAL_DIR}/${name}`);
  });

  it('serving pattern blocks path traversal', () => {
    for (const n of ['../secret.png', '..%2Fsecret.png', 'saree-SA00001-abc.png', 'x.svg', 'saree-SA00001-AAAAAAAAAAAAAAAA.svg']) expect(MEDIA_NAME.test(n)).toBe(false);
  });

  it('adds the photo to the product, audited, and enforces role and the 8-photo cap', async () => {
    const d = await freshDb(); await seedCatalogue(d);
    await expect(addProductImage(d, ctx('staff'), 'saree', 'SA00001', jpg)).rejects.toThrow();
    const url = await addProductImage(d, ctx('manager'), 'saree', 'SA00001', jpg);
    const [row] = await d.select({ images: sarees.images }).from(sarees).where(eq(sarees.id, 'SA00001'));
    expect(row!.images).toContain(url);
    await d.update(sarees).set({ images: Array.from({ length: 8 }, (_, i) => `/x/${i}.png`) }).where(eq(sarees.id, 'SA00001'));
    await expect(addProductImage(d, ctx('manager'), 'saree', 'SA00001', jpg)).rejects.toThrow(/up to 8/);
    await fs.rm(`${LOCAL_DIR}/${url.replace('/media/', '')}`, { force: true });
  });
});
