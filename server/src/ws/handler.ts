import type { Server } from 'node:http';
import { nanoid } from 'nanoid';
import { WebSocket, WebSocketServer } from 'ws';

type DeviceType = 'desktop' | 'mobile' | 'tablet' | 'unknown';

type Peer = {
  peerId: string;
  room: string;
  socket: WebSocket;
  deviceName: string;
  deviceType: DeviceType;
  joinedAt: number;
};

type ClientMessage =
  | { type: 'join'; deviceName?: string; deviceType?: DeviceType; room?: string }
  | { type: 'rename'; deviceName?: string }
  | { type: 'signal'; target?: string; data?: unknown }
  | { type: 'text'; target?: string; data?: string }
  | { type: 'file-notify'; target?: string; fileId?: string; fileName?: string; size?: number; mimeType?: string }
  | { type: 'ping' };

const rooms = new Map<string, Map<string, Peer>>();

function getRoom(roomId: string) {
  let room = rooms.get(roomId);
  if (!room) {
    room = new Map();
    rooms.set(roomId, room);
  }
  return room;
}

function sendJson(socket: WebSocket, data: unknown) {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(data));
  }
}

function peerSummary(peer: Peer) {
  return {
    peerId: peer.peerId,
    deviceName: peer.deviceName,
    deviceType: peer.deviceType,
    joinedAt: peer.joinedAt
  };
}

function broadcastPeers(roomId: string) {
  const room = getRoom(roomId);
  const peers = [...room.values()].map(peerSummary);

  for (const peer of room.values()) {
    sendJson(peer.socket, { type: 'peers-update', peers, selfId: peer.peerId });
  }
}

function parseMessage(data: WebSocket.RawData): ClientMessage | null {
  try {
    const parsed = JSON.parse(data.toString()) as ClientMessage;
    return parsed && typeof parsed.type === 'string' ? parsed : null;
  } catch {
    return null;
  }
}

function normalizeRoom(room?: string) {
  const value = room?.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 32);
  return value || process.env.LANDROP_ROOM || 'default';
}

function normalizeDeviceName(name?: string) {
  return name?.replace(/\s+/g, ' ').trim().slice(0, 48) || 'Unnamed device';
}

function normalizeDeviceType(deviceType?: DeviceType): DeviceType {
  return ['desktop', 'mobile', 'tablet', 'unknown'].includes(deviceType ?? '') ? (deviceType as DeviceType) : 'unknown';
}

function removePeer(peer: Peer | null) {
  if (!peer) {
    return;
  }

  const room = rooms.get(peer.room);
  if (!room) {
    return;
  }

  room.delete(peer.peerId);
  if (room.size === 0) {
    rooms.delete(peer.room);
    return;
  }

  broadcastPeers(peer.room);
}

export function attachWebSocketServer(server: Server) {
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (socket, request) => {
    const requestUrl = new URL(request.url ?? '/ws', `http://${request.headers.host ?? 'localhost'}`);
    const peerId = nanoid(8);
    let peer: Peer | null = null;
    let alive = true;

    sendJson(socket, {
      type: 'hello',
      peerId,
      room: normalizeRoom(requestUrl.searchParams.get('room') ?? undefined)
    });

    socket.on('pong', () => {
      alive = true;
    });

    socket.on('message', (data) => {
      const message = parseMessage(data);
      if (!message) {
        sendJson(socket, { type: 'error', message: 'Invalid message' });
        return;
      }

      if (message.type === 'join') {
        if (peer) {
          removePeer(peer);
        }

        const roomId = normalizeRoom(message.room ?? requestUrl.searchParams.get('room') ?? undefined);
        peer = {
          peerId,
          room: roomId,
          socket,
          deviceName: normalizeDeviceName(message.deviceName),
          deviceType: normalizeDeviceType(message.deviceType),
          joinedAt: Date.now()
        };

        getRoom(roomId).set(peerId, peer);
        sendJson(socket, { type: 'joined', peerId, room: roomId });
        broadcastPeers(roomId);
        return;
      }

      if (!peer) {
        sendJson(socket, { type: 'error', message: 'Join before sending messages' });
        return;
      }

      if (message.type === 'rename') {
        peer.deviceName = normalizeDeviceName(message.deviceName);
        broadcastPeers(peer.room);
        return;
      }

      if (message.type === 'text') {
        const target = message.target ? rooms.get(peer.room)?.get(message.target) : null;
        if (!target || typeof message.data !== 'string') {
          sendJson(socket, { type: 'error', message: 'Target device is offline' });
          return;
        }

        sendJson(target.socket, {
          type: 'text',
          from: peerSummary(peer),
          data: message.data.slice(0, 20000),
          sentAt: Date.now()
        });
        return;
      }

      if (message.type === 'signal') {
        const target = message.target ? rooms.get(peer.room)?.get(message.target) : null;
        if (!target) {
          sendJson(socket, { type: 'error', message: 'Target device is offline' });
          return;
        }

        sendJson(target.socket, {
          type: 'signal',
          from: peerSummary(peer),
          data: message.data
        });
        return;
      }

      if (message.type === 'file-notify') {
        const target = message.target ? rooms.get(peer.room)?.get(message.target) : null;
        if (!target || !message.fileId || !message.fileName) {
          sendJson(socket, { type: 'error', message: 'Target device is offline' });
          return;
        }

        sendJson(target.socket, {
          type: 'file-notify',
          from: peerSummary(peer),
          fileId: message.fileId,
          fileName: message.fileName,
          size: message.size ?? 0,
          mimeType: message.mimeType ?? 'application/octet-stream',
          sentAt: Date.now()
        });
        return;
      }

      if (message.type === 'ping') {
        sendJson(socket, { type: 'pong', sentAt: Date.now() });
      }
    });

    socket.on('close', () => {
      removePeer(peer);
      peer = null;
    });

    const heartbeat = setInterval(() => {
      if (socket.readyState !== WebSocket.OPEN) {
        clearInterval(heartbeat);
        return;
      }

      if (!alive) {
        socket.terminate();
        clearInterval(heartbeat);
        return;
      }

      alive = false;
      socket.ping();
    }, 30000);

    heartbeat.unref();
  });
}
