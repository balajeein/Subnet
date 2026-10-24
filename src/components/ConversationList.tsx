import React from 'react';
import { Laptop, MessageSquare, ArrowRight } from 'lucide-react';
import type { ConversationSummary, Peer } from '../types/subnet';

interface ConversationListProps {
  conversations: ConversationSummary[];
  discoveredPeers: Peer[];
  onSelectConversation: (peer: Peer) => void;
  onAcceptInvitation?: (conv: ConversationSummary) => void;
  onDeclineInvitation?: (conv: ConversationSummary) => void;
}

export default function ConversationList({
  conversations,
  discoveredPeers,
  onSelectConversation,
  onAcceptInvitation,
  onDeclineInvitation,
}: ConversationListProps): React.JSX.Element {
  const formatTime = (timestamp: number): string => {
    if (!timestamp) return '';
    const now = new Date();
    const date = new Date(timestamp);
    if (now.toDateString() === date.toDateString()) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  if (conversations.length === 0) {
    return (
      <div className="conversations-empty-wrap">
        <div className="conversations-empty-card">
          <MessageSquare style={{ width: 32, height: 32, color: '#64748b' }} />
          <h2 className="empty-state-title">No conversations yet</h2>
          <p className="empty-state-desc">
            When you chat with nearby peers on your local network, all conversations and messages are persisted locally on this device.
          </p>
          <div className="empty-state-features">
            <span className="feature-pill">Local Storage</span>
            <span className="feature-pill">Zero Cloud</span>
            <span className="feature-pill">Private & Offline</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="conversations-list-container">
      <div className="conversations-list-header">
        <h2 className="conversations-heading">Chat History</h2>
        <span className="conversations-count">
          {conversations.length} {conversations.length === 1 ? 'chat' : 'chats'} stored locally
        </span>
      </div>

      <div className="conversations-items-scroll">
        {conversations.map((conv) => {
          const onlinePeer = discoveredPeers.find((p) => p.id === conv.peerId);
          const isOnline = Boolean(onlinePeer);
          const peerObject: Peer = onlinePeer || {
            id: conv.peerId,
            name: conv.peerName,
          };

          return (
            <div
              key={conv.peerId}
              className={`conversation-item-card ${conv.unreadCount > 0 ? 'has-unread' : ''}`}
              onClick={() => onSelectConversation(peerObject)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onSelectConversation(peerObject);
              }}
            >
              <div className="conversation-avatar-wrap">
                <Laptop style={{ width: 20, height: 20, color: isOnline ? '#B58AE8' : '#77717F' }} />
                <span className={`status-indicator-dot ${isOnline ? 'online' : 'offline'}`} />
              </div>

              <div className="conversation-info">
                <div className="conversation-top-line">
                  <span className="conversation-peer-name">{conv.peerName}</span>
                  <span className="conversation-timestamp">{formatTime(conv.lastTimestamp)}</span>
                </div>

                <div className="conversation-bottom-line">
                  <span className="conversation-last-message">
                    {conv.status === 'pending_incoming' ? (
                      <span className="status-highlight-pending">
                        Incoming chat invitation...
                      </span>
                    ) : conv.status === 'pending_outgoing' ? (
                      <span className="status-highlight-waiting">
                        Waiting for acceptance...
                      </span>
                    ) : conv.status === 'declined' ? (
                      <span className="status-highlight-declined">
                        Invitation declined
                      </span>
                    ) : (
                      conv.lastMessage || 'No messages'
                    )}
                  </span>

                  <div className="conversation-badges">
                    {conv.unreadCount > 0 && (
                      <span className="unread-badge">{conv.unreadCount}</span>
                    )}
                    {conv.status === 'pending_incoming' && onAcceptInvitation && onDeclineInvitation && (
                      <div className="conv-quick-actions" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          className="conv-quick-btn decline"
                          onClick={() => onDeclineInvitation(conv)}
                          title="Decline invitation"
                        >
                          Decline
                        </button>
                        <button
                          type="button"
                          className="conv-quick-btn accept"
                          onClick={() => onAcceptInvitation(conv)}
                          title="Accept invitation"
                        >
                          Accept
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="conversation-arrow">
                <ArrowRight style={{ width: 16, height: 16, color: '#475569' }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
