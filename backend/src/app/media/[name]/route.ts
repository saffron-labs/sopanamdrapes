import fs from 'node:fs/promises';
import path from 'node:path';
import { LOCAL_DIR, MEDIA_NAME, sniffImage } from '@/services/storage';

export const dynamic = 'force-dynamic';

/** Serves locally stored images (development / single-server hosting). The strict name pattern makes path traversal impossible. */
export async function GET(_req: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  if (!MEDIA_NAME.test(name)) return new Response('Not found', { status: 404 });
  try {
    const bytes = await fs.readFile(path.join(LOCAL_DIR, name));
    const type = sniffImage(bytes);
    if (!type) return new Response('Not found', { status: 404 });
    return new Response(new Uint8Array(bytes), { headers: { 'content-type': type.mime, 'x-content-type-options': 'nosniff', 'cache-control': 'public, max-age=31536000, immutable', 'content-security-policy': "default-src 'none'; sandbox" } });
  } catch { return new Response('Not found', { status: 404 }); }
}
