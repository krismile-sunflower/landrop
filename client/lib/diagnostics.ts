import type { Peer } from '@/lib/types';
import type { IceServerSource } from '@/lib/ice';

export type IceDiagnosticSource = IceServerSource | 'loading';

export type SignalDiagnosticState = 'connecting' | 'connected' | 'disconnected';

export type PeerDiagnostic = {
  peerId: string;
  deviceName: string;
  connectionState: RTCPeerConnectionState;
  iceConnectionState: RTCIceConnectionState;
  channelState: RTCDataChannelState | 'none';
  updatedAt: number;
};

export type PeerDiagnosticPatch = Partial<Omit<PeerDiagnostic, 'peerId' | 'deviceName' | 'updatedAt'>>;

export function createPeerDiagnostic(peer: Peer): PeerDiagnostic {
  return {
    peerId: peer.peerId,
    deviceName: peer.deviceName,
    connectionState: 'new',
    iceConnectionState: 'new',
    channelState: 'none',
    updatedAt: Date.now()
  };
}

export function isPeerDiagnosticFailed(peer: PeerDiagnostic) {
  return (
    peer.connectionState === 'failed' ||
    peer.connectionState === 'disconnected' ||
    peer.iceConnectionState === 'failed' ||
    peer.iceConnectionState === 'disconnected'
  );
}
