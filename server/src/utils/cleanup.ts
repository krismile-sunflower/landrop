import { pruneExpiredFiles } from './files.js';

const cleanupIntervalMs = Number(process.env.LANDROP_CLEANUP_INTERVAL_MS ?? 10 * 60 * 1000);
const maxFileAgeMs = Number(process.env.LANDROP_MAX_FILE_AGE_MS ?? 30 * 60 * 1000);

export function startUploadCleanup() {
  const timer = setInterval(() => {
    void pruneExpiredFiles(maxFileAgeMs).catch((error) => {
      console.error('Upload cleanup failed:', error);
    });
  }, cleanupIntervalMs);

  timer.unref();
  void pruneExpiredFiles(maxFileAgeMs).catch((error) => {
    console.error('Initial upload cleanup failed:', error);
  });
}
