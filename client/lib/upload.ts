export type UploadResult = {
  id: string;
  fileName: string;
  mimeType: string;
  size: number;
};

export function uploadFile(file: File, onProgress: (progress: number) => void, t?: (key: string) => string) {
  return new Promise<UploadResult>((resolve, reject) => {
    const formData = new FormData();
    const request = new XMLHttpRequest();

    formData.append('file', file);

    request.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    });

    request.addEventListener('load', () => {
      try {
        const data = JSON.parse(request.responseText) as UploadResult | { error?: string };
        if (request.status >= 200 && request.status < 300 && 'id' in data) {
          onProgress(100);
          resolve(data);
          return;
        }

        reject(new Error('error' in data && data.error ? data.error : (t ? t('errors.uploadFailed') : 'Upload failed')));
      } catch {
        reject(new Error(t ? t('errors.uploadFailed') : 'Upload failed'));
      }
    });

    request.addEventListener('error', () => reject(new Error(t ? t('errors.networkError') : 'Network error')));
    request.open('POST', '/api/upload');
    request.send(formData);
  });
}

export function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0 B';
  }

  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** index;
  return `${value >= 10 || index === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[index]}`;
}
