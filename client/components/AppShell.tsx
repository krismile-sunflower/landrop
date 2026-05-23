'use client';

import {
  Activity,
  Check,
  Copy,
  Download,
  FileUp,
  Inbox,
  Laptop,
  Link,
  MessageSquareText,
  Monitor,
  QrCode,
  Radar,
  RefreshCcw,
  Send,
  Smartphone,
  Tablet,
  User,
  X
} from 'lucide-react';
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { copyText } from '@/lib/clipboard';
import { defaultDeviceName, detectDeviceType } from '@/lib/device';
import { createClientId } from '@/lib/id';
import { useTranslation } from '@/lib/i18n';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import type { DeviceType, Peer, ReceivedItem, RtcSignal, ServerMessage, TransferLog } from '@/lib/types';
import { formatBytes } from '@/lib/upload';

type ConnectionState = 'connecting' | 'connected' | 'disconnected';
type ActiveDialog = { kind: 'text' | 'file'; peer: Peer } | null;
type PeerEntry = { peer: Peer; pc: RTCPeerConnection; channel?: RTCDataChannel };
type DataMessage =
  | { kind: 'text'; id: string; data: string; sentAt: number }
  | { kind: 'file-meta'; transferId: string; fileName: string; size: number; mimeType: string; chunks: number; sentAt: number }
  | { kind: 'file-chunk'; transferId: string; index: number; size: number }
  | { kind: 'file-end'; transferId: string }
  | { kind: 'file-ack'; transferId: string; receivedChunks: number; receivedBytes: number; done: boolean };
type IncomingTransfer = {
  from: Peer;
  fileName: string;
  size: number;
  mimeType: string;
  chunks: BlobPart[];
  expectedChunks: number;
  received: number;
  receivedChunks: number;
  receivedIndexes: Set<number>;
  pendingChunks: number;
  ended: boolean;
  sentAt: number;
};
type PendingChunk = { transferId: string; index: number; size: number };
type FileAckState = {
  receivedChunks: number;
  receivedBytes: number;
  done: boolean;
  waiters: Set<() => void>;
};

const storageKey = 'landrop-device-name';
const fileChunkSize = 8 * 1024;
const chunkAckWindow = 16;
const maxBufferedAmount = 256 * 1024;
const lowBufferedAmount = 64 * 1024;
const transferTimeoutMs = 30000;

