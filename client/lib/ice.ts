export const fallbackIceServers: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }];

type IceServersResponse = {
  iceServers?: unknown;
};

export async function loadIceServers(): Promise<RTCIceServer[]> {
  try {
    const response = await fetch('/api/ice-servers', {
      cache: 'no-store',
      headers: { Accept: 'application/json' }
    });

    if (!response.ok) {
      return fallbackIceServers;
    }

    const data = (await response.json()) as IceServersResponse;
    const iceServers = Array.isArray(data.iceServers) ? data.iceServers.filter(isIceServer) : [];
    return iceServers.length ? iceServers : fallbackIceServers;
  } catch {
    return fallbackIceServers;
  }
}

function isIceServer(value: unknown): value is RTCIceServer {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const urls = (value as { urls?: unknown }).urls;
  return typeof urls === 'string' || (Array.isArray(urls) && urls.every((url) => typeof url === 'string'));
}
