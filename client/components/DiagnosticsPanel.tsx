'use client';

import { AlertTriangle, Info, RadioTower, RefreshCcw, ShieldCheck, Wifi } from 'lucide-react';
import type { ReactNode } from 'react';
import type { IceDiagnosticSource, PeerDiagnostic, SignalDiagnosticState } from '@/lib/diagnostics';
import { isPeerDiagnosticFailed } from '@/lib/diagnostics';
import { useTranslation } from '@/lib/i18n';

type DiagnosticTone = 'ok' | 'warn' | 'error' | 'pending';

type DiagnosticsPanelProps = {
  signalState: SignalDiagnosticState;
  iceSource: IceDiagnosticSource;
  peers: PeerDiagnostic[];
  lastIssue: string;
  onReconnect: () => void;
};

export default function DiagnosticsPanel({
  signalState,
  iceSource,
  peers,
  lastIssue,
  onReconnect
}: DiagnosticsPanelProps) {
  const { t } = useTranslation();
  const readyPeers = peers.filter((peer) => peer.channelState === 'open').length;
  const failedPeer = peers.some(isPeerDiagnosticFailed);
  const p2pTone: DiagnosticTone = peers.length === 0 ? 'pending' : failedPeer ? 'error' : readyPeers > 0 ? 'ok' : 'pending';
  const p2pValue = peers.length === 0
    ? t('diagnostics.p2pWaiting')
    : t('diagnostics.p2pSummary', { ready: readyPeers, total: peers.length });

  return (
    <section className="card diagnostics-card">
      <div className="card-head">
        <div>
          <p className="eyebrow">{t('diagnostics.eyebrow')}</p>
          <h2>{t('diagnostics.title')}</h2>
        </div>
        <RadioTower aria-hidden="true" size={20} />
      </div>
      <div className="card-body diagnostics-body">
        <div className="diagnostic-grid">
          <DiagnosticItem
            icon={<Wifi size={16} />}
            label={t('diagnostics.signal')}
            value={t(`diagnostics.signalState.${signalState}`)}
            tone={signalState === 'connected' ? 'ok' : signalState === 'connecting' ? 'pending' : 'error'}
          />
          <DiagnosticItem
            icon={<RadioTower size={16} />}
            label={t('diagnostics.p2p')}
            value={p2pValue}
            tone={p2pTone}
          />
          <DiagnosticItem
            icon={<ShieldCheck size={16} />}
            label={t('diagnostics.ice')}
            value={t(`diagnostics.iceSource.${iceSource}`)}
            tone={iceSource === 'cloudflare-turn' ? 'ok' : iceSource === 'fallback' ? 'warn' : 'pending'}
          />
        </div>

        <div className={`diagnostic-issue ${lastIssue ? 'active' : ''}`}>
          {lastIssue ? <AlertTriangle aria-hidden="true" size={15} /> : <Info aria-hidden="true" size={15} />}
          <span>{lastIssue || t('diagnostics.noRecentIssue')}</span>
        </div>

        {peers.length ? (
          <div className="diagnostic-peer-list" aria-label={t('diagnostics.peerDetails')}>
            {peers.map((peer) => (
              <div key={peer.peerId} className={`diagnostic-peer ${isPeerDiagnosticFailed(peer) ? 'error' : ''}`}>
                <strong>{peer.deviceName}</strong>
                <span>
                  {t('diagnostics.peerState', {
                    connection: peer.connectionState,
                    ice: peer.iceConnectionState,
                    channel: peer.channelState
                  })}
                </span>
              </div>
            ))}
          </div>
        ) : null}

        <div className="privacy-note">
          <ShieldCheck aria-hidden="true" size={16} />
          <span>{t('diagnostics.privacy')}</span>
        </div>

        <button className="diagnostic-reconnect" type="button" onClick={onReconnect}>
          <RefreshCcw size={15} />
          {t('diagnostics.reconnect')}
        </button>
      </div>
    </section>
  );
}

function DiagnosticItem({
  icon,
  label,
  value,
  tone
}: {
  icon: ReactNode;
  label: string;
  value: string;
  tone: DiagnosticTone;
}) {
  return (
    <div className={`diagnostic-item ${tone}`}>
      <div className="diagnostic-icon">{icon}</div>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
    </div>
  );
}
