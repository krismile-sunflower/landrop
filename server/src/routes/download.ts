import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import type { Context } from 'hono';
import type { HttpBindings } from '@hono/node-server';
import { lookup } from 'mime-types';
import { getFile, removeFile, touchFile } from '../utils/files.js';

type AppContext = Context<{ Bindings: HttpBindings }>;

function contentDisposition(fileName: string) {
  const fallback = fileName.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_');
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

export async function downloadHandler(c: AppContext) {
  const fileId = c.req.param('fileId');
  if (!fileId) {
    return c.json({ error: 'File not found' }, 404);
  }

  const file = touchFile(fileId);

  if (!file) {
    return c.json({ error: 'File not found' }, 404);
  }

  try {
    const fileStat = await stat(file.path);
    const contentType = file.mimeType || lookup(file.originalName) || 'application/octet-stream';
    const stream = Readable.toWeb(createReadStream(file.path)) as ReadableStream;

    return new Response(stream, {
      headers: {
        'Content-Type': String(contentType),
        'Content-Length': String(fileStat.size),
        'Content-Disposition': contentDisposition(file.originalName),
        'Cache-Control': 'no-store'
      }
    });
  } catch {
    await removeFile(file);
    return c.json({ error: 'File not found' }, 404);
  }
}
