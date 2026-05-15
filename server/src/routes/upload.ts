import type { Context } from 'hono';
import type { HttpBindings } from '@hono/node-server';
import Busboy from 'busboy';
import { nanoid } from 'nanoid';
import { pipeline } from 'node:stream/promises';
import { rm } from 'node:fs/promises';
import { createStoredFile, ensureUploadsDir, maxUploadBytes, registerFile } from '../utils/files.js';

type AppContext = Context<{ Bindings: HttpBindings }>;

type UploadError = {
  status: number;
  message: string;
};

export async function uploadHandler(c: AppContext) {
  const contentType = c.req.header('content-type') ?? '';
  const contentLength = Number(c.req.header('content-length') ?? 0);

  if (!contentType.includes('multipart/form-data')) {
    return c.json({ error: 'Expected multipart/form-data' }, 415);
  }

  if (contentLength > maxUploadBytes) {
    return c.json({ error: 'File is too large' }, 413);
  }

  await ensureUploadsDir();

  return new Promise<Response>((resolve) => {
    const tempPaths: string[] = [];
    let uploadError: UploadError | null = null;
    let filePromise: Promise<void> | null = null;
    let savedFile:
      | {
          id: string;
          fileName: string;
          mimeType: string;
          size: number;
        }
      | null = null;

    const fail = (status: number, message: string) => {
      uploadError ??= { status, message };
    };

    const busboy = Busboy({
      headers: c.env.incoming.headers,
      limits: {
        files: 1,
        fileSize: maxUploadBytes
      }
    });

    busboy.on('file', (_fieldName, file, info) => {
      if (filePromise) {
        fail(400, 'Only one file can be uploaded at a time');
        file.resume();
        return;
      }

      let stored: ReturnType<typeof createStoredFile>;
      try {
        stored = createStoredFile(nanoid(12), info.filename, info.mimeType);
      } catch (error) {
        fail(400, error instanceof Error ? error.message : 'Invalid file');
        file.resume();
        return;
      }

      tempPaths.push(stored.path);
      let size = 0;
      let limited = false;

      file.on('data', (chunk: Buffer) => {
        size += chunk.length;
      });

      file.on('limit', () => {
        limited = true;
        fail(413, 'File is too large');
        stored.stream.destroy();
      });

      filePromise = pipeline(file, stored.stream)
        .then(() => {
          if (limited) {
            return;
          }

          registerFile({
            id: stored.id,
            diskName: stored.diskName,
            originalName: stored.originalName,
            mimeType: stored.mimeType,
            path: stored.path,
            size,
            createdAt: Date.now(),
            lastAccessedAt: Date.now()
          });

          savedFile = {
            id: stored.id,
            fileName: stored.originalName,
            mimeType: stored.mimeType,
            size
          };
        })
        .catch((error) => {
          if (!limited) {
            fail(500, error instanceof Error ? error.message : 'Upload failed');
          }
        });
    });

    busboy.on('filesLimit', () => {
      fail(400, 'Only one file can be uploaded at a time');
    });

    busboy.on('error', (error: unknown) => {
      fail(400, error instanceof Error ? error.message : 'Upload failed');
    });

    busboy.on('finish', () => {
      void (async () => {
        await filePromise;

        if (uploadError) {
          await Promise.all(tempPaths.map((filePath) => rm(filePath, { force: true })));
          resolve(c.json({ error: uploadError.message }, uploadError.status as 400));
          return;
        }

        if (!savedFile) {
          resolve(c.json({ error: 'No file received' }, 400));
          return;
        }

        resolve(c.json(savedFile));
      })();
    });

    c.env.incoming.pipe(busboy);
  });
}
