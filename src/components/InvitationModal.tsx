import React from 'react';
import { Laptop, MessageSquare, Check, X, ShieldAlert } from 'lucide-react';
import type { Invitation } from '../types/subnet';

interface InvitationModalProps {
  invitation: Invitation;
  onAccept: (invitation: Invitation) => void;
  onDecline: (invitation: Invitation) => void;
}

export default function InvitationModal({
  invitation,
  onAccept,
  onDecline,
}: InvitationModalProps): React.JSX.Element {
  return (
    <div className="invitation-backdrop" role="dialog" aria-modal="true" aria-labelledby="invitation-title">
      <div className="invitation-modal-card">
        <div className="invitation-header">
          <div className="invitation-badge">
            <MessageSquare style={{ width: 14, height: 14, color: '#38bdf8' }} />
            <span>Chat Invitation</span>
          </div>
          <span className="invitation-time">
            {new Date(invitation.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>

        <div className="invitation-peer-row">
          <div className="invitation-avatar">
            <Laptop style={{ width: 22, height: 22, color: '#38bdf8' }} />
          </div>
          <div className="invitation-peer-meta">
            <h3 id="invitation-title" className="invitation-sender-name">
              {invitation.senderName}
            </h3>
            <span className="invitation-device-id">
              Nearby Device
            </span>
          </div>
        </div>

        <div className="invitation-bubble">
          <p className="invitation-text">{invitation.text}</p>
        </div>

        <div className="invitation-notice">
          <ShieldAlert style={{ width: 13, height: 13, color: '#94a3b8', flexShrink: 0 }} />
          <span>Direct P2P LAN transport (No cloud backend)</span>
        </div>

        <div className="invitation-actions">
          <button
            type="button"
            className="invitation-btn decline-btn"
            onClick={() => onDecline(invitation)}
            title="Decline invitation"
          >
            <X style={{ width: 16, height: 16 }} />
            <span>Decline</span>
          </button>
          <button
            type="button"
            className="invitation-btn accept-btn"
            onClick={() => onAccept(invitation)}
            title="Accept invitation and start chat"
          >
            <Check style={{ width: 16, height: 16 }} />
            <span>Accept & Chat</span>
          </button>
        </div>
      </div>
    </div>
  );
}