export default function AppShell() {
  const { t } = useTranslation();
  const [connectionState, setConnectionState] = useState<ConnectionState>('connecting');
  const [deviceName, setDeviceName] = useState('');
  const [selfId, setSelfId] = useState('');
  const [room, setRoom] = useState('default');
  const [peers, setPeers] = useState<Peer[]>([]);
  const [readyPeerIds, setReadyPeerIds] = useState<string[]>([]);
  const [qrCode, setQrCode] = useState('');
  const [shareUrl, setShareUrl] = useState('');
  const [receivedItems, setReceivedItems] = useState<ReceivedItem[]>([]);
  const [logs, setLogs] = useState<TransferLog[]>([]);
  const [activeDialog, setActiveDialog] = useState<ActiveDialog>(null);
  const [textDraft, setTextDraft] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [selectedPeerId, setSelectedPeerId] = useState<string | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const connectionsRef = useRef(new Map<string, PeerEntry>());
  const incomingTransfersRef = useRef(new Map<string, IncomingTransfer>());
  const activeTransferByPeerRef = useRef(new Map<string, string>());
  const pendingChunkByPeerRef = useRef(new Map<string, PendingChunk>());
  const fileAckRef = useRef(new Map<string, FileAckState>());
  const objectUrlsRef = useRef<string[]>([]);
  const selfIdRef = useRef('');

  const readyPeerSet = useMemo(() => new Set(readyPeerIds), [readyPeerIds]);
  const visiblePeers = useMemo(() => peers.filter((peer) => peer.peerId !== selfId), [peers, selfId]);
  const selfPeer = useMemo(() => peers.find((peer) => peer.peerId === selfId), [peers, selfId]);

  const pushLog = useCallback((log: Omit<TransferLog, 'id' | 'createdAt'>) => {
    setLogs((current) => [
      {
        id: createClientId(),
        createdAt: Date.now(),
        ...log
      },
      ...current
    ].slice(0, 12));
  }, []);

  const updateReadyPeer = useCallback((peerId: string, ready: boolean) => {
    setReadyPeerIds((current) => {
      const next = new Set(current);
      if (ready) {
        next.add(peerId);
      } else {
        next.delete(peerId);
      }
      return [...next];
    });
  }, []);

  const sendSignal = useCallback((target: string, data: RtcSignal) => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: 'signal', target, data }));
    }
  }, []);

  const sendFileAck = useCallback((peerId: string, transferId: string, transfer: IncomingTransfer, done: boolean) => {
    const channel = connectionsRef.current.get(peerId)?.channel;
    if (channel?.readyState === 'open') {
      channel.send(
        JSON.stringify({
          kind: 'file-ack',
          transferId,
          receivedChunks: transfer.receivedChunks,
          receivedBytes: transfer.received,
          done
        } satisfies DataMessage)
      );
    }
  }, []);

  const completeFileTransfer = useCallback((peer: Peer, transferId: string) => {
    const transfer = incomingTransfersRef.current.get(transferId);
    if (
      !transfer ||
      transfer.pendingChunks > 0 ||
      transfer.receivedChunks < transfer.expectedChunks ||
      transfer.received < transfer.size
    ) {
      return;
    }

    const blob = new Blob(transfer.chunks, { type: transfer.mimeType || 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    objectUrlsRef.current.push(url);
    incomingTransfersRef.current.delete(transferId);
    activeTransferByPeerRef.current.delete(peer.peerId);
    setLogs((current) =>
      current.filter(
        (log) =>
          !(log.status === 'pending' && log.title === t('transfer.receiving', { name: transfer.fileName }))
      )
    );
    setReceivedItems((current) => [
      {
        id: createClientId(),
        type: 'file',
        from: transfer.from,
        blob,
        url,
        fileName: transfer.fileName,
        size: transfer.size,
        mimeType: transfer.mimeType,
        sentAt: transfer.sentAt
      },
      ...current
    ]);
    pushLog({
      direction: 'received',
      title: t('transfer.fileFrom', { name: peer.deviceName }),
      detail: `${transfer.fileName} - ${formatBytes(transfer.size)}`,
      status: 'ok'
    });
    sendFileAck(peer.peerId, transferId, transfer, true);
  }, [pushLog, sendFileAck, t]);

  const appendFileChunk = useCallback((peer: Peer, pendingChunk: PendingChunk, chunk: BlobPart, byteLength: number) => {
    const transfer = incomingTransfersRef.current.get(pendingChunk.transferId);
    if (!transfer || transfer.receivedIndexes.has(pendingChunk.index) || pendingChunk.size !== byteLength) {
      return;
    }

    transfer.chunks[pendingChunk.index] = chunk;
    transfer.received += byteLength;
    transfer.receivedChunks += 1;
    transfer.receivedIndexes.add(pendingChunk.index);
    sendFileAck(peer.peerId, pendingChunk.transferId, transfer, false);
    completeFileTransfer(peer, pendingChunk.transferId);
  }, [completeFileTransfer, sendFileAck]);

  const appendBlobChunk = useCallback((peer: Peer, blob: Blob) => {
    const pendingChunk = pendingChunkByPeerRef.current.get(peer.peerId);
    if (!pendingChunk) {
      return;
    }
    pendingChunkByPeerRef.current.delete(peer.peerId);

    const transfer = incomingTransfersRef.current.get(pendingChunk.transferId);
    if (!transfer) {
      return;
    }

    transfer.pendingChunks += 1;
    void blob.arrayBuffer()
      .then((buffer) => appendFileChunk(peer, pendingChunk, buffer, buffer.byteLength))
      .finally(() => {
        const latest = incomingTransfersRef.current.get(pendingChunk.transferId);
        if (latest) {
          latest.pendingChunks = Math.max(0, latest.pendingChunks - 1);
          completeFileTransfer(peer, pendingChunk.transferId);
        }
      });
  }, [appendFileChunk, completeFileTransfer]);

  const receiveDataMessage = useCallback((peer: Peer, data: unknown) => {
    if (typeof data === 'string') {
      let message: DataMessage;
      try {
        message = JSON.parse(data) as DataMessage;
      } catch {
        return;
      }

      if (message.kind === 'text') {
        setReceivedItems((current) => [
          {
            id: message.id,
            type: 'text',
            from: peer,
            data: message.data,
            sentAt: message.sentAt
          },
          ...current
        ]);
        pushLog({
          direction: 'received',
          title: t('transfer.textFrom', { name: peer.deviceName }),
          detail: message.data.slice(0, 80),
          status: 'ok'
        });
        return;
      }

      if (message.kind === 'file-meta') {
        incomingTransfersRef.current.set(message.transferId, {
          from: peer,
          fileName: message.fileName,
          size: message.size,
          mimeType: message.mimeType,
          chunks: [],
          expectedChunks: message.chunks,
          received: 0,
          receivedChunks: 0,
          receivedIndexes: new Set(),
          pendingChunks: 0,
          ended: false,
          sentAt: message.sentAt
        });
        activeTransferByPeerRef.current.set(peer.peerId, message.transferId);
        pushLog({
          direction: 'received',
          title: t('transfer.receiving', { name: message.fileName }),
          detail: t('transfer.sizeFrom', { size: formatBytes(message.size), name: peer.deviceName }),
          status: 'pending'
        });
        return;
      }

      if (message.kind === 'file-chunk') {
        if (message.size <= 0 || message.index < 0) {
          return;
        }
        pendingChunkByPeerRef.current.set(peer.peerId, {
          transferId: message.transferId,
          index: message.index,
          size: message.size
        });
        return;
      }

      if (message.kind === 'file-end') {
        const transfer = incomingTransfersRef.current.get(message.transferId);
        if (!transfer) {
          return;
        }

        transfer.ended = true;
        completeFileTransfer(peer, message.transferId);
        return;
      }

      if (message.kind === 'file-ack') {
        const ackState = fileAckRef.current.get(message.transferId);
        if (!ackState) {
          return;
        }

        ackState.receivedChunks = message.receivedChunks;
        ackState.receivedBytes = message.receivedBytes;
        ackState.done = message.done;
        for (const resolve of ackState.waiters) {
          resolve();
        }
        ackState.waiters.clear();
        return;
      }

      return;
    }

    if (data instanceof Blob) {
      appendBlobChunk(peer, data);
      return;
    }

    if (data instanceof ArrayBuffer) {
      const pendingChunk = pendingChunkByPeerRef.current.get(peer.peerId);
      if (!pendingChunk) {
        return;
      }
      pendingChunkByPeerRef.current.delete(peer.peerId);
      appendFileChunk(peer, pendingChunk, data, data.byteLength);
      return;
    }

    if (ArrayBuffer.isView(data)) {
      const pendingChunk = pendingChunkByPeerRef.current.get(peer.peerId);
      if (!pendingChunk) {
        return;
      }
      pendingChunkByPeerRef.current.delete(peer.peerId);
      const view = data as ArrayBufferView;
      const buffer = copyArrayBufferView(view);
      appendFileChunk(peer, pendingChunk, buffer, buffer.byteLength);
    }
  }, [appendBlobChunk, appendFileChunk, completeFileTransfer, pushLog, t]);

  const wireChannel = useCallback((peer: Peer, channel: RTCDataChannel) => {
    channel.binaryType = 'arraybuffer';
    channel.addEventListener('open', () => updateReadyPeer(peer.peerId, true));
    channel.addEventListener('close', () => updateReadyPeer(peer.peerId, false));
    channel.addEventListener('error', () => updateReadyPeer(peer.peerId, false));
    channel.addEventListener('message', (event) => receiveDataMessage(peer, event.data));
  }, [receiveDataMessage, updateReadyPeer]);

  const ensurePeerConnection = useCallback((peer: Peer) => {
    const existing = connectionsRef.current.get(peer.peerId);
    if (existing) {
      existing.peer = peer;
      return existing;
    }

    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    });
    const entry: PeerEntry = { peer, pc };
    connectionsRef.current.set(peer.peerId, entry);

    pc.addEventListener('icecandidate', (event) => {
      if (event.candidate) {
        sendSignal(peer.peerId, { type: 'candidate', candidate: event.candidate.toJSON() });
      }
    });

    pc.addEventListener('connectionstatechange', () => {
      if (['closed', 'disconnected', 'failed'].includes(pc.connectionState)) {
        updateReadyPeer(peer.peerId, false);
      }
    });

    pc.addEventListener('datachannel', (event) => {
      entry.channel = event.channel;
      wireChannel(peer, event.channel);
    });

    return entry;
  }, [sendSignal, updateReadyPeer, wireChannel]);

  const createOffer = useCallback(async (peer: Peer) => {
    const entry = ensurePeerConnection(peer);
    if (!entry.channel) {
      entry.channel = entry.pc.createDataChannel('landrop');
      wireChannel(peer, entry.channel);
    }

    const offer = await entry.pc.createOffer();
    await entry.pc.setLocalDescription(offer);
    sendSignal(peer.peerId, { type: 'offer', description: offer });
  }, [ensurePeerConnection, sendSignal, wireChannel]);

  const handleSignal = useCallback(async (from: Peer, signal: RtcSignal) => {
    const entry = ensurePeerConnection(from);

    if (signal.type === 'offer') {
      await entry.pc.setRemoteDescription(signal.description);
      const answer = await entry.pc.createAnswer();
      await entry.pc.setLocalDescription(answer);
      sendSignal(from.peerId, { type: 'answer', description: answer });
      return;
    }

    if (signal.type === 'answer') {
      if (!entry.pc.currentRemoteDescription) {
        await entry.pc.setRemoteDescription(signal.description);
      }
      return;
    }

    if (signal.type === 'candidate') {
      await entry.pc.addIceCandidate(signal.candidate);
    }
  }, [ensurePeerConnection, sendSignal]);

  const connect = useCallback((name: string) => {
    if (!name) {
      return;
    }

    socketRef.current?.close();
    for (const entry of connectionsRef.current.values()) {
      entry.pc.close();
    }
    connectionsRef.current.clear();
    setReadyPeerIds([]);
    setConnectionState('connecting');

    const targetRoom = ensureRoomInUrl();
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = new WebSocket(`${protocol}//${window.location.host}/ws?room=${encodeURIComponent(targetRoom)}`);
    socketRef.current = socket;

    socket.addEventListener('open', () => {
      setConnectionState('connected');
      socket.send(
        JSON.stringify({
          type: 'join',
          deviceName: name,
          deviceType: detectDeviceType()
        })
      );
    });

    socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data) as ServerMessage;

      if (message.type === 'hello') {
        selfIdRef.current = message.peerId;
        setSelfId(message.peerId);
        setRoom(targetRoom);
        return;
      }

      if (message.type === 'joined') {
        selfIdRef.current = message.peerId;
        setSelfId(message.peerId);
        setRoom(targetRoom);
        return;
      }

      if (message.type === 'peers-update') {
        selfIdRef.current = message.selfId;
        setPeers(message.peers);
        setSelfId(message.selfId);

        const currentIds = new Set(message.peers.map((peer) => peer.peerId));
        for (const [peerId, entry] of connectionsRef.current) {
          if (!currentIds.has(peerId)) {
            entry.pc.close();
            connectionsRef.current.delete(peerId);
            updateReadyPeer(peerId, false);
          }
        }

        for (const peer of message.peers) {
          if (peer.peerId === message.selfId) {
            continue;
          }

          ensurePeerConnection(peer);
          if (message.selfId < peer.peerId && !connectionsRef.current.get(peer.peerId)?.channel) {
            void createOffer(peer).catch((error) => {
              pushLog({
                direction: 'system',
                title: t('errors.connectionFailed'),
                detail: error instanceof Error ? error.message : t('errors.unableCreateOffer'),
                status: 'error'
              });
            });
          }
        }
        return;
      }

      if (message.type === 'signal') {
        void handleSignal(message.from, message.data).catch((error) => {
          pushLog({
            direction: 'system',
            title: t('errors.signalFailed'),
            detail: error instanceof Error ? error.message : t('errors.unableProcessSignal'),
            status: 'error'
          });
        });
        return;
      }

      if (message.type === 'error') {
        pushLog({
          direction: 'system',
          title: t('errors.messageFailed'),
          detail: message.message,
          status: 'error'
        });
      }
    });

    socket.addEventListener('close', () => {
      setConnectionState('disconnected');
      setReadyPeerIds([]);
    });

    socket.addEventListener('error', () => {
      setConnectionState('disconnected');
    });
  }, [createOffer, ensurePeerConnection, handleSignal, pushLog, t, updateReadyPeer]);

  useEffect(() => {
    const connections = connectionsRef.current;
    const objectUrls = objectUrlsRef.current;
    const timer = window.setTimeout(() => {
      const name = localStorage.getItem(storageKey) || defaultDeviceName(t);
      ensureRoomInUrl();
      const url = window.location.href;
      setDeviceName(name);
      setShareUrl(url);
      connect(name);

      void import('qrcode')
        .then((QRCode) => QRCode.toDataURL(url, { errorCorrectionLevel: 'M', margin: 1, width: 320 }))
        .then(setQrCode)
        .catch(() => setQrCode(''));
    }, 0);

    return () => {
      window.clearTimeout(timer);
      socketRef.current?.close();
      for (const entry of connections.values()) {
        entry.pc.close();
      }
      for (const url of objectUrls) {
        URL.revokeObjectURL(url);
      }
    };
  }, [connect, t]);

  const renameDevice = useCallback((value: string) => {
    const nextName = value.slice(0, 48);
    setDeviceName(nextName);
    localStorage.setItem(storageKey, nextName);

    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: 'rename', deviceName: nextName }));
    }
  }, []);

  const sendText = useCallback((event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!activeDialog || activeDialog.kind !== 'text' || !textDraft.trim()) {
      return;
    }

    const channel = connectionsRef.current.get(activeDialog.peer.peerId)?.channel;
    if (!channel || channel.readyState !== 'open') {
      pushLog({
        direction: 'system',
        title: t('errors.deviceNotReady'),
        detail: t('errors.waitForPeerLink'),
        status: 'error'
      });
      return;
    }

    const text = textDraft.trim();
    channel.send(JSON.stringify({ kind: 'text', id: createClientId(), data: text, sentAt: Date.now() } satisfies DataMessage));
    pushLog({
      direction: 'sent',
      title: t('transfer.textTo', { name: activeDialog.peer.deviceName }),
      detail: text.slice(0, 80),
      status: 'ok'
    });
    setTextDraft('');
    setActiveDialog(null);
  }, [activeDialog, pushLog, textDraft, t]);

  const sendFile = useCallback(async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!activeDialog || activeDialog.kind !== 'file' || !selectedFile || isUploading) {
      return;
    }

    const channel = connectionsRef.current.get(activeDialog.peer.peerId)?.channel;
    if (!channel || channel.readyState !== 'open') {
      pushLog({
        direction: 'system',
        title: t('errors.deviceNotReady'),
        detail: t('errors.waitForPeerLink'),
        status: 'error'
      });
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);

    const transferId = createClientId();

    try {
      const totalChunks = Math.ceil(selectedFile.size / fileChunkSize);
      const ackState: FileAckState = {
        receivedChunks: 0,
        receivedBytes: 0,
        done: false,
        waiters: new Set()
      };
      fileAckRef.current.set(transferId, ackState);
      channel.send(
        JSON.stringify({
          kind: 'file-meta',
          transferId,
          fileName: selectedFile.name,
          size: selectedFile.size,
          mimeType: selectedFile.type || 'application/octet-stream',
          chunks: totalChunks,
          sentAt: Date.now()
        } satisfies DataMessage)
      );

      let sent = 0;
      let chunkIndex = 0;
      for (let offset = 0; offset < selectedFile.size; offset += fileChunkSize) {
        await waitForChannelBuffer(channel, t);
        while (chunkIndex - ackState.receivedChunks >= chunkAckWindow && !ackState.done) {
          await waitForNextFileAck(ackState, t);
        }
        if (channel.readyState !== 'open') {
          throw new Error(t('errors.peerLinkClosed'));
        }
        const chunk = selectedFile.slice(offset, Math.min(offset + fileChunkSize, selectedFile.size));
        const buffer = await chunk.arrayBuffer();
        channel.send(
          JSON.stringify({
            kind: 'file-chunk',
            transferId,
            index: chunkIndex,
            size: buffer.byteLength
          } satisfies DataMessage)
        );
        channel.send(buffer);
        sent += buffer.byteLength;
        chunkIndex += 1;
        setUploadProgress(Math.min(99, Math.round((sent / selectedFile.size) * 100)));
      }

      await waitForChannelBuffer(channel, t);
      channel.send(JSON.stringify({ kind: 'file-end', transferId } satisfies DataMessage));
      while (!ackState.done) {
        await waitForNextFileAck(ackState, t);
      }
      setUploadProgress(100);
      pushLog({
        direction: 'sent',
        title: t('transfer.fileTo', { name: activeDialog.peer.deviceName }),
        detail: `${selectedFile.name} - ${formatBytes(selectedFile.size)}`,
        status: 'ok'
      });
      setSelectedFile(null);
      setActiveDialog(null);
    } catch (error) {
      fileAckRef.current.delete(transferId);
      pushLog({
        direction: 'system',
        title: t('errors.sendFailed'),
        detail: error instanceof Error ? error.message : t('errors.unknownError'),
        status: 'error'
      });
    } finally {
      fileAckRef.current.delete(transferId);
      setIsUploading(false);
    }
  }, [activeDialog, isUploading, pushLog, selectedFile, t]);

  const copyShareUrl = useCallback(async () => {
    const didCopy = await copyText(shareUrl || window.location.href);
    if (didCopy) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    }
  }, [shareUrl]);

  return (
    <main className="shell">
      <section className="topbar">
        <div className="brand">
          <div className="brand-mark">
            <Radar aria-hidden="true" size={18} />
          </div>
          <div>
            <p className="eyebrow">{t('app.title')}</p>
            <h1>{t('app.subtitle')}</h1>
          </div>
        </div>
        <div className="status-strip">
          <ConnectionBadge state={connectionState} />
          <label className="name-field">
            <User aria-hidden="true" size={15} />
            <input value={deviceName} onChange={(event) => renameDevice(event.target.value)} aria-label={t('device.name')} />
          </label>
          <button className="icon-button" type="button" onClick={() => connect(deviceName)} aria-label={t('device.reconnect')}>
            <RefreshCcw size={16} />
          </button>
          <LanguageSwitcher />
        </div>
      </section>

      <section className="stage">
        <div className="col col-left">
          <aside className="card share-card">
            <div className="card-head">
              <div>
                <p className="eyebrow">{t('room.joinRoom')}</p>
                <h2>{t('room.roomName')}</h2>
              </div>
              <QrCode aria-hidden="true" size={20} />
            </div>
            <div className="room-meta">
              <span className="label">{t('room.roomName')}</span>
              <span className="value">{room}</span>
            </div>
            <div className="card-body" style={{ paddingTop: 0 }}>
              <div className="qr-frame">
                {qrCode ? <img src={qrCode} alt={t('share.qrCode')} /> : <div className="qr-placeholder">{t('share.qrPlaceholder')}</div>}
              </div>
              <div className="copy-row">
                <Link aria-hidden="true" size={14} />
                <span>{shareUrl || t('share.loadingLink')}</span>
                <button type="button" onClick={copyShareUrl} aria-label={t('share.copyLink')}>
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                </button>
              </div>
              <div className="self-card">
                <span className="label">{t('device.yourDevice')}</span>
                <strong>{selfPeer?.deviceName || deviceName}</strong>
                <small>{selfId ? `id · ${selfId.slice(0, 12)}` : t('device.waitingForId')}</small>
              </div>
            </div>
          </aside>
        </div>

        <div className="col col-center">
          <section className="card radar-card">
            <div className="card-head">
              <div>
                <p className="eyebrow">{t('peers.onlineDevices')}</p>
                <h2>{visiblePeers.length ? t('peers.available', { count: visiblePeers.length }) : t('peers.waitingForPeers')}</h2>
              </div>
              <Radar aria-hidden="true" size={20} />
            </div>
            <RadarStage
              selfPeer={selfPeer ?? null}
              selfName={deviceName}
              peers={visiblePeers}
              readyPeerSet={readyPeerSet}
              selectedPeerId={selectedPeerId}
              onSelectPeer={setSelectedPeerId}
              onSendText={(peer) => {
                setSelectedPeerId(null);
                setActiveDialog({ kind: 'text', peer });
              }}
              onSendFile={(peer) => {
                setSelectedPeerId(null);
                setActiveDialog({ kind: 'file', peer });
              }}
            />
          </section>
        </div>

        <div className="col col-right">
          <section className="card">
            <div className="card-head">
              <div>
                <p className="eyebrow">{t('inbox.incoming')}</p>
                <h2>{receivedItems.length ? t('inbox.items', { count: receivedItems.length }) : t('inbox.noArrivals')}</h2>
              </div>
              <Inbox aria-hidden="true" size={20} />
            </div>
            <div className="card-body list">
              {receivedItems.length ? (
                receivedItems.map((item) => <InboxItem key={item.id} item={item} />)
              ) : (
                <div className="empty-list">
                  <Inbox aria-hidden="true" size={20} />
                  <span>{t('inbox.emptyHint')}</span>
                </div>
              )}
            </div>
          </section>

          <section className="card">
            <div className="card-head">
              <div>
                <p className="eyebrow">{t('log.transferLog')}</p>
                <h2>{t('log.recentActivity')}</h2>
              </div>
              <Activity aria-hidden="true" size={20} />
            </div>
            <div className="card-body list">
              {logs.length ? (
                logs.map((log) => <LogItem key={log.id} log={log} />)
              ) : (
                <div className="empty-list">
                  <Activity aria-hidden="true" size={20} />
                  <span>{t('log.emptyHint')}</span>
                </div>
              )}
            </div>
          </section>
        </div>
      </section>

      {activeDialog?.kind === 'text' ? (
        <Dialog title={t('dialog.sendTextTitle', { name: activeDialog.peer.deviceName })} onClose={() => setActiveDialog(null)}>
          <form className="dialog-form" onSubmit={sendText}>
            <textarea
              value={textDraft}
              onChange={(event) => setTextDraft(event.target.value)}
              placeholder={t('dialog.textPlaceholder')}
              autoFocus
            />
            <button className="primary-button" type="submit" disabled={!textDraft.trim()}>
              <Send size={18} />
              {t('dialog.sendTextBtn')}
            </button>
          </form>
        </Dialog>
      ) : null}

      {activeDialog?.kind === 'file' ? (
        <Dialog title={t('dialog.sendFileTitle', { name: activeDialog.peer.deviceName })} onClose={() => setActiveDialog(null)}>
          <form className="dialog-form" onSubmit={sendFile}>
            <label className="drop-zone">
              <FileUp aria-hidden="true" size={28} />
              <input type="file" onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)} />
              <strong>{selectedFile?.name || t('dialog.chooseFile')}</strong>
              <span>{selectedFile ? formatBytes(selectedFile.size) : t('dialog.fileHint')}</span>
            </label>
            {isUploading ? (
              <div className="progress">
                <span style={{ width: `${uploadProgress}%` }} />
              </div>
            ) : null}
            <button className="primary-button" type="submit" disabled={!selectedFile || isUploading}>
              <FileUp size={18} />
              {isUploading ? t('dialog.sendingProgress', { progress: uploadProgress }) : t('dialog.sendFileBtn')}
            </button>
          </form>
        </Dialog>
      ) : null}
    </main>
  );
}

