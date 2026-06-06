export const fallbackIceServers: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }];

export type IceServerSource = 'fallback' | 'cloudflare-turn';

export type IceServersResult = {
  source: IceServerSource;
  iceServers: RTCIceServer[];
};

type IceServersResponse = {
  source?: unknown;
  iceServers?: unknown;
};

export async function loadIceServers(): Promise<IceServersResult> {
  try {
    const response = await fetch('/api/ice-servers', {
      cache: 'no-store',
      headers: { Accept: 'application/json' }
    });

    if (!response.ok) {
      return fallbackIceServersResult;
    }

    const data = (await response.json()) as IceServersResponse;
    const iceServers = Array.isArray(data.iceServers) ? data.iceServers.filter(isIceServer) : [];
    if (!iceServers.length) {
      return fallbackIceServersResult;
    }

    return {
      source: data.source === 'cloudflare-turn' ? 'cloudflare-turn' : 'fallback',
      iceServers
    };
  } catch {
    return fallbackIceServersResult;
  }
}

function isIceServer(value: unknown): value is RTCIceServer {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const urls = (value as { urls?: unknown }).urls;
  return typeof urls === 'string' || (Array.isArray(urls) && urls.every((url) => typeof url === 'string'));
}

const fallbackIceServersResult: IceServersResult = {
  source: 'fallback',
  iceServers: fallbackIceServers
};
