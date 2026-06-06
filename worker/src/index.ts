import { Hono } from 'hono';

type DeviceType = 'desktop' | 'mobile' | 'tablet' | 'unknown';

type Env = {
  ROOMS: DurableObjectNamespace;
  ASSETS: Fetcher;
  TURN_KEY_ID?: string;
  TURN_KEY_API_TOKEN?: string;
  TURN_CREDENTIAL_TTL?: string;
};

type IceServer = {
  urls: string | string[];
  username?: string;
  credential?: string;
};

type Peer = {
  peerId: string;
  socket: WebSocket;
  deviceName: string;
  deviceType: DeviceType;
  joinedAt: number;
};

type ClientMessage =
  | { type: 'join'; deviceName?: string; deviceType?: DeviceType }
  | { type: 'rename'; deviceName?: string }
  | { type: 'signal'; target?: string; data?: unknown }
  | { type: 'ping' };

const app = new Hono<{ Bindings: Env }>();

app.get('/api/health', (c) => c.json({ ok: true }));
app.get('/api/ice-servers', async (c) => {
  const response = c.json(await createIceServersResponse(c.env));
  response.headers.set('Cache-Control', 'no-store');
  return response;
});
app.get('/favicon.ico', (c) => c.redirect('/icon.svg', 308));

app.get('/ws', (c) => {
  const upgrade = c.req.header('Upgrade');
  if (upgrade !== 'websocket') {
    return c.text('Expected WebSocket', 426);
  }

  const room = normalizeRoom(c.req.query('room'));
  const roomId = c.env.ROOMS.idFromName(room);
  return c.env.ROOMS.get(roomId).fetch(c.req.raw);
});

app.notFound((c) => c.env.ASSETS.fetch(c.req.raw));

export default app;

export class RoomDurableObject {
  private peers = new Map<string, Peer>();

  constructor(private state: DurableObjectState, private env: Env) {}

  async fetch(request: Request) {
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Expected WebSocket', { status: 426 });
    }

    const pair = new WebSocketPair();
    const [client, workerSocket] = Object.values(pair);
    this.acceptSocket(workerSocket);

    return new Response(null, {
      status: 101,
      webSocket: client
    });
  }

  private acceptSocket(socket: WebSocket) {
    const peerId = createPeerId();
    socket.accept();
    this.send(socket, { type: 'hello', peerId });

    socket.addEventListener('message', (event) => {
      const message = parseMessage(event.data);
      if (!message) {
        this.send(socket, { type: 'error', message: 'Invalid message' });
        return;
      }

      if (message.type === 'join') {
        this.peers.set(peerId, {
          peerId,
          socket,
          deviceName: normalizeDeviceName(message.deviceName),
          deviceType: normalizeDeviceType(message.deviceType),
          joinedAt: Date.now()
        });
        this.send(socket, { type: 'joined', peerId });
        this.broadcastPeers();
        return;
      }

      const peer = this.peers.get(peerId);
      if (!peer) {
        this.send(socket, { type: 'error', message: 'Join before sending messages' });
        return;
      }

      if (message.type === 'rename') {
        peer.deviceName = normalizeDeviceName(message.deviceName);
        this.broadcastPeers();
        return;
      }

      if (message.type === 'signal') {
        const target = message.target ? this.peers.get(message.target) : undefined;
        if (!target) {
          this.send(socket, { type: 'error', message: 'Target device is offline' });
          return;
        }

        this.send(target.socket, {
          type: 'signal',
          from: this.peerSummary(peer),
          data: message.data
        });
        return;
      }

      if (message.type === 'ping') {
        this.send(socket, { type: 'pong', sentAt: Date.now() });
      }
    });

    const close = () => {
      this.peers.delete(peerId);
      this.broadcastPeers();
    };

    socket.addEventListener('close', close);
    socket.addEventListener('error', close);
  }

  private broadcastPeers() {
    const peers = [...this.peers.values()].map((peer) => this.peerSummary(peer));
    for (const peer of this.peers.values()) {
      this.send(peer.socket, { type: 'peers-update', peers, selfId: peer.peerId });
    }
  }

  private peerSummary(peer: Peer) {
    return {
      peerId: peer.peerId,
      deviceName: peer.deviceName,
      deviceType: peer.deviceType,
      joinedAt: peer.joinedAt
    };
  }

  private send(socket: WebSocket, data: unknown) {
    try {
      socket.send(JSON.stringify(data));
    } catch {}
  }
}

function parseMessage(data: string | ArrayBuffer): ClientMessage | null {
  if (typeof data !== 'string') {
    return null;
  }

  try {
    const parsed = JSON.parse(data) as ClientMessage;
    return parsed && typeof parsed.type === 'string' ? parsed : null;
  } catch {
    return null;
  }
}

function normalizeRoom(room?: string) {
  const value = room?.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48);
  return value || 'default';
}

function normalizeDeviceName(name?: string) {
  return name?.replace(/\s+/g, ' ').trim().slice(0, 48) || 'Unnamed device';
}

function normalizeDeviceType(deviceType?: DeviceType): DeviceType {
  return ['desktop', 'mobile', 'tablet', 'unknown'].includes(deviceType ?? '') ? (deviceType as DeviceType) : 'unknown';
}

function createPeerId() {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes, (byte) => byte.toString(36).padStart(2, '0')).join('').slice(0, 10);
}

async function createIceServersResponse(env: Env) {
  const fallback = { source: 'fallback', iceServers: fallbackIceServers };
  if (!env.TURN_KEY_ID || !env.TURN_KEY_API_TOKEN) {
    return fallback;
  }

  try {
    const response = await fetch(
      `https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(env.TURN_KEY_ID)}/credentials/generate-ice-servers`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.TURN_KEY_API_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ ttl: getTurnCredentialTtl(env) })
      }
    );

    if (!response.ok) {
      console.warn(`TURN credential request failed: ${response.status}`);
      return fallback;
    }

    const data = (await response.json()) as { iceServers?: unknown };
    const iceServers = normalizeIceServers(data.iceServers);
    return iceServers.length ? { source: 'cloudflare-turn', iceServers } : fallback;
  } catch (error) {
    console.warn('TURN credential request failed', error);
    return fallback;
  }
}

function getTurnCredentialTtl(env: Env) {
  const ttl = Number(env.TURN_CREDENTIAL_TTL ?? 21600);
  if (!Number.isFinite(ttl)) {
    return 21600;
  }

  return Math.min(Math.max(Math.round(ttl), 60), 86400);
}

function normalizeIceServers(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map(normalizeIceServer).filter((server): server is IceServer => Boolean(server));
}

function normalizeIceServer(value: unknown): IceServer | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const candidate = value as { urls?: unknown; username?: unknown; credential?: unknown };
  const urls = (Array.isArray(candidate.urls) ? candidate.urls : [candidate.urls])
    .filter((url): url is string => typeof url === 'string')
    .filter(isBrowserSupportedIceUrl);

  if (urls.length === 0) {
    return null;
  }

  return {
    urls: urls.length === 1 ? urls[0] : urls,
    ...(typeof candidate.username === 'string' ? { username: candidate.username } : {}),
    ...(typeof candidate.credential === 'string' ? { credential: candidate.credential } : {})
  };
}

function isBrowserSupportedIceUrl(url: string) {
  const path = url.split('?')[0];
  return path.split(':').at(-1) !== '53';
}

const fallbackIceServers: IceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }];