function ConnectionBadge({ state }: { state: ConnectionState }) {
  const { t } = useTranslation();
  return (
    <div className={`connection ${state}`}>
      <span className="dot" aria-hidden="true" />
      <span>{t(`connection.${state}`)}</span>
    </div>
  );
}

type RadarStageProps = {
  selfPeer: Peer | null;
  selfName: string;
  peers: Peer[];
  readyPeerSet: Set<string>;
  selectedPeerId: string | null;
  onSelectPeer: (peerId: string | null) => void;
  onSendText: (peer: Peer) => void;
  onSendFile: (peer: Peer) => void;
};

function RadarStage({
  selfPeer,
  selfName,
  peers,
  readyPeerSet,
  selectedPeerId,
  onSelectPeer,
  onSendText,
  onSendFile
}: RadarStageProps) {
  const { t } = useTranslation();
  const positions = useMemo(() => layoutPeers(peers), [peers]);

  return (
    <div
      className="radar-stage"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onSelectPeer(null);
        }
      }}
    >
      <div className={`radar ${peers.length ? '' : 'idle'}`}>
        <span className="ring" />
        <span className="crosshair" />
        <span className="sweep" />

        <div className="self-node" aria-label={t('device.yourDevice')}>
          {deviceIcon(selfPeer?.deviceType ?? 'desktop', 24)}
        </div>
        <div className="self-label">
          <strong>{selfPeer?.deviceName || selfName || t('device.device')}</strong>
          <small>{t('device.yourDevice')}</small>
        </div>

        {peers.map((peer) => {
          const pos = positions.get(peer.peerId);
          if (!pos) return null;
          const ready = readyPeerSet.has(peer.peerId);
          const selected = selectedPeerId === peer.peerId;
          return (
            <div
              key={peer.peerId}
              style={{ left: `${pos.x * 100}%`, top: `${pos.y * 100}%` }}
              className="peer-wrap"
            >
              <button
                type="button"
                className={`peer-node ${ready ? 'ready' : 'pending'}`}
                onClick={(event) => {
                  event.stopPropagation();
                  if (!ready) return;
                  onSelectPeer(selected ? null : peer.peerId);
                }}
                aria-label={`${peer.deviceName} — ${ready ? t('peers.peerLinkReady') : t('peers.openingPeerLink')}`}
                disabled={!ready}
              >
                {deviceIcon(peer.deviceType, 20)}
              </button>
              <div className="peer-label">
                <strong>{peer.deviceName}</strong>
                <small className={ready ? 'ready' : undefined}>
                  {ready ? t('peers.peerLinkReady') : t('peers.openingPeerLink')}
                </small>
              </div>
              {selected ? (
                <div className="peer-popover" role="menu">
                  <button type="button" onClick={() => onSendText(peer)}>
                    <MessageSquareText size={14} />
                    {t('peers.actionText')}
                  </button>
                  <button type="button" onClick={() => onSendFile(peer)}>
                    <FileUp size={14} />
                    {t('peers.actionFile')}
                  </button>
                  <button type="button" className="close" onClick={() => onSelectPeer(null)} aria-label={t('dialog.close')}>
                    <X size={14} />
                  </button>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {peers.length === 0 ? (
        <div className="radar-empty">
          <strong>{t('peers.waitingForPeers')}</strong>
          <p>{t('peers.scanHint')}</p>
        </div>
      ) : null}
    </div>
  );
}

function layoutPeers(peers: Peer[]): Map<string, { x: number; y: number }> {
  const out = new Map<string, { x: number; y: number }>();
  const total = peers.length;
  if (total === 0) return out;

  peers.forEach((peer, index) => {
    const hash = hashString(peer.peerId);
    const baseAngle = (index / total) * Math.PI * 2 - Math.PI / 2;
    const angleJitter = (((hash >>> 0) % 1000) / 1000 - 0.5) * 0.45;
    const angle = baseAngle + angleJitter;
    // Radius as a fraction of the radar half-size; alternate between rings
    const ring = index % 3 === 0 ? 0.32 : index % 3 === 1 ? 0.42 : 0.5;
    const radiusJitter = (((hash >>> 8) % 1000) / 1000) * 0.06;
    const r = ring + radiusJitter;
    out.set(peer.peerId, {
      x: 0.5 + Math.cos(angle) * r,
      y: 0.5 + Math.sin(angle) * r
    });
  });
  return out;
}

function hashString(value: string): number {
  let hash = 5381;
  for (let i = 0; i < value.length; i++) {
    hash = ((hash << 5) + hash) ^ value.charCodeAt(i);
  }
  return hash;
}

function InboxItem({ item }: { item: ReceivedItem }) {
  const { t } = useTranslation();
  if (item.type === 'text') {
    return (
      <article className="inbox-item">
        <div>
          <span className="tag">{t('inbox.textFrom', { name: item.from.deviceName })}</span>
          <p>{item.data}</p>
        </div>
        <button type="button" onClick={() => void copyText(item.data)} aria-label={t('inbox.copyText')}>
          <Copy size={14} />
        </button>
      </article>
    );
  }

  return (
    <article className="inbox-item">
      <div>
        <span className="tag">{t('inbox.fileFrom', { name: item.from.deviceName })}</span>
        <p>{item.fileName} · {formatBytes(item.size)}</p>
      </div>
      <button type="button" onClick={() => void downloadFile(item.blob, item.url, item.fileName)} aria-label={t('inbox.downloadFile', { name: item.fileName })}>
        <Download size={14} />
      </button>
    </article>
  );
}

async function downloadFile(blob: Blob, url: string, fileName: string) {
  const file = new File([blob], fileName, { type: blob.type || 'application/octet-stream' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: fileName });
      return;
    } catch {}
  }

  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.target = '_blank';
  anchor.rel = 'noopener';
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  if (isAppleMobileBrowser()) {
    window.open(url, '_blank', 'noopener');
  }
}

function isAppleMobileBrowser() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function copyArrayBufferView(view: ArrayBufferView) {
  const copy = new Uint8Array(view.byteLength);
  copy.set(new Uint8Array(view.buffer, view.byteOffset, view.byteLength));
  return copy.buffer;
}

function LogItem({ log }: { log: TransferLog }) {
  const { t } = useTranslation();
  return (
    <article className={`log-item ${log.status}`}>
      <span className="direction">{t(`log.direction${log.direction.charAt(0).toUpperCase()}${log.direction.slice(1)}`)}</span>
      <div>
        <strong>{log.title}</strong>
        <p>{log.detail}</p>
      </div>
    </article>
  );
}

function Dialog({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="dialog-backdrop" role="presentation" onClick={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="dialog" role="dialog" aria-modal="true" aria-label={title}>
        <header>
          <h2>{title}</h2>
          <button type="button" onClick={onClose} aria-label={t('dialog.close')}>
            <X size={16} />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}

function deviceIcon(deviceType: DeviceType, size = 22) {
  if (deviceType === 'mobile') {
    return <Smartphone aria-hidden="true" size={size} />;
  }

  if (deviceType === 'tablet') {
    return <Tablet aria-hidden="true" size={size} />;
  }

  if (deviceType === 'desktop') {
    return <Laptop aria-hidden="true" size={size} />;
  }

  return <Monitor aria-hidden="true" size={size} />;
}

function ensureRoomInUrl() {
  const url = new URL(window.location.href);
  let room = url.searchParams.get('room')?.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48);

  if (!room) {
    room = createClientId().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 12);
    url.searchParams.set('room', room);
    window.history.replaceState(null, '', url);
  }

  return room;
}

function waitForNextFileAck(ackState: FileAckState, t?: (key: string) => string) {
  return new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      ackState.waiters.delete(onAck);
      reject(new Error(t ? t('errors.receiverNotConfirm') : 'Receiver did not confirm the file transfer'));
    }, transferTimeoutMs);
    const onAck = () => {
      window.clearTimeout(timer);
      resolve();
    };
    ackState.waiters.add(onAck);
  });
}

