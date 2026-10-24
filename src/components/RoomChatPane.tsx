import React, { useState, useEffect, useRef } from 'react';
import {
  Users,
  VenetianMask,
  Send,
  ShieldAlert,
  LogOut,
  Info,
  UserPlus,
  Paperclip,
  Camera,
} from 'lucide-react';
import type {
  RoomSummary,
  RoomMessage,
  LocalProfile,
  Peer,
  FileTransferProgress,
} from '../types/subnet';
import UserAvatar from './UserAvatar';
import MascotAvatar from './MascotAvatar';
import CameraCaptureModal from './CameraCaptureModal';
import MediaViewerModal, { ViewingMedia } from './MediaViewerModal';
import AttachmentBubble from './AttachmentBubble';

interface RoomChatPaneProps {
  room: RoomSummary;
  localProfile: LocalProfile | null;
  discoveredPeers: Peer[];
  onClose: () => void;
  onLeaveRoom: (roomId: string) => void;
}

export default function RoomChatPane({
  room,
  localProfile,
  discoveredPeers,
  onLeaveRoom,
}: RoomChatPaneProps): React.JSX.Element {
  const [messages, setMessages] = useState<RoomMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [showMemberList, setShowMemberList] = useState(false);
  const [showAddMembers, setShowAddMembers] = useState(false);
  const [addingMemberId, setAddingMemberId] = useState<string | null>(null);
  const [pendingMemberIds, setPendingMemberIds] = useState<Set<string>>(new Set());
  const [memberInviteError, setMemberInviteError] = useState<string | null>(null);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [cameraModalMode, setCameraModalMode] = useState<'photo' | 'video' | null>(null);
  const [viewingMedia, setViewingMedia] = useState<ViewingMedia | null>(null);
  const [transferProgressMap, setTransferProgressMap] = useState<Record<string, FileTransferProgress>>({});
  const memberControlRef = useRef<HTMLDivElement>(null);

  const isClosed = room.status === 'closed';
  const isAnonymous = room.type === 'anonymous';
  const canAddMembers = room.type === 'private' && room.isHost && !isClosed;
  const roomMemberIds = new Set(room.members.map((member) => member.id));
  const addablePeers = discoveredPeers.filter(
    (peer) =>
      peer.id !== localProfile?.id &&
      !roomMemberIds.has(peer.id) &&
      !pendingMemberIds.has(peer.id)
  );

  useEffect(() => {
    setShowAddMembers(false);
    setAddingMemberId(null);
    setPendingMemberIds(new Set());
    setMemberInviteError(null);
  }, [room.id]);

  useEffect(() => {
    if (!room.members.length) return;
    setPendingMemberIds((previous) => {
      const next = new Set(previous);
      room.members.forEach((member) => next.delete(member.id));
      return next.size === previous.size ? previous : next;
    });
  }, [room.members]);

  useEffect(() => {
    if (!showMemberList) return;

    const handleOutsidePointerDown = (event: MouseEvent) => {
      if (memberControlRef.current && !memberControlRef.current.contains(event.target as Node)) {
        setShowMemberList(false);
      }
    };

    document.addEventListener('mousedown', handleOutsidePointerDown);
    return () => document.removeEventListener('mousedown', handleOutsidePointerDown);
  }, [showMemberList]);

  const handleInviteMember = async (peer: Peer) => {
    if (!canAddMembers || addingMemberId) return;

    setAddingMemberId(peer.id);
    setMemberInviteError(null);

    try {
      const result = await window.subnet.inviteToPrivateRoom(room.id, peer.id);
      if (!result.success) {
        setMemberInviteError(result.error || `Could not invite ${peer.name}`);
        return;
      }

      setPendingMemberIds((previous) => new Set(previous).add(peer.id));
    } catch (error: any) {
      setMemberInviteError(error?.message || `Could not invite ${peer.name}`);
    } finally {
      setAddingMemberId(null);
    }
  };

  // Load room messages and subscribe to updates
  useEffect(() => {
    let isMounted = true;

    if (window.subnet?.getRoomMessages) {
      window.subnet.getRoomMessages(room.id).then((msgs) => {
        if (isMounted) setMessages(msgs);
      }).catch(console.error);
    }

    if (window.subnet?.markRoomRead) {
      window.subnet.markRoomRead(room.id);
    }

    const unsubMsg = window.subnet?.onRoomMessageReceived?.((msg: RoomMessage) => {
      if (msg.roomId === room.id) {
        setMessages((prev) => {
          if (prev.some((m) => m.id === msg.id)) {
            return prev.map((m) => (m.id === msg.id ? { ...m, ...msg } : m));
          }
          return [...prev, msg];
        });
        if (window.subnet?.markRoomRead) {
          window.subnet.markRoomRead(room.id);
        }
      }
    });

    const unsubProgress = window.subnet?.onTransferProgress?.((progress: FileTransferProgress) => {
      setTransferProgressMap((prev) => ({
        ...prev,
        [progress.transferId]: progress,
      }));

      if (
        progress.status === 'completed' ||
        progress.status === 'failed' ||
        progress.status === 'cancelled'
      ) {
        window.subnet?.getRoomMessages?.(room.id).then((stored) => {
          if (Array.isArray(stored)) {
            setMessages(stored);
          }
        }).catch(console.error);
      }
    });

    return () => {
      isMounted = false;
      if (unsubMsg) unsubMsg();
      if (unsubProgress) unsubProgress();
    };
  }, [room.id]);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || isSending || isClosed) return;

    const text = inputText.trim();
    setInputText('');
    setIsSending(true);
    inputRef.current?.focus();

    try {
      if (window.subnet?.sendRoomMessage) {
        const res = await window.subnet.sendRoomMessage(room.id, text);
        if (!res.success) {
          setErrorMessage(res.error || 'Failed to send room message');
          setInputText(text);
        }
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Error sending room message');
      setInputText(text);
    } finally {
      setIsSending(false);
      inputRef.current?.focus();
    }
  };

  const handleAttachFiles = async () => {
    try {
      const selected = await window.subnet.selectAttachmentFiles();
      if (!selected || !selected.success || !selected.files || selected.files.length === 0) {
        inputRef.current?.focus();
        return;
      }

      setIsSending(true);
      setErrorMessage(null);

      for (const file of selected.files) {
        const res = await window.subnet.sendAttachment(room.id, 'room', file.filePath);
        if (!res.success) {
          setErrorMessage(res.error || `Failed to send ${file.fileName}`);
        }
      }

      const stored = await window.subnet.getRoomMessages(room.id);
      if (Array.isArray(stored)) setMessages(stored);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to send attachment');
    } finally {
      setIsSending(false);
      inputRef.current?.focus();
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
        room.id,
        'room',
        media
      );
      if (res.success) {
        const stored = await window.subnet.getRoomMessages(room.id);
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

  const handleDownloadAttachment = async (msg: RoomMessage) => {
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

  const formatMessageTime = (timestamp: number): string => {
    if (!timestamp) return '';
    return new Date(timestamp).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="room-chat-pane">
      {/* Top Header */}
      <header className="room-chat-header">
        <div className="room-header-left">
          <div className="room-header-avatar">
            <MascotAvatar id={room.id} name={room.name} size={32} />
          </div>

          <div className="room-header-meta">
            <div className="room-title-row">
              <h2 className="room-header-title">{room.name}</h2>
              <span className={`room-type-badge ${isAnonymous ? 'anon' : 'private'}`}>
                {isAnonymous ? 'Anonymous' : 'Private'}
              </span>
              {isClosed && <span className="room-status-badge closed">Closed</span>}
            </div>
            <span className="room-header-sub">
              {room.members.length} {room.members.length === 1 ? 'member' : 'members'} • You are "
              <strong>{room.myNickname}</strong>"
            </span>
          </div>
        </div>

        <div className="room-header-right">
          <div className="room-members-control" ref={memberControlRef}>
            <button
              type="button"
              className={`btn-header-action ${showMemberList ? 'active' : ''}`}
              onClick={() => setShowMemberList(!showMemberList)}
              title="View participants"
            >
              <Info style={{ width: 15, height: 15 }} />
              <span>Members ({room.members.length})</span>
            </button>

            {showMemberList && (
              <div className="member-list-popover">
                <div className="popover-header">
                  {showAddMembers ? (
                    <button
                      type="button"
                      className="popover-back-btn"
                      onClick={() => {
                        setShowAddMembers(false);
                        setMemberInviteError(null);
                      }}
                    >
                      <span aria-hidden="true">‹</span>
                      <span>Members</span>
                    </button>
                  ) : (
                    <h4>Room Members ({room.members.length})</h4>
                  )}
                </div>
                {!showAddMembers && canAddMembers && (
                  <button
                    type="button"
                    className="popover-add-members-btn"
                    onClick={() => {
                      setShowAddMembers(true);
                      setMemberInviteError(null);
                    }}
                  >
                    <UserPlus style={{ width: 14, height: 14 }} />
                    <span>Add members</span>
                  </button>
                )}

                {showAddMembers ? (
                  <>
                    {memberInviteError && (
                      <p className="popover-member-error" role="alert">
                        {memberInviteError}
                      </p>
                    )}
                    <div className="popover-members-scroll">
                      {addablePeers.length === 0 && pendingMemberIds.size === 0 ? (
                        <p className="popover-empty-state">No new users nearby.</p>
                      ) : (
                        <>
                          {addablePeers.map((peer) => (
                            <div key={peer.id} className="popover-add-member-row">
                              <UserAvatar
                                avatarType={peer.avatar?.avatarType}
                                avatarValue={peer.avatar?.avatarValue}
                                size={24}
                                name={peer.name}
                                alt={peer.name}
                                fallbackIconColor="#B58AE8"
                              />
                              <span className="popover-add-member-name">{peer.name}</span>
                              <button
                                type="button"
                                className="popover-add-member-action"
                                onClick={() => handleInviteMember(peer)}
                                disabled={addingMemberId !== null}
                              >
                                {addingMemberId === peer.id ? 'Sending…' : 'Add'}
                              </button>
                            </div>
                          ))}
                          {Array.from(pendingMemberIds).map((peerId) => {
                            const peer = discoveredPeers.find((candidate) => candidate.id === peerId);
                            if (!peer) return null;
                            return (
                              <div key={peer.id} className="popover-add-member-row is-pending">
                                <UserAvatar
                                  avatarType={peer.avatar?.avatarType}
                                  avatarValue={peer.avatar?.avatarValue}
                                  size={24}
                                  name={peer.name}
                                  alt={peer.name}
                                  fallbackIconColor="#B58AE8"
                                />
                                <span className="popover-add-member-name">{peer.name}</span>
                                <span className="popover-add-member-status">Invited</span>
                              </div>
                            );
                          })}
                        </>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="popover-members-scroll">
                    {room.members.map((member) => (
                      <div key={member.id} className="member-item-row">
                        <div className="member-item-avatar-wrap">
                          {isAnonymous ? (
                            <MascotAvatar
                              id={member.id}
                              name={member.nickname}
                              size={24}
                            />
                          ) : (
                            <UserAvatar
                              avatarType={member.avatar?.avatarType}
                              avatarValue={member.avatar?.avatarValue}
                              size={24}
                              name={member.nickname}
                              alt={member.nickname}
                              fallbackIconColor="#B58AE8"
                            />
                          )}
                        </div>
                        <div className="member-item-info">
                          <span className="member-item-name">{member.nickname}</span>
                          {member.id === localProfile?.id && (
                            <span className="member-item-you">(You)</span>
                          )}
                          {member.isHost && (
                            <span className="member-item-host-badge">Host</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <button
            type="button"
            className="btn-header-action btn-leave"
            onClick={() => setShowLeaveConfirm(true)}
            title={room.isHost ? 'Close Room' : 'Leave Room'}
          >
            <LogOut style={{ width: 15, height: 15 }} />
            <span>{room.isHost ? 'Close Room' : 'Leave Room'}</span>
          </button>
        </div>
      </header>

      {/* Host Offline or Closed Banner */}
      {isClosed && (
        <div className="room-closed-banner">
          <ShieldAlert style={{ width: 16, height: 16, color: '#f87171', flexShrink: 0 }} />
          <span>
            The room host is offline or has closed this room. Chat history is preserved locally on your
            device.
          </span>
        </div>
      )}

      {/* Pending Room Invitation Action Banner */}
      {room.status === 'invited' && (
        <div className="chat-invitation-action-banner">
          <div className="invitation-action-info">
            <Users style={{ width: 16, height: 16, color: '#B58AE8', flexShrink: 0 }} />
            <span>You have been invited to this private room. Accept to join?</span>
          </div>
          <div className="invitation-action-buttons">
            <button
              type="button"
              className="chat-invitation-decline"
              onClick={() => onLeaveRoom(room.id)}
            >
              <span>Decline</span>
            </button>
            <button
              type="button"
              className="chat-invitation-accept"
              onClick={async () => {
                if (window.subnet?.respondToRoomInvitation) {
                  await window.subnet.respondToRoomInvitation(room.id, true);
                }
              }}
            >
              <span>Accept & Join</span>
            </button>
          </div>
        </div>
      )}

      {/* Error banner */}
      {errorMessage && (
        <div className="chat-error-banner">
          <ShieldAlert style={{ width: 14, height: 14, color: '#ef4444', flexShrink: 0 }} />
          <span>{errorMessage}</span>
          <button className="error-dismiss-btn" onClick={() => setErrorMessage(null)}>
            ×
          </button>
        </div>
      )}

      {/* Main Messages Area */}
      <div className="room-messages-container">
        {messages.length === 0 ? (
          <div className="room-empty-messages">
            {isAnonymous ? (
              <VenetianMask style={{ width: 32, height: 32, color: '#64748b' }} />
            ) : (
              <Users style={{ width: 32, height: 32, color: '#64748b' }} />
            )}
            <h3>Welcome to #{room.name}</h3>
            <p>
              {isAnonymous
                ? 'All messages sent here use your chosen pseudonym and will stay unencrypted over the LAN.'
                : 'Only invited participants can view and exchange messages in this private room.'}
            </p>
          </div>
        ) : (
          messages.map((msg, index) => {
            const isSelf = !!localProfile?.id && msg.senderId === localProfile.id;
            const isConsecutive = index > 0 && messages[index - 1].senderId === msg.senderId;

            // Find member for display name and host status
            const member = room.members.find((m) => m.id === msg.senderId);
            const senderDisplayName = isAnonymous
              ? msg.senderNickname
              : member?.nickname || msg.senderNickname || 'Member';
            const isHost = member?.isHost || msg.senderId === room.hostId;

            return (
              <div
                key={msg.id}
                className={`room-message-row ${isSelf ? 'outgoing' : 'incoming'} ${isConsecutive ? 'consecutive' : ''
                  }`}
              >
                {!isSelf && !isConsecutive && (
                  <div className="room-message-sender-header">
                    <div className="room-message-avatar-wrap">
                      {isAnonymous ? (
                        <MascotAvatar
                          id={msg.senderId || senderDisplayName}
                          name={senderDisplayName}
                          size={22}
                        />
                      ) : (
                        <UserAvatar
                          avatarType={member?.avatar?.avatarType || msg.senderAvatar?.avatarType}
                          avatarValue={member?.avatar?.avatarValue || msg.senderAvatar?.avatarValue}
                          size={22}
                          name={senderDisplayName}
                          alt={senderDisplayName}
                          fallbackIconColor="#B58AE8"
                        />
                      )}
                    </div>
                    <span className="room-message-sender-name">{senderDisplayName}</span>
                    {isHost && <span className="room-message-host-tag">Host</span>}
                  </div>
                )}
                <div className={`room-message-bubble ${isSelf ? 'outgoing' : 'incoming'}`}>
                  {msg.attachment && (
                    <AttachmentBubble
                      attachment={msg.attachment}
                      isMe={isSelf}
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
                  {msg.text ? <p className="room-message-text">{msg.text}</p> : null}
                  <span className="room-message-time">
                    {formatMessageTime(msg.timestamp)}
                  </span>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Message Input Form */}
      <form onSubmit={handleSendMessage} className="room-input-bar">
        {/* Attachment (Finder picker) */}
        <button
          type="button"
          className="chat-composer-action-btn"
          onClick={handleAttachFiles}
          disabled={isClosed || isSending}
          title="Attach files"
          aria-label="Attach files"
        >
          <Paperclip style={{ width: 16, height: 16 }} />
        </button>

        {/* Quick Camera Action */}
        <button
          type="button"
          className="chat-composer-action-btn"
          onClick={() => setCameraModalMode('photo')}
          disabled={isClosed || isSending}
          title="Take photo"
          aria-label="Camera"
        >
          <Camera style={{ width: 16, height: 16 }} />
        </button>

        <input
          ref={inputRef}
          type="text"
          className="room-input-field"
          placeholder={
            isClosed
              ? 'Room is closed. Sending is disabled.'
              : room.status === 'invited'
                ? 'Type a message to accept invitation and reply...'
                : 'type a message .....'
          }
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          disabled={isClosed}
          maxLength={5000}
        />
        <button
          type="submit"
          className="room-send-btn"
          onMouseDown={(e) => e.preventDefault()}
          disabled={isClosed || isSending || !inputText.trim()}
          title="Send message"
        >
          <Send style={{ width: 16, height: 16 }} />
        </button>
      </form>

      {/* Leave Room Confirmation Modal */}
      {showLeaveConfirm && (
        <div className="invitation-backdrop" onClick={() => setShowLeaveConfirm(false)}>
          <div className="invitation-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="invitation-header">
              <span className="invitation-badge">
                <LogOut style={{ width: 14, height: 14 }} />
                <span>{room.isHost ? 'Close Room' : 'Leave Room'}</span>
              </span>
            </div>
            <div className="modal-room-info">
              <h2 className="modal-room-name">
                {room.isHost ? `Close "${room.name}"` : `Leave "${room.name}"`}
              </h2>
              <p className="modal-confirm-desc">
                {room.isHost
                  ? 'Closing this room ends it for everyone. Chat history will be deleted for all members.'
                  : 'Leave this room and remove it from your active rooms. Chat history will be deleted when you leave.'}
              </p>
            </div>
            <div className="modal-actions">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setShowLeaveConfirm(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-destructive"
                onClick={() => {
                  setShowLeaveConfirm(false);
                  onLeaveRoom(room.id);
                }}
              >
                {room.isHost ? 'Close Room' : 'Leave Room'}
              </button>
            </div>
          </div>
        </div>
      )}

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
