import { Hono } from 'hono';

type DeviceType = 'desktop' | 'mobile' | 'tablet' | 'unknown';

type Env = {
  ROOMS: DurableObjectNamespace;
  ASSETS: Fetcher;
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
    const [client, server] = Object.values(pair);
    this.acceptSocket(server);

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
