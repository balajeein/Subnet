import React, { useState, useEffect, useRef } from 'react';
import {
  Users,
  VenetianMask,
  Send,
  ArrowLeft,
  ShieldAlert,
  LogOut,
  Info,
  Plus,
  Paperclip,
  Image as ImageIcon,
  Camera,
  Video,
  X,
} from 'lucide-react';
import type {
  RoomSummary,
  RoomMessage,
  LocalProfile,
  FileTransferProgress,
} from '../types/subnet';
import UserAvatar from './UserAvatar';
import { getAnonymousAvatarForMember } from '../utils/avatars';
import FilePreviewModal from './FilePreviewModal';
import CameraCaptureModal from './CameraCaptureModal';
import AttachmentBubble from './AttachmentBubble';

interface RoomChatPaneProps {
  room: RoomSummary;
  localProfile: LocalProfile | null;
  onClose: () => void;
  onLeaveRoom: (roomId: string) => void;
}

export default function RoomChatPane({
  room,
  localProfile,
  onClose,
  onLeaveRoom,
}: RoomChatPaneProps): React.JSX.Element {
  const [messages, setMessages] = useState<RoomMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [showMemberList, setShowMemberList] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Attachment state
  const [showAttachmentMenu, setShowAttachmentMenu] = useState(false);
  const [previewFile, setPreviewFile] = useState<{
    filePath: string;
    fileName: string;
    fileSize: number;
    mimeType: string;
    thumbnail?: string;
  } | null>(null);
  const [cameraModalMode, setCameraModalMode] = useState<'photo' | 'video' | null>(null);
  const [transferProgressMap, setTransferProgressMap] = useState<Record<string, FileTransferProgress>>({});
  const attachmentMenuRef = useRef<HTMLDivElement>(null);

  const isClosed = room.status === 'closed';
  const isAnonymous = room.type === 'anonymous';

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

  // Click outside or Escape to close attachment menu
  useEffect(() => {
    if (!showAttachmentMenu) return;

    const handleDocumentClick = (e: MouseEvent) => {
      if (
        attachmentMenuRef.current &&
        !attachmentMenuRef.current.contains(e.target as Node)
      ) {
        setShowAttachmentMenu(false);
      }
    };

    const handleDocumentKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowAttachmentMenu(false);
      }
    };

    document.addEventListener('mousedown', handleDocumentClick);
    document.addEventListener('keydown', handleDocumentKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleDocumentClick);
      document.removeEventListener('keydown', handleDocumentKeyDown);
    };
  }, [showAttachmentMenu]);

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

    try {
      if (window.subnet?.sendRoomMessage) {
        const res = await window.subnet.sendRoomMessage(room.id, text);
        if (!res.success) {
          setErrorMessage(res.error || 'Failed to send room message');
        }
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Error sending room message');
    } finally {
      setIsSending(false);
    }
  };

  const handleSelectFile = async (filterType: 'all' | 'media' = 'all') => {
    setShowAttachmentMenu(false);
    try {
      const selected = await window.subnet.selectAttachmentFile(filterType);
      if (selected && selected.success && selected.file) {
        setPreviewFile(selected.file);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to select file');
    }
  };

  const handleConfirmSendFile = async (caption?: string) => {
    if (!previewFile) return;
    const file = previewFile;
    setPreviewFile(null);
    setIsSending(true);
    setErrorMessage(null);

    try {
      const res = await window.subnet.sendAttachment(room.id, 'room', file.filePath, caption);
      if (res.success) {
        const stored = await window.subnet.getRoomMessages(room.id);
        if (Array.isArray(stored)) setMessages(stored);
      } else {
        setErrorMessage(res.error || 'Failed to send file');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to send file');
    } finally {
      setIsSending(false);
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
          <button
            type="button"
            className="room-back-btn"
            onClick={onClose}
            title="Back to Radar"
          >
            <ArrowLeft style={{ width: 17, height: 17 }} />
          </button>

          <div className={`room-header-avatar ${isAnonymous ? 'anon' : 'private'}`}>
            {isAnonymous ? (
              <VenetianMask style={{ width: 18, height: 18, color: '#c084fc' }} />
            ) : (
              <Users style={{ width: 18, height: 18, color: '#38bdf8' }} />
            )}
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
          <button
            type="button"
            className={`btn-header-action ${showMemberList ? 'active' : ''}`}
            onClick={() => setShowMemberList(!showMemberList)}
            title="View participants"
          >
            <Info style={{ width: 15, height: 15 }} />
            <span>Members ({room.members.length})</span>
          </button>

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
            <Users style={{ width: 16, height: 16, color: '#38bdf8', flexShrink: 0 }} />
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
                className={`room-message-row ${isSelf ? 'outgoing' : 'incoming'} ${
                  isConsecutive ? 'consecutive' : ''
                }`}
              >
                {!isSelf && !isConsecutive && (
                  <div className="room-message-sender-header">
                    <div className="room-message-avatar-wrap">
                      {isAnonymous ? (
                        <UserAvatar
                          avatarType="preset"
                          avatarValue={
                            getAnonymousAvatarForMember(room.id, msg.senderId, room.members).id
                          }
                          size={22}
                        />
                      ) : (
                        <UserAvatar
                          avatarType={member?.avatar?.avatarType || msg.senderAvatar?.avatarType}
                          avatarValue={member?.avatar?.avatarValue || msg.senderAvatar?.avatarValue}
                          size={22}
                          fallbackIconColor="#38bdf8"
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

      {/* Member List Drawer / Popover */}
      {showMemberList && (
        <div className="member-list-popover">
          <div className="popover-header">
            <h4>Room Members ({room.members.length})</h4>
            <button
              type="button"
              className="popover-close-btn"
              onClick={() => setShowMemberList(false)}
            >
              ✕
            </button>
          </div>
          <div className="popover-members-scroll">
            {room.members.map((member) => (
              <div key={member.id} className="member-item-row">
                <div className="member-item-avatar-wrap">
                  {isAnonymous ? (
                    <UserAvatar
                      avatarType="preset"
                      avatarValue={
                        getAnonymousAvatarForMember(room.id, member.id, room.members).id
                      }
                      size={24}
                    />
                  ) : (
                    <UserAvatar
                      avatarType={member.avatar?.avatarType}
                      avatarValue={member.avatar?.avatarValue}
                      size={24}
                      fallbackIconColor="#38bdf8"
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
        </div>
      )}

      {/* Message Input Form */}
      <form onSubmit={handleSendMessage} className="room-input-bar">
        {/* Attachment + Button & Menu */}
        <div className="chat-attachment-container" ref={attachmentMenuRef}>
          <button
            type="button"
            className={`chat-attachment-btn ${showAttachmentMenu ? 'active' : ''}`}
            onClick={() => setShowAttachmentMenu((prev) => !prev)}
            disabled={isClosed || isSending}
            title="Attach file or media (+)"
            aria-label="Add attachment"
            aria-expanded={showAttachmentMenu}
          >
            <Plus style={{ width: 18, height: 18 }} />
          </button>

          {showAttachmentMenu && (
            <div className="attachment-dropdown-menu" role="menu">
              <button
                type="button"
                className="attachment-menu-item"
                role="menuitem"
                onClick={() => handleSelectFile('all')}
              >
                <Paperclip style={{ width: 15, height: 15, color: '#38bdf8' }} />
                <span>Choose File</span>
              </button>
              <button
                type="button"
                className="attachment-menu-item"
                role="menuitem"
                onClick={() => handleSelectFile('media')}
              >
                <ImageIcon style={{ width: 15, height: 15, color: '#4ade80' }} />
                <span>Choose Photos/Videos</span>
              </button>
              <button
                type="button"
                className="attachment-menu-item"
                role="menuitem"
                onClick={() => {
                  setShowAttachmentMenu(false);
                  setCameraModalMode('photo');
                }}
              >
                <Camera style={{ width: 15, height: 15, color: '#facc15' }} />
                <span>Take Photo</span>
              </button>
              <button
                type="button"
                className="attachment-menu-item"
                role="menuitem"
                onClick={() => {
                  setShowAttachmentMenu(false);
                  setCameraModalMode('video');
                }}
              >
                <Video style={{ width: 15, height: 15, color: '#f43f5e' }} />
                <span>Record Video</span>
              </button>
              <div className="attachment-menu-divider" />
              <button
                type="button"
                className="attachment-menu-item cancel-item"
                role="menuitem"
                onClick={() => setShowAttachmentMenu(false)}
              >
                <X style={{ width: 15, height: 15 }} />
                <span>Cancel</span>
              </button>
            </div>
          )}
        </div>

        <input
          type="text"
          className="room-input-field"
          placeholder={
            isClosed
              ? 'Room is closed. Sending is disabled.'
              : room.status === 'invited'
              ? 'Type a message to accept invitation and reply...'
              : `Message as "${room.myNickname}"...`
          }
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          disabled={isClosed || isSending}
          maxLength={5000}
        />
        <button
          type="submit"
          className="room-send-btn"
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
                {room.isHost ? `Close "${room.name}"?` : `Leave "${room.name}"?`}
              </h2>
              <p className="modal-confirm-desc">
                {room.isHost
                  ? 'As host, closing this room will terminate it for all members and permanently delete the room and its chat history for everyone, including yourself.'
                  : 'You will leave this room and it will be removed from your active rooms.'}
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
      {previewFile && (
        <FilePreviewModal
          file={previewFile}
          onConfirmSend={handleConfirmSendFile}
          onClose={() => setPreviewFile(null)}
        />
      )}

      {cameraModalMode && (
        <CameraCaptureModal
          mode={cameraModalMode}
          onSendMedia={handleConfirmSendCamera}
          onClose={() => setCameraModalMode(null)}
        />
      )}
    </div>
  );
}
