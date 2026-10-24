import React, { useState, useEffect, useRef } from 'react';
import {
  Send,
  CheckCheck,
  Clock,
  AlertCircle,
  MessageSquare,
  WifiOff,
  Check,
  X,
  Paperclip,
  Camera,
} from 'lucide-react';
import type {
  Peer,
  Message,
  LocalProfile,
  MessageAck,
  InvitationResponse,
  ConversationSummary,
  FileTransferProgress,
} from '../types/subnet';
import UserAvatar from './UserAvatar';
import CameraCaptureModal from './CameraCaptureModal';
import MediaViewerModal, { ViewingMedia } from './MediaViewerModal';
import AttachmentBubble from './AttachmentBubble';

interface ChatPaneProps {
  activePeer: Peer;
  localProfile: LocalProfile | null;
  isPeerOnline: boolean;
  conversation?: ConversationSummary | null;
  onAcceptInvitation?: (invitationId: string) => void;
  onDeclineInvitation?: (invitationId: string) => void;
}

export default function ChatPane({
  activePeer,
  localProfile,
  isPeerOnline,
  conversation,
  onAcceptInvitation,
  onDeclineInvitation,
}: ChatPaneProps): React.JSX.Element {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [cameraModalMode, setCameraModalMode] = useState<'photo' | 'video' | null>(null);
  const [viewingMedia, setViewingMedia] = useState<ViewingMedia | null>(null);
  const [transferProgressMap, setTransferProgressMap] = useState<Record<string, FileTransferProgress>>({});

  // 1. Load messages from Electron Process persistent store
  useEffect(() => {
    let isMounted = true;
    if (window.subnet?.getConversationMessages) {
      window.subnet.getConversationMessages(activePeer.id).then((stored) => {
        if (isMounted && Array.isArray(stored)) {
          setMessages(stored);
        }
      }).catch(console.error);
    }

    // Mark as read in the main process
    if (window.subnet?.markConversationRead) {
      window.subnet.markConversationRead(activePeer.id).catch(console.error);
    }

    return () => {
      isMounted = false;
    };
  }, [activePeer.id, conversation?.status]);

  // 2. Auto-scroll to bottom on new message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // 3. Focus input when chat opens
  useEffect(() => {
    textareaRef.current?.focus();
  }, [activePeer.id]);

  // 5. Subscribe to real-time events from IPC bridge
  useEffect(() => {
    const cleanups: Array<() => void> = [];

    if (window.subnet?.onMessageReceived) {
      const unsub = window.subnet.onMessageReceived((incoming: Message) => {
        if (incoming.senderId === activePeer.id || incoming.recipientId === activePeer.id) {
          setMessages((prev) => {
            if (prev.some((m) => m.id === incoming.id)) {
              return prev.map((m) => (m.id === incoming.id ? { ...m, ...incoming } : m));
            }
            const updated = [...prev, incoming];
            updated.sort((a, b) => a.timestamp - b.timestamp);
            return updated;
          });
          // Mark read since chat is actively open
          window.subnet.markConversationRead(activePeer.id).catch(console.error);
        }
      });
      cleanups.push(unsub);
    }

    if (window.subnet?.onMessageAck) {
      const unsub = window.subnet.onMessageAck((ack: MessageAck) => {
        if (ack.senderId === activePeer.id) {
          setMessages((prev) =>
            prev.map((m) => {
              if (m.id === ack.messageId) {
                return { ...m, status: 'delivered' };
              }
              return m;
            })
          );
        }
      });
      cleanups.push(unsub);
    }

    if (window.subnet?.onInvitationResponse) {
      const unsub = window.subnet.onInvitationResponse((res: InvitationResponse) => {
        if (res.senderId === activePeer.id) {
          // Re-load messages to reflect accepted opening message or updated delivery status
          window.subnet.getConversationMessages(activePeer.id).then((updated) => {
            if (Array.isArray(updated)) {
              setMessages(updated);
            }
          }).catch(console.error);
        }
      });
      cleanups.push(unsub);
    }

    if (window.subnet?.onTransferProgress) {
      const unsub = window.subnet.onTransferProgress((progress: FileTransferProgress) => {
        setTransferProgressMap((prev) => ({
          ...prev,
          [progress.transferId]: progress,
        }));

        if (
          progress.status === 'completed' ||
          progress.status === 'failed' ||
          progress.status === 'cancelled'
        ) {
          window.subnet.getConversationMessages(activePeer.id).then((stored) => {
            if (Array.isArray(stored)) {
              setMessages(stored);
            }
          }).catch(console.error);
        }
      });
      cleanups.push(unsub);
    }

    return () => {
      cleanups.forEach((cleanup) => cleanup());
    };
  }, [activePeer.id]);

  const handleSendMessage = async () => {
    const text = inputText.trim();
    if (!text || isSending) return;

    if (!isPeerOnline) {
      setErrorMessage('Cannot send: User is offline from local network');
      return;
    }

    setErrorMessage(null);
    setInputText('');
    setIsSending(true);
    textareaRef.current?.focus();

    try {
      const result = await window.subnet.sendMessage(activePeer.id, text);

      if (result.success && result.messageId) {
        // Hydrate from persistent store so any auto-accepted invitation initial message
        // and outgoing message are loaded in order without race conditions
        const stored = await window.subnet.getConversationMessages(activePeer.id);
        if (Array.isArray(stored) && stored.length > 0) {
          setMessages(stored);
        } else {
          const outgoingMessage: Message = {
            id: result.messageId,
            senderId: localProfile?.id || 'me',
            recipientId: activePeer.id,
            text,
            timestamp: Date.now(),
            status: 'sending',
          };
          setMessages((prev) => [...prev, outgoingMessage]);
        }
      } else {
        setErrorMessage(result.error || 'Failed to deliver message over local network');
        setInputText(text);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Transmission error');
      setInputText(text);
    } finally {
      setIsSending(false);
      textareaRef.current?.focus();
    }
  };

  const handleAttachFiles = async () => {
    try {
      const selected = await (window.subnet.selectAttachmentFiles
        ? window.subnet.selectAttachmentFiles('all')
        : window.subnet.selectAttachmentFile('all'));

      if (!selected || !selected.success) {
        // Picker was cancelled -> do nothing and keep composer usable
        return;
      }

      const files =
        selected.files && selected.files.length > 0
          ? selected.files
          : selected.file
            ? [selected.file]
            : [];

      if (files.length === 0) return;

      setIsSending(true);
      setErrorMessage(null);

      for (const f of files) {
        const res = await window.subnet.sendAttachment(activePeer.id, 'direct', f.filePath);
        if (!res.success) {
          setErrorMessage(res.error || `Failed to send ${f.fileName}`);
        }
      }

      const stored = await window.subnet.getConversationMessages(activePeer.id);
      if (Array.isArray(stored)) {
        setMessages(stored);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to send attachment');
    } finally {
      setIsSending(false);
      textareaRef.current?.focus();
    }
  };

  const handleConfirmSendCamera = async (media: {
    fileName: string;
    mimeType: string;
    base64Data: string;
  }) => {
    setCameraModalMode(null);
    setIsSending(true);
    setErrorMessage(null);

    try {
      const res = await window.subnet.sendMediaAttachment(
        activePeer.id,
        'direct',
        media
      );
      if (res.success) {
        const stored = await window.subnet.getConversationMessages(activePeer.id);
        if (Array.isArray(stored)) setMessages(stored);
      } else {
        setErrorMessage(res.error || 'Failed to send camera media');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to send camera media');
    } finally {
      setIsSending(false);
    }
  };

  const handleDownloadAttachment = async (msg: Message) => {
    if (!msg.attachment) return;
    try {
      const res = await window.subnet.downloadAttachment(
        msg.attachment.transferId,
        msg.senderId
      );
      if (!res.success) {
        setErrorMessage(res.error || 'Failed to start download');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to start download');
    }
  };

  const handleCancelTransfer = async (transferId: string) => {
    try {
      await window.subnet.cancelTransfer(transferId);
    } catch (err: any) {
      console.error('Failed to cancel transfer:', err);
    }
  };

  const handleShowInFolder = async (filePath?: string) => {
    if (!filePath) return;
    try {
      await window.subnet.showItemInFolder(filePath);
    } catch (err) {
      console.error('Failed to show item in folder:', err);
    }
  };

  const handleOpenFile = async (filePath?: string) => {
    if (!filePath) return;
    try {
      await window.subnet.openFile(filePath);
    } catch (err) {
      console.error('Failed to open file:', err);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const formatTime = (timestamp: number): string => {
    const d = new Date(timestamp);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const isPendingIncoming = conversation?.status === 'pending_incoming' && conversation.pendingInvitation;
  const isPendingOutgoing = conversation?.status === 'pending_outgoing';
  const isDeclined = conversation?.status === 'declined';

  return (
    <div className="chat-container">
      {/* Header bar */}
      <div className="chat-header">
        <div className="chat-peer-info">
          <div className="chat-avatar-container">
            <UserAvatar
              avatarType={activePeer.avatar?.avatarType || conversation?.peerAvatar?.avatarType}
              avatarValue={activePeer.avatar?.avatarValue || conversation?.peerAvatar?.avatarValue}
              size={32}
              name={activePeer.name}
              alt={activePeer.name}
              fallbackIconColor={isPeerOnline ? '#B58AE8' : '#77717F'}
            />
          </div>
          <div className="chat-meta">
            <h2 className="chat-peer-name">{activePeer.name}</h2>
            <div className="chat-status-line">
              <span className={`status-dot ${isPeerOnline ? 'active' : ''}`} />
              <span className="chat-status-text">
                {isPeerOnline ? 'LAN Connected' : 'Disconnected from LAN'}
              </span>
            </div>
          </div>
        </div>

      </div>

      {/* Pending Incoming Invitation Banner */}
      {isPendingIncoming && conversation?.pendingInvitation && onAcceptInvitation && onDeclineInvitation && (
        <div className="chat-invitation-action-banner">
          <div className="invitation-action-info">
            <div className="invitation-action-avatar">
              <UserAvatar
                avatarType={activePeer.avatar?.avatarType || conversation?.peerAvatar?.avatarType}
                avatarValue={activePeer.avatar?.avatarValue || conversation?.peerAvatar?.avatarValue}
                size={30}
                name={activePeer.name}
                alt={activePeer.name}
                fallbackIconColor="#B58AE8"
              />
            </div>
            <div className="invitation-action-copy">
              <strong>{activePeer.name}</strong>
              <span>sent you a chat invitation. Accept to reply?</span>
            </div>
          </div>
          <div className="invitation-action-buttons">
            <button
              type="button"
              className="chat-invitation-decline"
              onClick={() => onDeclineInvitation(conversation.pendingInvitation!.id)}
            >
              <X style={{ width: 14, height: 14 }} />
              <span>Decline</span>
            </button>
            <button
              type="button"
              className="chat-invitation-accept"
              onClick={async () => {
                if (onAcceptInvitation && conversation?.pendingInvitation) {
                  onAcceptInvitation(conversation.pendingInvitation.id);
                  // Refresh messages immediately to hydrate the opening message
                  try {
                    const stored = await window.subnet.getConversationMessages(activePeer.id);
                    if (Array.isArray(stored)) {
                      setMessages(stored);
                    }
                  } catch (e) {
                    console.error(e);
                  }
                }
              }}
            >
              <Check style={{ width: 14, height: 14 }} />
              <span>Accept & Chat</span>
            </button>
          </div>
        </div>
      )}

      {/* Pending Outgoing Invitation Banner */}
      {isPendingOutgoing && (
        <div className="chat-pending-banner">
          <Clock style={{ width: 14, height: 14, color: '#B58AE8', flexShrink: 0 }} />
          <span>Chat invitation sent. Waiting for {activePeer.name} to accept...</span>
        </div>
      )}

      {/* Declined Banner */}
      {isDeclined && (
        <div className="chat-declined-banner">
          <AlertCircle style={{ width: 14, height: 14, color: '#f87171', flexShrink: 0 }} />
          <span>{activePeer.name} declined the chat invitation.</span>
        </div>
      )}

      {/* Message List */}
      <div className="chat-messages-scroll">
        {messages.length === 0 ? (
          <div className="chat-empty-state">
            <div className="chat-empty-icon-wrap">
              <MessageSquare style={{ width: 28, height: 28, color: '#64748b' }} />
            </div>
            <h3 className="chat-empty-title">
              {isPendingIncoming ? `Invitation from ${activePeer.name}` : `Say hello to ${activePeer.name}`}
            </h3>
            <p className="chat-empty-desc">
              {isPendingIncoming && conversation?.pendingInvitation
                ? `Opening message: "${conversation.pendingInvitation.text}". Accept above to reply.`
                : 'Your first message will be sent as a chat invitation. Once accepted, messages travel directly over your Wi-Fi or LAN with zero servers.'}
            </p>
          </div>
        ) : (
          messages.map((msg, idx) => {
            const isMe = msg.senderId === localProfile?.id;
            const isConsecutive = idx > 0 && messages[idx - 1].senderId === msg.senderId;

            return (
              <div
                key={msg.id}
                className={`message-row ${isMe ? 'outgoing' : 'incoming'} ${isConsecutive ? 'consecutive' : ''
                  }`}
              >
                <div className={`message-bubble ${isMe ? 'bubble-me' : 'bubble-peer'}`}>
                  {msg.attachment && (
                    <AttachmentBubble
                      attachment={msg.attachment}
                      isMe={isMe}
                      localPath={msg.localAttachmentPath}
                      transferStatus={msg.transferStatus}
                      progress={transferProgressMap[msg.attachment.transferId]}
                      onDownload={() => handleDownloadAttachment(msg)}
                      onCancel={(tid) => handleCancelTransfer(tid)}
                      onShowInFinder={(p) => handleShowInFolder(p)}
                      onOpenFile={(p) => handleOpenFile(p)}
                      onViewMedia={(media) => setViewingMedia(media)}
                    />
                  )}
                  {msg.text ? <div className="message-content">{msg.text}</div> : null}
                  <div className="message-footer">
                    <span className="message-timestamp">
                      {formatTime(msg.timestamp)}
                    </span>
                    {isMe && (
                      <span className="message-status-icon">
                        {msg.status === 'delivered' ? (
                          <CheckCheck style={{ width: 13, height: 13, color: 'rgba(255, 255, 255, 0.95)' }} />
                        ) : msg.status === 'failed' ? (
                          <AlertCircle style={{ width: 12, height: 12, color: '#ef4444' }} />
                        ) : (
                          <Clock style={{ width: 11, height: 11, color: 'rgba(255,255,255,0.6)' }} />
                        )}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Error feedback banner */}
      {errorMessage && (
        <div className="chat-error-banner">
          <AlertCircle style={{ width: 14, height: 14, color: '#ef4444', flexShrink: 0 }} />
          <span>{errorMessage}</span>
          <button
            className="error-dismiss-btn"
            onClick={() => setErrorMessage(null)}
          >
            ×
          </button>
        </div>
      )}

      {/* Offline warning banner */}
      {!isPeerOnline && (
        <div className="chat-offline-banner">
          <WifiOff style={{ width: 14, height: 14, color: '#f59e0b', flexShrink: 0 }} />
          <span>User disappeared from local network. Viewing persisted local history.</span>
        </div>
      )}

      {/* Input Box */}
      <div className="chat-input-area">
        {/* Recognizable Paperclip Attachment Action */}
        <button
          type="button"
          className="chat-composer-action-btn"
          onClick={handleAttachFiles}
          disabled={!isPeerOnline || isSending || isDeclined}
          title="Attach file"
          aria-label="Attach file"
        >
          <Paperclip style={{ width: 17, height: 17 }} />
        </button>

        {/* Quick Camera Action */}
        <button
          type="button"
          className="chat-composer-action-btn"
          onClick={() => setCameraModalMode('photo')}
          disabled={!isPeerOnline || isSending || isDeclined}
          title="Take photo"
          aria-label="Camera"
        >
          <Camera style={{ width: 16, height: 16 }} />
        </button>

        <textarea
          ref={textareaRef}
          className="chat-textarea"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            !isPeerOnline
              ? 'User is offline from local network'
              : isDeclined
                ? 'Invitation was declined'
                : 'type a message .....'
          }
          disabled={!isPeerOnline || isDeclined}
          rows={1}
        />
        <button
          className="chat-send-button"
          onClick={handleSendMessage}
          onMouseDown={(e) => e.preventDefault()}
          disabled={!inputText.trim() || !isPeerOnline || isSending || isDeclined}
          title="Send message (Enter)"
        >
          <Send style={{ width: 16, height: 16 }} />
        </button>
      </div>

      {/* Modals */}
      {cameraModalMode && (
        <CameraCaptureModal
          initialMode={cameraModalMode}
          onSendMedia={handleConfirmSendCamera}
          onClose={() => setCameraModalMode(null)}
        />
      )}

      {viewingMedia && (
        <MediaViewerModal
          media={viewingMedia}
          onClose={() => setViewingMedia(null)}
          onShowInFinder={handleShowInFolder}
          onDownload={() => {
            if (viewingMedia.transferId) {
              const msg = messages.find((m) => m.attachment?.transferId === viewingMedia.transferId);
              if (msg) handleDownloadAttachment(msg);
            }
          }}
        />
      )}
    </div>
  );
}
