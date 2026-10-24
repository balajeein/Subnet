import React, { useState } from 'react';
import {
  Users,
  VenetianMask,
  Check,
  X,
  Radio,
  DoorOpen,
} from 'lucide-react';
import type { RoomSummary, DiscoveredRoom } from '../types/subnet';
import MascotAvatar from './MascotAvatar';

interface FindRoomViewProps {
  rooms: RoomSummary[];
  discoveredAnonymousRooms: DiscoveredRoom[];
  defaultAnonymousNickname?: string;
  onAcceptRoomInvitation: (roomId: string) => void;
  onDeclineRoomInvitation: (roomId: string) => void;
  onOpenRoom: (roomId: string) => void;
  onJoinAnonymousRoom: (roomId: string, nickname: string) => Promise<{ success: boolean; error?: string }>;
  onOpenCreateRoom: () => void;
  onCancel: () => void;
}

export default function FindRoomView({
  rooms,
  discoveredAnonymousRooms,
  defaultAnonymousNickname,
  onAcceptRoomInvitation,
  onDeclineRoomInvitation,
  onOpenRoom,
  onJoinAnonymousRoom,
  onOpenCreateRoom,
}: FindRoomViewProps): React.JSX.Element {
  const [activeTab, setActiveTab] = useState<'private' | 'anonymous'>('private');

  // Join modal state for anonymous room
  const [joiningRoom, setJoiningRoom] = useState<DiscoveredRoom | null>(null);
  const [joinNickname, setJoinNickname] = useState<string>('');
  const [isJoining, setIsJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  // Filter private rooms from local store (only invited or joined private rooms)
  const privateRooms = rooms.filter((r) => r.type === 'private');
  const pendingPrivateInvites = privateRooms.filter((r) => r.status === 'invited');
  const joinedPrivateRooms = privateRooms.filter((r) => r.status === 'joined');

  const handleOpenJoinModal = (room: DiscoveredRoom) => {
    setJoiningRoom(room);
    setJoinNickname(defaultAnonymousNickname?.trim() || '');
    setJoinError(null);
  };

  const handleConfirmJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!joiningRoom) return;

    setJoinError(null);
    const trimmedNick = joinNickname.trim();
    if (!trimmedNick) {
      setJoinError('Please enter a nickname to join this room');
      return;
    }
    if (trimmedNick.length < 3 || trimmedNick.length > 15) {
      setJoinError('Nickname must be between 3 and 15 characters');
      return;
    }

    setIsJoining(true);
    try {
      const res = await onJoinAnonymousRoom(joiningRoom.id, trimmedNick);
      if (res.success) {
        setJoiningRoom(null);
        onOpenRoom(joiningRoom.id);
      } else {
        setJoinError(res.error || 'Failed to join anonymous room');
      }
    } catch {
      setJoinError('Unable to join anonymous room. Please check the nickname and try again.');
    } finally {
      setIsJoining(false);
    }
  };

  return (
    <div className="find-room-container">
      {/* Top Header */}
      <div className="find-room-header">
        <h1 className="find-room-title">Find Room</h1>
      </div>

      <div className="find-room-body">
        {/* Tab Navigation */}
        <div className="find-room-tabs">
          <button
            type="button"
            className={`find-tab-btn ${activeTab === 'private' ? 'active' : ''}`}
            onClick={() => setActiveTab('private')}
          >
            <Users style={{ width: 17, height: 17 }} />
            <span>Private Rooms</span>
            {pendingPrivateInvites.length > 0 && (
              <span className="tab-badge">{pendingPrivateInvites.length}</span>
            )}
          </button>

          <button
            type="button"
            className={`find-tab-btn ${activeTab === 'anonymous' ? 'active' : ''}`}
            onClick={() => setActiveTab('anonymous')}
          >
            <VenetianMask style={{ width: 17, height: 17 }} />
            <span>Anonymous Rooms</span>
            {discoveredAnonymousRooms.length > 0 && (
              <span className="tab-badge">{discoveredAnonymousRooms.length}</span>
            )}
          </button>
        </div>

        {/* Tab 1: Private Rooms */}
        {activeTab === 'private' && (
          <div className="find-room-section">
            {/* Pending Invitations Sub-section */}
            {pendingPrivateInvites.length > 0 && (
              <div className="invitations-group">
                <h2 className="group-heading">
                  Pending Room Invitations ({pendingPrivateInvites.length})
                </h2>
                <div className="room-cards-grid">
                  {pendingPrivateInvites.map((room) => (
                    <div key={room.id} className="room-card invite-card">
                      <div className="room-card-top">
                        <div className="room-card-icon-wrap">
                          <MascotAvatar id={room.id} name={room.name} size={36} />
                        </div>
                        <div className="room-card-meta">
                          <h3 className="room-card-name">{room.name}</h3>
                          <span className="room-card-host">
                            Invited by host • {room.members.length} members
                          </span>
                        </div>
                        <span className="room-card-tag invite">Invitation</span>
                      </div>

                      <div className="room-card-actions">
                        <button
                          type="button"
                          className="btn-decline"
                          onClick={() => onDeclineRoomInvitation(room.id)}
                          title="Decline invitation"
                        >
                          <X style={{ width: 15, height: 15 }} />
                          <span>Decline</span>
                        </button>
                        <button
                          type="button"
                          className="btn-accept"
                          onClick={() => onAcceptRoomInvitation(room.id)}
                          title="Accept invitation and join room"
                        >
                          <Check style={{ width: 15, height: 15 }} />
                          <span>Accept & Join</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Joined Private Rooms Sub-section */}
            {joinedPrivateRooms.length > 0 && (
              <div className="joined-group">
                <h2 className="group-heading">
                  Joined Private Rooms ({joinedPrivateRooms.length})
                </h2>
                <div className="room-cards-grid">
                  {joinedPrivateRooms.map((room) => (
                    <div
                      key={room.id}
                      className="room-card joined-card"
                      onClick={() => onOpenRoom(room.id)}
                      role="button"
                      tabIndex={0}
                    >
                      <div className="room-card-top">
                        <div className="room-card-icon-wrap">
                          <MascotAvatar id={room.id} name={room.name} size={36} />
                        </div>
                        <div className="room-card-meta">
                          <h3 className="room-card-name">{room.name}</h3>
                          <span className="room-card-host">
                            {room.memberCount} {room.memberCount === 1 ? 'member' : 'members'}
                            {room.isHost ? ' • You are host' : ''}
                          </span>
                        </div>
                        <span className="room-card-tag joined">Joined</span>
                      </div>
                      <div className="room-card-preview">
                        <span>{room.lastMessage || 'No messages yet'}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Empty state when no private rooms or invitations */}
            {pendingPrivateInvites.length === 0 && joinedPrivateRooms.length === 0 && (
              <div className="find-room-empty-state">
                <Users style={{ width: 36, height: 36, color: '#475569' }} />
                <h3>No Private Room Invitations</h3>
                <p>Private rooms are invitation-only. New invitations will appear here.</p>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={onOpenCreateRoom}
                >
                  Create a Private Room
                </button>
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Anonymous Rooms */}
        {activeTab === 'anonymous' && (
          <div className="find-room-section">
            {discoveredAnonymousRooms.length === 0 ? (
              <div className="find-room-empty-state">
                <Radio style={{ width: 36, height: 36, color: '#475569' }} />
                <h3>No anonymous room nearby</h3>
                <p>Anonymous rooms shared by nearby users will appear here.</p>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={onOpenCreateRoom}
                >
                  Host an Anonymous Room
                </button>
              </div>
            ) : (
              <div className="room-cards-grid">
                {discoveredAnonymousRooms.map((room) => {
                  const isFull = !room.isJoinable;
                  const alreadyJoined = rooms.some(
                    (r) => r.id === room.id && r.status === 'joined'
                  );

                  return (
                    <div key={room.id} className="room-card anon-card">
                      <div className="room-card-top">
                        <div className="room-card-icon-wrap">
                          <MascotAvatar id={room.id} name={room.name} size={36} />
                        </div>
                        <div className="room-card-meta">
                          <h3 className="room-card-name">{room.name}</h3>
                          <span className="room-card-host">
                            {room.occupancy || 1}
                            {room.capacity ? ` / ${room.capacity} participants` : ((room.occupancy || 1) === 1 ? ' participant' : ' participants')}
                          </span>
                        </div>
                        <span className={`room-card-tag ${isFull ? 'full' : 'open'}`}>
                          {alreadyJoined ? 'Joined' : isFull ? 'Full' : 'Open'}
                        </span>
                      </div>

                      <div className="room-card-footer">
                        <span className="anon-card-disclosure">
                          Anonymous pseudonym required
                        </span>

                        {alreadyJoined ? (
                          <button
                            type="button"
                            className="btn-open-joined"
                            onClick={() => onOpenRoom(room.id)}
                          >
                            Open Room
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="btn-primary btn-join-anon"
                            onClick={() => handleOpenJoinModal(room)}
                            disabled={isFull}
                          >
                            <DoorOpen style={{ width: 15, height: 15 }} />
                            <span>{isFull ? 'Room Full' : 'Join Room'}</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Join Anonymous Room Modal */}
      {joiningRoom && (
        <div className="invitation-backdrop" onClick={() => setJoiningRoom(null)}>
          <div className="invitation-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="invitation-header">
              <span className="invitation-badge">
                <VenetianMask style={{ width: 14, height: 14 }} />
                <span>Join Anonymous Room</span>
              </span>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setJoiningRoom(null)}
              >
                <X style={{ width: 16, height: 16 }} />
              </button>
            </div>

            <div className="modal-room-info">
              <h2 className="modal-room-name">{joiningRoom.name}</h2>
              <span className="modal-room-details">
                {joiningRoom.occupancy || 1}
                {joiningRoom.capacity ? ` / ${joiningRoom.capacity} participants` : (joiningRoom.occupancy === 1 ? ' participant' : ' participants')} on LAN
              </span>
            </div>

            {joinError && (
              <div className="modal-error-banner">
                <span>{joinError}</span>
              </div>
            )}

            <form onSubmit={handleConfirmJoin} className="modal-join-form">
              <div className="form-group">
                <label htmlFor="join-nickname-input" className="form-label">
                  Choose your room display nickname:
                </label>
                <input
                  id="join-nickname-input"
                  type="text"
                  maxLength={15}
                  value={joinNickname}
                  onChange={(e) => setJoinNickname(e.target.value)}
                  className="form-input"
                  placeholder="Enter your room nickname"
                  autoFocus
                  required
                />
                <span className="form-hint">
                  Allowed: 3 to 15 characters (letters, numbers, spaces, dashes)
                </span>
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setJoiningRoom(null)}
                  disabled={isJoining}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={isJoining || !joinNickname.trim()}
                >
                  {isJoining ? 'Joining...' : `Join as "${joinNickname.trim()}"`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
