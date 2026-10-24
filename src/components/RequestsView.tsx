import React from 'react';
import { Laptop, Inbox, Check, X, ShieldAlert, Compass } from 'lucide-react';
import type { Invitation } from '../types/subnet';

interface RequestsViewProps {
  requests: Invitation[];
  processingIds: Set<string>;
  onAccept: (invitation: Invitation) => void;
  onDecline: (invitation: Invitation) => void;
  onOpenRadar: () => void;
}

export default function RequestsView({
  requests,
  processingIds,
  onAccept,
  onDecline,
  onOpenRadar,
}: RequestsViewProps): React.JSX.Element {
  const formatTime = (timestamp: number): string => {
    const d = new Date(timestamp);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) {
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return d.toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  if (requests.length === 0) {
    return (
      <div className="requests-empty-container">
        <div className="requests-empty-card">
          <div className="empty-icon-wrap">
            <Inbox style={{ width: 36, height: 36, color: '#64748b' }} />
          </div>
          <h2 className="empty-title">No pending requests</h2>
          <p className="empty-description">
            When another person on your local Wi-Fi or Ethernet network sends you a chat invitation,
            it will appear here for you to accept or decline.
          </p>
          <button
            type="button"
            className="empty-action-btn"
            onClick={onOpenRadar}
          >
            <Compass style={{ width: 16, height: 16 }} />
            <span>Discover Nearby Devices</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="requests-view-container">
      <div className="requests-view-header">
        <div className="requests-title-row">
          <h1 className="requests-view-heading">Incoming Requests</h1>
          <span className="requests-count-badge">
            {requests.length} pending
          </span>
        </div>
        <p className="requests-view-subheading">
          Peers on your local network who want to start a direct conversation with you.
        </p>
      </div>

      <div className="requests-list-scroll">
        {requests.map((inv) => {
          const isProcessing = processingIds.has(inv.id);

          return (
            <div key={inv.id} className="request-card">
              <div className="request-card-header">
                <div className="request-peer-info">
                  <div className="request-avatar">
                    <Laptop style={{ width: 22, height: 22, color: '#B58AE8' }} />
                  </div>
                  <div className="request-meta">
                    <div className="request-name-row">
                      <span className="request-peer-name">{inv.senderName}</span>
                      <span className="request-device-pill">LAN Device</span>
                    </div>
                    <span className="request-time">
                      {formatTime(inv.timestamp)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="request-message-bubble">
                <span className="request-bubble-label">Opening message</span>
                <p className="request-message-text">{inv.text}</p>
              </div>

              <div className="request-card-footer">
                <div className="request-transport-note">
                  <ShieldAlert style={{ width: 13, height: 13, color: '#94a3b8', flexShrink: 0 }} />
                  <span>Direct P2P LAN transport (Unencrypted WebSocket)</span>
                </div>

                <div className="request-actions">
                  <button
                    type="button"
                    className="request-btn request-decline-btn"
                    onClick={() => onDecline(inv)}
                    disabled={isProcessing}
                    title="Decline request"
                  >
                    <X style={{ width: 15, height: 15 }} />
                    <span>Decline</span>
                  </button>
                  <button
                    type="button"
                    className="request-btn request-accept-btn"
                    onClick={() => onAccept(inv)}
                    disabled={isProcessing}
                    title="Accept request"
                  >
                    <Check style={{ width: 15, height: 15 }} />
                    <span>{isProcessing ? 'Accepting...' : 'Accept'}</span>
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