function waitForChannelBuffer(channel: RTCDataChannel, t?: (key: string) => string) {
  if (channel.readyState !== 'open') {
    return Promise.reject(new Error(t ? t('errors.peerLinkClosed') : 'Peer link closed'));
  }

  if (channel.bufferedAmount <= maxBufferedAmount) {
    return Promise.resolve();
  }

  return new Promise<void>((resolve, reject) => {
    let timer: number | undefined;
    let settled = false;
    const startedAt = Date.now();
    const cleanup = () => {
      if (timer) {
        window.clearTimeout(timer);
      }
      channel.removeEventListener('bufferedamountlow', onLow);
    };
    const finish = (error?: Error) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    };
    const check = () => {
      if (channel.readyState !== 'open') {
        finish(new Error(t ? t('errors.peerLinkClosed') : 'Peer link closed'));
        return;
      }
      if (channel.bufferedAmount <= lowBufferedAmount) {
        finish();
        return;
      }
      if (Date.now() - startedAt > transferTimeoutMs) {
        finish(new Error(t ? t('errors.peerLinkBusy') : 'Peer link is busy'));
        return;
      }
      timer = window.setTimeout(check, 100);
    };
    const onLow = () => {
      check();
    };
    channel.bufferedAmountLowThreshold = lowBufferedAmount;
    channel.addEventListener('bufferedamountlow', onLow);
    check();
  });
}
