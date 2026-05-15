import { createWriteStream } from 'node:fs';
import { mkdir, readdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';

export const uploadsDir = path.resolve(process.cwd(), 'uploads');
export const maxUploadBytes = Number(process.env.LANDROP_MAX_UPLOAD_BYTES ?? 2 * 1024 * 1024 * 1024);

const blockedExtensions = new Set([
  '.app',
  '.bat',
  '.cmd',
  '.com',
  '.cpl',
  '.dll',
  '.exe',
  '.jar',
  '.msi',
  '.ps1',
  '.scr',
  '.sh'
]);

export type StoredFile = {
  id: string;
  diskName: string;
  originalName: string;
  mimeType: string;
  size: number;
  path: string;
  createdAt: number;
  lastAccessedAt: number;
};

const files = new Map<string, StoredFile>();

export async function ensureUploadsDir() {
  await mkdir(uploadsDir, { recursive: true });
}

export function sanitizeFileName(fileName: string) {
  const baseName = path.basename(fileName || 'download');
  const safeName = baseName.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').trim();
  return safeName.slice(0, 180) || 'download';
}

export function assertAllowedExtension(fileName: string) {
  const extension = path.extname(fileName).toLowerCase();
  if (blockedExtensions.has(extension)) {
    throw new Error('This file type is not allowed');
  }
}

export function createStoredFile(id: string, originalName: string, mimeType: string) {
  const safeName = sanitizeFileName(originalName);
  assertAllowedExtension(safeName);
  const extension = path.extname(safeName).toLowerCase();
  const diskName = `${id}${extension}`;
  const filePath = path.join(uploadsDir, diskName);

  return {
    id,
    diskName,
    originalName: safeName,
    mimeType: mimeType || 'application/octet-stream',
    path: filePath,
    stream: createWriteStream(filePath, { flags: 'wx' })
  };
}

export function registerFile(file: StoredFile) {
  files.set(file.id, file);
  return file;
}

export function getFile(fileId: string) {
  return files.get(fileId);
}

export function touchFile(fileId: string) {
  const file = files.get(fileId);
  if (file) {
    file.lastAccessedAt = Date.now();
  }
  return file;
}

export function forgetFileByDiskName(diskName: string) {
  for (const [fileId, file] of files) {
    if (file.diskName === diskName) {
      files.delete(fileId);
      return;
    }
  }
}

export async function removeFile(file: StoredFile) {
  files.delete(file.id);
  await rm(file.path, { force: true });
}

export async function pruneExpiredFiles(maxAgeMs: number) {
  const now = Date.now();
  await ensureUploadsDir();

  for (const file of files.values()) {
    if (now - file.lastAccessedAt > maxAgeMs) {
      await removeFile(file);
    }
  }

  const entries = await readdir(uploadsDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile()) {
      continue;
    }

    const filePath = path.join(uploadsDir, entry.name);
    const fileStat = await stat(filePath);
    if (now - fileStat.mtimeMs > maxAgeMs) {
      forgetFileByDiskName(entry.name);
      await rm(filePath, { force: true });
    }
  }
}
