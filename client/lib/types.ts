export type DeviceType = 'desktop' | 'mobile' | 'tablet' | 'unknown';

export type Peer = {
  peerId: string;
  deviceName: string;
  deviceType: DeviceType;
  joinedAt: number;
};

export type ReceivedItem =
  | {
      id: string;
      type: 'text';
      from: Peer;
      data: string;
      sentAt: number;
    }
  | {
      id: string;
      type: 'file';
      from: Peer;
      blob: Blob;
      url: string;
      fileName: string;
      size: number;
      mimeType: string;
      sentAt: number;
    };

export type TransferLog = {
  id: string;
  direction: 'sent' | 'received' | 'system';
  title: string;
  detail: string;
  status: 'ok' | 'pending' | 'error';
  createdAt: number;
};

export type ServerMessage =
  | { type: 'hello'; peerId: string; room?: string }
  | { type: 'joined'; peerId: string; room?: string }
  | { type: 'peers-update'; peers: Peer[]; selfId: string }
  | { type: 'signal'; from: Peer; data: RtcSignal }
  | { type: 'text'; from: Peer; data: string; sentAt: number }
  | { type: 'file-notify'; from: Peer; fileId: string; fileName: string; size: number; mimeType: string; sentAt: number }
  | { type: 'error'; message: string }
  | { type: 'pong'; sentAt: number };

export type RtcSignal =
  | { type: 'offer'; description: RTCSessionDescriptionInit }
  | { type: 'answer'; description: RTCSessionDescriptionInit }
  | { type: 'candidate'; candidate: RTCIceCandidateInit };
