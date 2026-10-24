import React, { useState, useEffect, useRef } from 'react';
import {
  Radio,
  Plus,
  Inbox,
  PanelLeftClose,
  PanelLeftOpen,
  MessageSquare,
  Compass,
  Users,
  VenetianMask,
  MoreVertical,
  Trash2,
  UserX,
  LogOut,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import type { ConversationSummary, Peer, LocalProfile, RoomSummary, UserSettings } from '../types/subnet';
import UserAvatar from './UserAvatar';

export type ActiveView =
  | { type: 'radar' }
  | { type: 'chat'; peerId: string; peer: Peer }
  | { type: 'requests' }
  | { type: 'create-room' }
  | { type: 'find-room' }
  | { type: 'room'; roomId: string }
  | { type: 'settings' };

interface SidebarProps {
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  activeView: ActiveView;
  onSelectRadar: () => void;
  onSelectCreateRoom: () => void;
  onSelectFindRoom: () => void;
  onSelectRequests: () => void;
  onSelectConversation: (peer: Peer) => void;
  onSelectRoom: (roomId: string) => void;
  onDeleteConversation: (peerId: string) => void;
  onEndConversation: (peerId: string) => void;
  onDeleteRoom: (roomId: string) => void;
  conversations: ConversationSummary[];
  rooms: RoomSummary[];
  discoveredPeers: Peer[];
  pendingRequestsCount: number;
  localProfile: LocalProfile | null;
  userSettings?: UserSettings;
  onSelectSettings: () => void;
}

export default function Sidebar({
  isCollapsed,
  onToggleCollapse,
  activeView,
  onSelectRadar,
  onSelectCreateRoom,
  onSelectFindRoom,
  onSelectRequests,
  onSelectConversation,
  onSelectRoom,
  onDeleteConversation,
  onEndConversation,
  onDeleteRoom,
  conversations,
  rooms,
  discoveredPeers,
  pendingRequestsCount,
  localProfile,
  userSettings,
  onSelectSettings,
}: SidebarProps): React.JSX.Element {
  // Menu dropdown state
  const [activeMenuPeerId, setActiveMenuPeerId] = useState<string | null>(null);
  const [activeMenuRoomId, setActiveMenuRoomId] = useState<string | null>(null);

  // Expandable sections state with local persistence
  const [roomsExpanded, setRoomsExpanded] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('subnet_sidebar_rooms_expanded');
      return saved !== null ? saved === 'true' : true;
    } catch {
      return true;
    }
  });

  const [chatsExpanded, setChatsExpanded] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('subnet_sidebar_chats_expanded');
      return saved !== null ? saved === 'true' : true;
    } catch {
      return true;
    }
  });

  const toggleRoomsExpanded = () => {
    setRoomsExpanded((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('subnet_sidebar_rooms_expanded', String(next));
      } catch {}
      return next;
    });
  };

  const toggleChatsExpanded = () => {
    setChatsExpanded((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('subnet_sidebar_chats_expanded', String(next));
      } catch {}
      return next;
    });
  };

  const roomsUnreadCount = rooms.reduce((acc, r) => acc + (r.unreadCount || 0), 0);
  const chatsUnreadCount = conversations.reduce((acc, c) => acc + (c.unreadCount || 0), 0);

  // Confirmation modals state
  const [convToDelete, setConvToDelete] = useState<{ peerId: string; peerName: string } | null>(null);
  const [convToEnd, setConvToEnd] = useState<{ peerId: string; peerName: string } | null>(null);
  const [roomToDelete, setRoomToDelete] = useState<{ id: string; name: string } | null>(null);

  const menuRef = useRef<HTMLDivElement>(null);

  // Close menus on outside click or Escape key
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setActiveMenuPeerId(null);
        setActiveMenuRoomId(null);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setActiveMenuPeerId(null);
        setActiveMenuRoomId(null);
        setConvToDelete(null);
        setConvToEnd(null);
        setRoomToDelete(null);
      }
    };
    window.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const formatRelativeTime = (timestamp: number): string => {
    if (!timestamp) return '';
    const now = Date.now();
    const diff = Math.max(0, now - timestamp);
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (seconds < 60) return 'Just now';
    if (minutes < 60) return `${minutes}m`;
    if (hours < 24) return `${hours}h`;
    if (days < 7) return `${days}d`;
    return new Date(timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  const isRadarActive = activeView.type === 'radar';
  const isRequestsActive = activeView.type === 'requests';
  const isCreateRoomActive = activeView.type === 'create-room';
  const isFindRoomActive = activeView.type === 'find-room';

  return (
    <aside className={`subnet-sidebar ${isCollapsed ? 'collapsed' : ''}`} ref={menuRef}>
      {/* Top draggable area with branding and collapse toggle */}
      <div className="sidebar-header">
        {!isCollapsed && (
          <div className="sidebar-brand" onClick={onSelectRadar} role="button" tabIndex={0}>
            <Radio className="sidebar-brand-icon" />
            <span className="sidebar-brand-title">Subnet</span>
            <span className="sidebar-brand-tag">v0.1.0</span>
          </div>
        )}

        <button
          type="button"
          className="sidebar-collapse-toggle"
          onClick={onToggleCollapse}
          title={isCollapsed ? 'Expand sidebar (⌘B)' : 'Collapse sidebar (⌘B)'}
          aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {isCollapsed ? (
            <PanelLeftOpen style={{ width: 17, height: 17 }} />
          ) : (
            <PanelLeftClose style={{ width: 17, height: 17 }} />
          )}
        </button>
      </div>

      {/* Main navigation actions */}
      <div className="sidebar-actions-section">
        {/* New Chat / Radar */}
        <button
          type="button"
          className={`sidebar-nav-btn new-chat-btn ${isRadarActive ? 'active' : ''}`}
          onClick={onSelectRadar}
          title="New Chat (Radar)"
        >
          <Plus style={{ width: 16, height: 16, flexShrink: 0 }} />
          {!isCollapsed && <span>New Chat</span>}
        </button>

        {/* Create Room */}
        <button
          type="button"
          className={`sidebar-nav-btn ${isCreateRoomActive ? 'active' : ''}`}
          onClick={onSelectCreateRoom}
          title="Create Room"
        >
          <Plus style={{ width: 16, height: 16, flexShrink: 0, color: '#38bdf8' }} />
          {!isCollapsed && <span>Create Room</span>}
        </button>

        {/* Find Room */}
        <button
          type="button"
          className={`sidebar-nav-btn ${isFindRoomActive ? 'active' : ''}`}
          onClick={onSelectFindRoom}
          title="Find Room"
        >
          <Compass style={{ width: 16, height: 16, flexShrink: 0, color: '#a855f7' }} />
          {!isCollapsed && <span>Find Room</span>}
        </button>

        {/* Requests Navigation item with live badge */}
        <button
          type="button"
          className={`sidebar-nav-btn requests-nav-btn ${isRequestsActive ? 'active' : ''}`}
          onClick={onSelectRequests}
          title={`Requests (${pendingRequestsCount} pending)`}
        >
          <div className="nav-btn-icon-wrap">
            <Inbox style={{ width: 16, height: 16, flexShrink: 0 }} />
            {isCollapsed && pendingRequestsCount > 0 && (
              <span className="collapsed-badge-dot" />
            )}
          </div>
          {!isCollapsed && (
            <>
              <span className="nav-btn-label">Requests</span>
              {pendingRequestsCount > 0 && (
                <span className="requests-live-badge">{pendingRequestsCount}</span>
              )}
            </>
          )}
        </button>
      </div>

      {/* Main scrollable list for Chats and Rooms */}
      <div className="sidebar-scrollable-content">
        {/* ROOMS Section */}
        <div className="sidebar-rooms-section">
          {!isCollapsed && (
            <div className="sidebar-section-header-wrap">
              <button
                type="button"
                className="sidebar-section-header-btn"
                onClick={toggleRoomsExpanded}
                aria-expanded={roomsExpanded}
                aria-controls="sidebar-rooms-list"
                aria-label={roomsExpanded ? 'Collapse Rooms section' : 'Expand Rooms section'}
              >
                <div className="section-header-left">
                  <span className="section-header-title">ROOMS</span>
                  {rooms.length > 0 && <span className="chats-count-tag">{rooms.length}</span>}
                </div>
                <div className="section-header-right">
                  {!roomsExpanded && roomsUnreadCount > 0 && (
                    <span className="section-collapsed-unread">{roomsUnreadCount}</span>
                  )}
                  {roomsExpanded ? (
                    <ChevronDown className="section-chevron" style={{ width: 14, height: 14 }} aria-hidden="true" />
                  ) : (
                    <ChevronUp className="section-chevron" style={{ width: 14, height: 14 }} aria-hidden="true" />
                  )}
                </div>
              </button>
            </div>
          )}

          {(roomsExpanded || isCollapsed) && (
            <div id="sidebar-rooms-list" className="sidebar-rooms-list">
            {rooms.length === 0 ? (
              !isCollapsed && (
                <div className="sidebar-empty-hint">
                  <span>No rooms joined yet</span>
                </div>
              )
            ) : (
              rooms.map((room) => {
                const isSelected = activeView.type === 'room' && activeView.roomId === room.id;
                const isAnon = room.type === 'anonymous';
                const isClosed = room.status === 'closed';

                return (
                  <div
                    key={room.id}
                    className={`sidebar-chat-row sidebar-room-row ${isSelected ? 'selected' : ''} ${
                      room.unreadCount > 0 ? 'unread' : ''
                    }`}
                    onClick={() => onSelectRoom(room.id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onSelectRoom(room.id);
                      }
                    }}
                    title={isCollapsed ? `${room.name} (${isAnon ? 'Anonymous' : 'Private'})` : undefined}
                  >
                    <div className={`chat-row-avatar-wrap ${isAnon ? 'room-anon' : 'room-private'}`}>
                      {isAnon ? (
                        <VenetianMask style={{ width: 16, height: 16, color: '#c084fc' }} />
                      ) : (
                        <Users style={{ width: 16, height: 16, color: '#38bdf8' }} />
                      )}
                    </div>

                    {!isCollapsed && (
                      <div className="chat-row-content">
                        <div className="chat-row-top">
                          <span className="chat-row-name room-name">{room.name}</span>
                          <span className="chat-row-time">
                            {formatRelativeTime(room.lastTimestamp)}
                          </span>
                        </div>
                        <div className="chat-row-bottom">
                          <span className="chat-row-preview">
                            {isClosed ? 'Room closed' : room.lastMessage || `${room.memberCount} members`}
                          </span>
                          {room.unreadCount > 0 && (
                            <span className="chat-row-unread-badge">{room.unreadCount}</span>
                          )}
                        </div>
                      </div>
                    )}

                    {/* 3-dot action menu for room */}
                    {!isCollapsed && (
                      <div className="chat-row-menu-container" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          className="chat-row-menu-trigger"
                          onClick={() =>
                            setActiveMenuRoomId(activeMenuRoomId === room.id ? null : room.id)
                          }
                          title="Room actions"
                          aria-label="Room actions"
                        >
                          <MoreVertical style={{ width: 14, height: 14 }} />
                        </button>

                        {activeMenuRoomId === room.id && (
                          <div className="chat-row-dropdown-menu">
                            <button
                              type="button"
                              className="dropdown-menu-item item-destructive"
                              onClick={() => {
                                setActiveMenuRoomId(null);
                                setRoomToDelete({ id: room.id, name: room.name });
                              }}
                            >
                              <LogOut style={{ width: 13, height: 13 }} />
                              <span>{room.isHost ? 'Close Room' : 'Leave Room'}</span>
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                    {isCollapsed && room.unreadCount > 0 && (
                      <span className="collapsed-unread-indicator">{room.unreadCount}</span>
                    )}
                  </div>
                );
              })
            )}
          </div>
          )}
        </div>

        {/* CHATS Section (Direct 1-to-1 Conversations) */}
        <div className="sidebar-chats-section">
          {!isCollapsed && (
            <div className="sidebar-section-header-wrap">
              <button
                type="button"
                className="sidebar-section-header-btn"
                onClick={toggleChatsExpanded}
                aria-expanded={chatsExpanded}
                aria-controls="sidebar-chats-scroll"
                aria-label={chatsExpanded ? 'Collapse Chats section' : 'Expand Chats section'}
              >
                <div className="section-header-left">
                  <span className="section-header-title">CHATS</span>
                  {conversations.length > 0 && (
                    <span className="chats-count-tag">{conversations.length}</span>
                  )}
                </div>
                <div className="section-header-right">
                  {!chatsExpanded && chatsUnreadCount > 0 && (
                    <span className="section-collapsed-unread">{chatsUnreadCount}</span>
                  )}
                  {chatsExpanded ? (
                    <ChevronDown className="section-chevron" style={{ width: 14, height: 14 }} aria-hidden="true" />
                  ) : (
                    <ChevronUp className="section-chevron" style={{ width: 14, height: 14 }} aria-hidden="true" />
                  )}
                </div>
              </button>
            </div>
          )}

          {(chatsExpanded || isCollapsed) && (
            <div id="sidebar-chats-scroll" className="sidebar-chats-scroll">
            {conversations.length === 0 ? (
              !isCollapsed && (
                <div className="sidebar-empty-chats">
                  <MessageSquare style={{ width: 20, height: 20, color: '#475569' }} />
                  <span>No chats yet</span>
                  <p>Click "New Chat" to discover nearby devices.</p>
                </div>
              )
            ) : (
              conversations.map((conv) => {
                const onlinePeer = discoveredPeers.find((p) => p.id === conv.peerId);
                const isOnline = Boolean(onlinePeer);
                const isSelected = activeView.type === 'chat' && activeView.peerId === conv.peerId;
                const peerObject: Peer = onlinePeer || {
                  id: conv.peerId,
                  name: conv.peerName,
                };

                const previewText =
                  conv.status === 'pending_incoming'
                    ? 'Incoming request...'
                    : conv.status === 'pending_outgoing'
                    ? 'Request sent...'
                    : conv.status === 'declined'
                    ? 'Request declined'
                    : conv.lastMessage || 'No messages';

                return (
                  <div
                    key={conv.peerId}
                    className={`sidebar-chat-row ${isSelected ? 'selected' : ''} ${
                      conv.unreadCount > 0 ? 'unread' : ''
                    }`}
                    onClick={() => onSelectConversation(peerObject)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onSelectConversation(peerObject);
                      }
                    }}
                    title={isCollapsed ? `${conv.peerName}: ${previewText}` : undefined}
                  >
                    <div className="chat-row-avatar-wrap">
                      <UserAvatar
                        avatarType={onlinePeer?.avatar?.avatarType || conv.peerAvatar?.avatarType}
                        avatarValue={onlinePeer?.avatar?.avatarValue || conv.peerAvatar?.avatarValue}
                        size={24}
                        fallbackIconColor={isOnline ? '#38bdf8' : '#64748b'}
                      />
                      <span className={`online-indicator-dot ${isOnline ? 'online' : 'offline'}`} />
                    </div>

                    {!isCollapsed && (
                      <div className="chat-row-content">
                        <div className="chat-row-top">
                          <span className="chat-row-name">{conv.peerName}</span>
                          <span className="chat-row-time">
                            {formatRelativeTime(conv.lastTimestamp)}
                          </span>
                        </div>
                        <div className="chat-row-bottom">
                          <span
                            className={`chat-row-preview ${
                              conv.status === 'pending_incoming'
                                ? 'pending'
                                : conv.status === 'declined'
                                ? 'declined'
                                : ''
                            }`}
                          >
                            {previewText}
                          </span>
                          {conv.unreadCount > 0 && (
                            <span className="chat-row-unread-badge">{conv.unreadCount}</span>
                          )}
                        </div>
                      </div>
                    )}

                    {/* 3-dot action menu for conversation */}
                    {!isCollapsed && (
                      <div className="chat-row-menu-container" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          className="chat-row-menu-trigger"
                          onClick={() =>
                            setActiveMenuPeerId(
                              activeMenuPeerId === conv.peerId ? null : conv.peerId
                            )
                          }
                          title="Conversation actions"
                          aria-label="Conversation actions"
                        >
                          <MoreVertical style={{ width: 14, height: 14 }} />
                        </button>

                        {activeMenuPeerId === conv.peerId && (
                          <div className="chat-row-dropdown-menu">
                            <button
                              type="button"
                              className="dropdown-menu-item"
                              onClick={() => {
                                setActiveMenuPeerId(null);
                                setConvToDelete({
                                  peerId: conv.peerId,
                                  peerName: conv.peerName,
                                });
                              }}
                            >
                              <Trash2 style={{ width: 13, height: 13 }} />
                              <span>Delete Chat (Local)</span>
                            </button>
                            <button
                              type="button"
                              className="dropdown-menu-item item-destructive"
                              onClick={() => {
                                setActiveMenuPeerId(null);
                                setConvToEnd({
                                  peerId: conv.peerId,
                                  peerName: conv.peerName,
                                });
                              }}
                            >
                              <UserX style={{ width: 13, height: 13 }} />
                              <span>End Conversation</span>
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                    {isCollapsed && conv.unreadCount > 0 && (
                      <span className="collapsed-unread-indicator">{conv.unreadCount}</span>
                    )}
                  </div>
                );
              })
            )}
          </div>
          )}
        </div>
      </div>

      {/* User Device Profile Footer */}
      <div className="sidebar-footer">
        <div
          className={`sidebar-profile-node ${activeView.type === 'settings' ? 'active' : ''}`}
          title={`${localProfile?.name || 'Local Device'} — Click to open Profile & Settings`}
          role="button"
          tabIndex={0}
          onClick={onSelectSettings}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onSelectSettings();
            }
          }}
        >
          <div className="profile-avatar">
            <UserAvatar
              avatarType={userSettings?.avatarType}
              avatarValue={userSettings?.avatarValue}
              size={26}
              fallbackIconColor="#38bdf8"
            />
          </div>
          {!isCollapsed && (
            <div className="profile-info">
              <span className="profile-name">{localProfile?.name || 'My Mac'}</span>
              <span className="profile-tag">Profile</span>
            </div>
          )}
        </div>
      </div>

      {/* Delete Chat Confirmation Modal */}
      {convToDelete && (
        <div className="invitation-backdrop" onClick={() => setConvToDelete(null)}>
          <div className="invitation-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="invitation-header">
              <span className="invitation-badge destructive-badge">
                <AlertTriangle style={{ width: 14, height: 14 }} />
                <span>Delete Chat</span>
              </span>
            </div>

            <div className="modal-room-info">
              <h2 className="modal-room-name">Delete conversation with {convToDelete.peerName}?</h2>
              <p className="modal-confirm-desc">
                All messages and chat history for this conversation will be permanently deleted from
                this device only.
              </p>
              <p className="modal-sub-notice">
                Note: This only deletes your local history. The other peer's device and history will not
                be affected.
              </p>
            </div>

            <div className="modal-actions">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setConvToDelete(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-destructive"
                onClick={() => {
                  const peerId = convToDelete.peerId;
                  setConvToDelete(null);
                  onDeleteConversation(peerId);
                }}
              >
                Delete Chat
              </button>
            </div>
          </div>
        </div>
      )}

      {/* End Conversation Confirmation Modal */}
      {convToEnd && (
        <div className="invitation-backdrop" onClick={() => setConvToEnd(null)}>
          <div className="invitation-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="invitation-header">
              <span className="invitation-badge destructive-badge">
                <AlertTriangle style={{ width: 14, height: 14 }} />
                <span>End Conversation</span>
              </span>
            </div>

            <div className="modal-room-info">
              <h2 className="modal-room-name">End conversation with {convToEnd.peerName}?</h2>
              <p className="modal-confirm-desc">
                This will permanently end the conversation and delete the chat history on both your
                device and {convToEnd.peerName}'s device. New messages cannot be sent without sending
                a fresh chat invitation.
              </p>
              <p className="modal-sub-notice">
                Important: The other peer must be connected to the local network to confirm remote
                deletion. An offline device cannot be remotely erased until it reconnects.
              </p>
            </div>

            <div className="modal-actions">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setConvToEnd(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-destructive"
                onClick={() => {
                  const peerId = convToEnd.peerId;
                  setConvToEnd(null);
                  onEndConversation(peerId);
                }}
              >
                End Conversation
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Leave / Delete / Close Room Confirmation Modal */}
      {roomToDelete && (() => {
        const targetRoom = rooms.find((r) => r.id === roomToDelete.id);
        const isHost = targetRoom?.isHost;
        return (
          <div className="invitation-backdrop" onClick={() => setRoomToDelete(null)}>
            <div className="invitation-modal-card" onClick={(e) => e.stopPropagation()}>
              <div className="invitation-header">
                <span className={`invitation-badge ${isHost ? 'destructive-badge' : ''}`}>
                  <LogOut style={{ width: 14, height: 14 }} />
                  <span>{isHost ? 'Close Room' : 'Leave Room'}</span>
                </span>
              </div>

              <div className="modal-room-info">
                <h2 className="modal-room-name">
                  {isHost ? `Close "${roomToDelete.name}"?` : `Leave "${roomToDelete.name}"?`}
                </h2>
                <p className="modal-confirm-desc">
                  {isHost
                    ? 'Are you sure you want to close this room? As host, this will immediately terminate the room for all participants and permanently delete the room and its chat history for everyone, including yourself.'
                    : 'Are you sure you want to leave this room? Your local chat history for this room will be removed. The room will remain active for other participants.'}
                </p>
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setRoomToDelete(null)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn-destructive"
                  onClick={() => {
                    const roomId = roomToDelete.id;
                    setRoomToDelete(null);
                    onDeleteRoom(roomId);
                  }}
                >
                  {isHost ? 'Close Room' : 'Leave Room'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </aside>
  );
}
