import React, { useState, useMemo, useEffect } from 'react';
import {
  Users,
  VenetianMask,
  Laptop,
  Plus,
  Search,
  X,
  Check,
} from 'lucide-react';
import type { Peer, LocalProfile } from '../types/subnet';
import UserAvatar from './UserAvatar';

interface CreateRoomViewProps {
  discoveredPeers: Peer[];
  defaultAnonymousNickname?: string;
  localProfile?: LocalProfile | null;
  onCancel: () => void;
  onRoomCreated: (roomId: string) => void;
}

export default function CreateRoomView({
  discoveredPeers,
  defaultAnonymousNickname,
  localProfile,
  onCancel,
  onRoomCreated,
}: CreateRoomViewProps): React.JSX.Element {
  const [roomType, setRoomType] = useState<'private' | 'anonymous'>('private');
  const [roomName, setRoomName] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPeerIds, setSelectedPeerIds] = useState<Set<string>>(new Set());
  const [anonNickname, setAnonNickname] = useState<string>(() => {
    return defaultAnonymousNickname?.trim() || '';
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Filter out host self from available peer list to prevent self-invitation
  const availablePeers = useMemo(() => {
    return discoveredPeers.filter((peer) => {
      if (localProfile?.id && peer.id === localProfile.id) {
        return false;
      }
      return true;
    });
  }, [discoveredPeers, localProfile?.id]);

  // Filter available peers case-insensitively by display name
  const filteredPeers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return availablePeers;
    return availablePeers.filter((peer) =>
      (peer.name || '').toLowerCase().includes(q)
    );
  }, [availablePeers, searchQuery]);

  // Clean up selectedPeerIds if selected peers disappear from LAN discovery
  useEffect(() => {
    setSelectedPeerIds((prev) => {
      if (prev.size === 0) return prev;
      const activePeerIds = new Set(availablePeers.map((p) => p.id));
      let changed = false;
      const next = new Set<string>();
      for (const id of prev) {
        if (activePeerIds.has(id)) {
          next.add(id);
        } else {
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [availablePeers]);

  const handleTogglePeer = (peerId: string) => {
    setSelectedPeerIds((prev) => {
      const next = new Set(prev);
      if (next.has(peerId)) {
        next.delete(peerId);
      } else {
        next.add(peerId);
      }
      return next;
    });
  };

  const handleClearSelection = () => {
    setSelectedPeerIds(new Set());
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const trimmedName = roomName.trim();
    if (!trimmedName) {
      setErrorMessage('Please enter a room name');
      return;
    }

    if (roomType === 'private') {
      if (selectedPeerIds.size === 0) {
        setErrorMessage('Select at least one nearby user to invite to the private room');
        return;
      }

      setIsSubmitting(true);
      try {
        const res = await window.subnet.createPrivateRoom(
          trimmedName,
          Array.from(selectedPeerIds)
        );
        if (res.success && res.roomId) {
          onRoomCreated(res.roomId);
        } else {
          setErrorMessage(res.error || 'Failed to create private room');
        }
      } catch {
        setErrorMessage('Unable to create private room. Please check the room details and try again.');
      } finally {
        setIsSubmitting(false);
      }
    } else {
      const trimmedNick = anonNickname.trim();
      if (!trimmedNick) {
        setErrorMessage('Please enter a nickname for the anonymous room');
        return;
      }
      if (trimmedNick.length < 3 || trimmedNick.length > 15) {
        setErrorMessage('Nickname must be between 3 and 15 characters');
        return;
      }

      setIsSubmitting(true);
      try {
        // Anonymous rooms have no arbitrary participant limits (undefined capacity)
        const res = await window.subnet.createAnonymousRoom(
          trimmedName,
          undefined,
          trimmedNick
        );
        if (res.success && res.roomId) {
          onRoomCreated(res.roomId);
        } else {
          setErrorMessage(res.error || 'Failed to create anonymous room');
        }
      } catch {
        setErrorMessage('Unable to create anonymous room. Please check the room details and try again.');
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  return (
    <div className="create-room-container">
      {/* Top action header */}
      <div className="create-room-header">
        <h1 className="create-room-title">Create Room</h1>
      </div>

      <div className="create-room-card">
        {/* Room Type Selector Tabs */}
        <div className="room-type-tabs">
          <button
            type="button"
            className={`room-type-tab ${roomType === 'private' ? 'active' : ''}`}
            onClick={() => {
              setRoomType('private');
              setErrorMessage(null);
            }}
          >
            <Users style={{ width: 18, height: 18 }} />
            <div className="tab-text">
              <span className="tab-title">Private Room</span>
              <span className="tab-desc">Invitation only</span>
            </div>
          </button>

          <button
            type="button"
            className={`room-type-tab ${roomType === 'anonymous' ? 'active' : ''}`}
            onClick={() => {
              setRoomType('anonymous');
              setErrorMessage(null);
            }}
          >
            <VenetianMask style={{ width: 18, height: 18 }} />
            <div className="tab-text">
              <span className="tab-title">Anonymous Room</span>
              <span className="tab-desc">Anyone can join</span>
            </div>
          </button>
        </div>

        {errorMessage && (
          <div className="create-room-error-banner">
            <span>{errorMessage}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="create-room-form">
          {/* Room Name Input */}
          <div className="form-group">
            <label htmlFor="room-name-input" className="form-label">
              Room Name
            </label>
            <input
              id="room-name-input"
              type="text"
              className="form-input"
              placeholder="Enter room name"
              value={roomName}
              onChange={(e) => setRoomName(e.target.value)}
              maxLength={80}
              autoFocus
              required
            />
          </div>

          {/* Conditional Controls */}
          {roomType === 'private' ? (
            <div className="form-group">
              <div className="member-select-header">
                <label className="form-label" htmlFor="peer-search-input">
                  Select Participants ({selectedPeerIds.size} selected)
                </label>
                <div className="member-select-actions">
                  {selectedPeerIds.size > 0 && (
                    <button
                      type="button"
                      className="btn-clear-selection"
                      onClick={handleClearSelection}
                      title="Clear all selections"
                    >
                      Deselect all
                    </button>
                  )}
                  <span className="form-hint">At least 1 required</span>
                </div>
              </div>

              {/* Search Bar */}
              <div className="private-room-search-bar">
                <Search className="search-bar-icon" style={{ width: 15, height: 15 }} />
                <input
                  id="peer-search-input"
                  type="text"
                  className="peer-search-input"
                  placeholder="Search Users"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') setSearchQuery('');
                  }}
                  aria-label="Search Users"
                />
                {searchQuery.trim().length > 0 && (
                  <button
                    type="button"
                    className="search-clear-btn"
                    onClick={() => setSearchQuery('')}
                    title="Clear search"
                    aria-label="Clear search"
                  >
                    <X style={{ width: 14, height: 14 }} />
                  </button>
                )}
              </div>

              {availablePeers.length === 0 ? (
                <div className="no-peers-box">
                  <Laptop style={{ width: 22, height: 22, color: '#64748b' }} />
                  <p>No nearby users discovered on your LAN yet.</p>
                  <span>Open Subnet on another device on this Wi-Fi network to invite them.</span>
                </div>
              ) : filteredPeers.length === 0 ? (
                <div className="no-peers-box search-empty">
                  <Search style={{ width: 22, height: 22, color: '#64748b' }} />
                  <p>No users match "{searchQuery}"</p>
                  <span>Check for typos or try searching with a different display name.</span>
                  <button
                    type="button"
                    className="btn-clear-query"
                    onClick={() => setSearchQuery('')}
                  >
                    Clear search query
                  </button>
                </div>
              ) : (
                <div className="peers-checklist" role="listbox" aria-label="Discovered users">
                  {filteredPeers.map((peer) => {
                    const isChecked = selectedPeerIds.has(peer.id);
                    return (
                      <label
                        key={peer.id}
                        className={`peer-checkbox-row ${isChecked ? 'checked' : ''}`}
                        tabIndex={0}
                        role="option"
                        aria-selected={isChecked}
                        onKeyDown={(e) => {
                          if (e.key === ' ' || e.key === 'Enter') {
                            e.preventDefault();
                            handleTogglePeer(peer.id);
                          }
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleTogglePeer(peer.id)}
                          className="peer-checkbox-input"
                          tabIndex={-1}
                          aria-label={`Select ${peer.name}`}
                        />
                        <div className="peer-row-avatar-wrap">
                          <UserAvatar
                            avatarType={peer.avatar?.avatarType}
                            avatarValue={peer.avatar?.avatarValue}
                            size={30}
                            name={peer.name}
                            alt={peer.name}
                            fallbackToPreset
                            fallbackIconColor="#B58AE8"
                          />
                        </div>
                        <div className="peer-row-meta">
                          <span className="peer-row-name">{peer.name}</span>
                          <span className="peer-row-host">nearby</span>
                        </div>
                        <div className="peer-row-status-wrap">
                          <span className="peer-online-dot" />
                          <span className="peer-online-label">Online</span>
                        </div>
                        {isChecked && (
                          <span className="peer-selected-badge">
                            <Check style={{ width: 12, height: 12 }} />
                            <span>Selected</span>
                          </span>
                        )}
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <>
              {/* Anonymous Room: Chosen Nickname */}
              <div className="form-group">
                <label htmlFor="anon-nick-input" className="form-label">
                  Your Room Nickname
                </label>
                <input
                  id="anon-nick-input"
                  type="text"
                  maxLength={15}
                  value={anonNickname}
                  onChange={(e) => setAnonNickname(e.target.value)}
                  className="form-input"
                  placeholder="Enter your nickname"
                  required
                />
                <span className="form-hint">
                  Shown to room members instead of your profile name or picture.
                </span>
              </div>

            </>
          )}

          {/* Form Actions */}
          <div className="create-room-actions">
            <button
              type="button"
              className="btn-secondary"
              onClick={onCancel}
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn-primary"
              disabled={
                isSubmitting ||
                !roomName.trim() ||
                (roomType === 'private' && selectedPeerIds.size === 0)
              }
            >
              <Plus style={{ width: 16, height: 16 }} />
              <span>
                {isSubmitting
                  ? 'Creating...'
                  : roomType === 'private'
                    ? 'Create Private Room'
                    : 'Create Anonymous Room'}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
