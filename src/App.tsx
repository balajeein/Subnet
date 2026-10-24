import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { ShieldAlert, WifiOff, Search, X } from 'lucide-react';
import type {
  LocalProfile,
  NetworkStatus,
  Peer,
  Invitation,
  ConversationSummary,
  RoomSummary,
  DiscoveredRoom,
  UserSettings,
} from './types/subnet';
import Sidebar, { ActiveView } from './components/Sidebar';
import ChatPane from './components/ChatPane';
import RequestsView from './components/RequestsView';
import ToastNotification, { ToastItem } from './components/ToastNotification';
import CreateRoomView from './components/CreateRoomView';
import FindRoomView from './components/FindRoomView';
import RoomChatPane from './components/RoomChatPane';
import SettingsView from './components/SettingsView';
import UserAvatar from './components/UserAvatar';
import { soundPlayer } from './utils/sound';

export default function App(): React.JSX.Element {
  const [profile, setProfile] = useState<LocalProfile | null>(null);
  const [networkStatus, setNetworkStatus] = useState<NetworkStatus | null>(null);
  const [peers, setPeers] = useState<Peer[]>([]);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [discoveredRooms, setDiscoveredRooms] = useState<DiscoveredRoom[]>([]);

  // Sidebar collapse state with localStorage persistence
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('subnet_sidebar_collapsed') === 'true';
    } catch {
      return false;
    }
  });

  // Active view state
  const [activeView, setActiveView] = useState<ActiveView>(() => {
    try {
      const saved = localStorage.getItem('subnet_last_view');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.type === 'requests') return { type: 'requests' };
        if (parsed.type === 'create-room') return { type: 'create-room' };
        if (parsed.type === 'find-room') return { type: 'find-room' };
        if (parsed.type === 'room' && parsed.roomId) return { type: 'room', roomId: parsed.roomId };
        if (parsed.type === 'settings') return { type: 'settings' };
      }
    } catch {}
    return { type: 'radar' };
  });

  const [settings, setSettings] = useState<UserSettings>({
    avatarType: 'default',
    avatarValue: '',
    defaultAnonymousNickname: '',
    theme: 'system',
    notificationsEnabled: true,
    soundEnabled: true,
  });

  // Toast notifications in top-right
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  // Guard against rapid duplicate clicks
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());

  // Search query for New Chat / Radar view
  const [radarSearchQuery, setRadarSearchQuery] = useState<string>('');

  // Filter peers case-insensitively for New Chat / Radar
  const filteredPeers = useMemo<Peer[]>(() => {
    const query = radarSearchQuery.trim().toLowerCase();
    if (!query) return peers;
    return peers.filter((p) => p.name.toLowerCase().includes(query));
  }, [peers, radarSearchQuery]);

  // Derive pending incoming direct chat requests
  const pendingRequests = useMemo<Invitation[]>(() => {
    const list: Invitation[] = [];
    for (const conv of conversations) {
      if (conv.status === 'pending_incoming' && conv.pendingInvitation) {
        list.push(conv.pendingInvitation);
      }
    }
    return list;
  }, [conversations]);

  // Save sidebar collapse preference
  const handleToggleSidebar = () => {
    setIsSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('subnet_sidebar_collapsed', String(next));
      } catch {}
      return next;
    });
  };

  // Keyboard shortcut (⌘B / Ctrl+B) to toggle sidebar
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        handleToggleSidebar();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Save last view state
  const changeActiveView = useCallback((newView: ActiveView) => {
    setActiveView(newView);
    try {
      if (newView.type === 'radar') {
        localStorage.setItem('subnet_last_view', JSON.stringify({ type: 'radar' }));
      } else if (newView.type === 'requests') {
        localStorage.setItem('subnet_last_view', JSON.stringify({ type: 'requests' }));
      } else if (newView.type === 'create-room') {
        localStorage.setItem('subnet_last_view', JSON.stringify({ type: 'create-room' }));
      } else if (newView.type === 'find-room') {
        localStorage.setItem('subnet_last_view', JSON.stringify({ type: 'find-room' }));
      } else if (newView.type === 'room') {
        localStorage.setItem('subnet_last_view', JSON.stringify({ type: 'room', roomId: newView.roomId }));
      } else if (newView.type === 'settings') {
        localStorage.setItem('subnet_last_view', JSON.stringify({ type: 'settings' }));
      } else if (newView.type === 'chat') {
        localStorage.setItem(
          'subnet_last_view',
          JSON.stringify({ type: 'chat', peerId: newView.peerId, peerName: newView.peer.name })
        );
      }
    } catch {}
  }, []);

  // Theme application effect
  useEffect(() => {
    const applyTheme = (theme: 'system' | 'dark' | 'light') => {
      if (theme === 'system') {
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
      } else {
        document.documentElement.setAttribute('data-theme', theme);
      }
    };

    applyTheme(settings.theme || 'system');

    if ((settings.theme || 'system') === 'system') {
      const media = window.matchMedia('(prefers-color-scheme: dark)');
      const listener = (e: MediaQueryListEvent) => {
        document.documentElement.setAttribute('data-theme', e.matches ? 'dark' : 'light');
      };
      media.addEventListener('change', listener);
      return () => media.removeEventListener('change', listener);
    }
  }, [settings.theme]);

  const handleUpdateSettings = useCallback(
    async (partial: Partial<UserSettings>): Promise<UserSettings> => {
      if (window.subnet?.updateSettings) {
        const updated = await window.subnet.updateSettings(partial);
        setSettings(updated);
        return updated;
      }
      const fallback: UserSettings = { ...settings, ...partial };
      setSettings(fallback);
      return fallback;
    },
    [settings]
  );

  const showInfoToast = useCallback((message: string) => {
    const id = `info-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setToasts((prev) => [...prev, { id, type: 'info', message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  // Initial data loading & IPC event subscriptions
  useEffect(() => {
    if (window.subnet?.getProfile) {
      window.subnet.getProfile().then(setProfile).catch(console.error);
    }
    if (window.subnet?.getNetworkStatus) {
      window.subnet.getNetworkStatus().then(setNetworkStatus).catch(console.error);
    }
    if (window.subnet?.getPeers) {
      window.subnet.getPeers().then((initialPeers) => {
        if (Array.isArray(initialPeers)) setPeers(initialPeers);
      }).catch(console.error);
    }
    if (window.subnet?.getConversations) {
      window.subnet.getConversations().then((initialConvs) => {
        if (Array.isArray(initialConvs)) {
          setConversations(initialConvs);

          // Restore saved chat view if valid
          try {
            const saved = localStorage.getItem('subnet_last_view');
            if (saved) {
              const parsed = JSON.parse(saved);
              if (parsed.type === 'chat' && parsed.peerId) {
                const foundConv = initialConvs.find((c) => c.peerId === parsed.peerId);
                if (foundConv) {
                  setActiveView({
                    type: 'chat',
                    peerId: foundConv.peerId,
                    peer: { id: foundConv.peerId, name: foundConv.peerName },
                  });
                }
              }
            }
          } catch {}
        }
      }).catch(console.error);
    }

    if (window.subnet?.getRooms) {
      window.subnet.getRooms().then((initialRooms) => {
        if (Array.isArray(initialRooms)) {
          setRooms(initialRooms);
        }
      }).catch(console.error);
    }

    if (window.subnet?.getDiscoveredAnonymousRooms) {
      window.subnet.getDiscoveredAnonymousRooms().then((initialAnon) => {
        if (Array.isArray(initialAnon)) {
          setDiscoveredRooms(initialAnon);
        }
      }).catch(console.error);
    }

    if (window.subnet?.getSettings) {
      window.subnet.getSettings().then((s) => {
        if (s) setSettings(s);
      }).catch(console.error);
    }

    const cleanups: Array<() => void> = [];

    if (window.subnet?.onSettingsUpdated) {
      const unsub = window.subnet.onSettingsUpdated((updated) => {
        setSettings(updated);
      });
      cleanups.push(unsub);
    }

    if (window.subnet?.onPeerDiscovered) {
      const unsub = window.subnet.onPeerDiscovered((discovered: Peer) => {
        setPeers((prev) => {
          const index = prev.findIndex((p) => p.id === discovered.id);
          if (index >= 0) {
            const updated = [...prev];
            updated[index] = { ...updated[index], ...discovered };
            return updated;
          }
          return [...prev, discovered];
        });

        setActiveView((current) => {
          if (current.type === 'chat' && current.peerId === discovered.id) {
            return {
              type: 'chat',
              peerId: discovered.id,
              peer: { ...current.peer, ...discovered },
            };
          }
          return current;
        });
      });
      cleanups.push(unsub);
    }

    if (window.subnet?.onPeerUpdated) {
      const unsub = window.subnet.onPeerUpdated((updatedPeer: Peer) => {
        setPeers((prev) => {
          const index = prev.findIndex((p) => p.id === updatedPeer.id);
          if (index >= 0) {
            const list = [...prev];
            list[index] = { ...list[index], ...updatedPeer };
            return list;
          }
          return [...prev, updatedPeer];
        });

        setActiveView((current) => {
          if (current.type === 'chat' && current.peerId === updatedPeer.id) {
            return {
              type: 'chat',
              peerId: updatedPeer.id,
              peer: { ...current.peer, ...updatedPeer },
            };
          }
          return current;
        });
      });
      cleanups.push(unsub);
    }

    if (window.subnet?.onPeerLost) {
      const unsub = window.subnet.onPeerLost((lostPeerId: string) => {
        setPeers((prev) => prev.filter((p) => p.id !== lostPeerId));
      });
      cleanups.push(unsub);
    }

    if (window.subnet?.onStatusChanged) {
      const unsub = window.subnet.onStatusChanged((status: NetworkStatus) => {
        setNetworkStatus(status);
      });
      cleanups.push(unsub);
    }

    if (window.subnet?.onConversationsUpdated) {
      const unsub = window.subnet.onConversationsUpdated((updatedList: ConversationSummary[]) => {
        setConversations(updatedList);
      });
      cleanups.push(unsub);
    }

    if (window.subnet?.onRoomsUpdated) {
      const unsub = window.subnet.onRoomsUpdated((updatedRooms: RoomSummary[]) => {
        setRooms(updatedRooms);
      });
      cleanups.push(unsub);
    }

    if (window.subnet?.onDiscoveredRoomsUpdated) {
      const unsub = window.subnet.onDiscoveredRoomsUpdated((updatedAnon: DiscoveredRoom[]) => {
        setDiscoveredRooms(updatedAnon);
      });
      cleanups.push(unsub);
    }

    if (window.subnet?.onRoomInvitationReceived) {
      const unsub = window.subnet.onRoomInvitationReceived((inv) => {
        showInfoToast(`Incoming Private Room Invitation from ${inv.hostName} for "${inv.roomName}"`);
      });
      cleanups.push(unsub);
    }

    if (window.subnet?.onConversationEnded) {
      const unsub = window.subnet.onConversationEnded((data) => {
        showInfoToast('Conversation was ended by peer');
        setActiveView((current) => {
          if (current.type === 'chat' && current.peerId === data.peerId) {
            try {
              localStorage.removeItem('subnet_last_view');
            } catch {}
            return { type: 'radar' };
          }
          return current;
        });
      });
      cleanups.push(unsub);
    }

    if (window.subnet?.onRoomClosed) {
      const unsub = window.subnet.onRoomClosed((data) => {
        showInfoToast(data.reason || 'Room was closed by host');
        setActiveView((current) => {
          if (current.type === 'room' && current.roomId === data.roomId) {
            try {
              localStorage.removeItem('subnet_last_view');
            } catch {}
            return { type: 'radar' };
          }
          return current;
        });
      });
      cleanups.push(unsub);
    }

    // Top-right non-blocking toast for incoming direct chat requests
    if (window.subnet?.onInvitationReceived) {
      const unsub = window.subnet.onInvitationReceived((invitation: Invitation) => {
        if (settings.soundEnabled) {
          soundPlayer.playNotificationChime();
        }
        if (settings.notificationsEnabled) {
          setToasts((prev) => {
            if (prev.some((t) => t.invitation?.id === invitation.id)) {
              return prev;
            }
            return [
              ...prev,
              {
                id: invitation.id,
                type: 'invitation',
                invitation,
              },
            ];
          });
        }
      });
      cleanups.push(unsub);
    }

    return () => {
      cleanups.forEach((cleanup) => cleanup());
    };
  }, [showInfoToast]);

  // Accept direct chat request
  const handleAcceptInvitation = async (invitation: Invitation) => {
    if (processingIds.has(invitation.id)) return;
    setProcessingIds((prev) => new Set(prev).add(invitation.id));

    try {
      if (window.subnet?.respondToInvitation) {
        await window.subnet.respondToInvitation(invitation.id, true);
      }
      setToasts((prev) => prev.filter((t) => t.id !== invitation.id));
      showInfoToast(`Accepted request from ${invitation.senderName}. Available in Chats.`);
    } catch (err: any) {
      console.error('Failed to accept invitation:', err);
    } finally {
      setProcessingIds((prev) => {
        const next = new Set(prev);
        next.delete(invitation.id);
        return next;
      });
    }
  };

  // Decline direct chat request
  const handleDeclineInvitation = async (invitation: Invitation) => {
    if (processingIds.has(invitation.id)) return;
    setProcessingIds((prev) => new Set(prev).add(invitation.id));

    try {
      if (window.subnet?.respondToInvitation) {
        await window.subnet.respondToInvitation(invitation.id, false);
      }
      setToasts((prev) => prev.filter((t) => t.id !== invitation.id));
      showInfoToast(`Declined chat request from ${invitation.senderName}`);
    } catch (err: any) {
      console.error('Failed to decline invitation:', err);
    } finally {
      setProcessingIds((prev) => {
        const next = new Set(prev);
        next.delete(invitation.id);
        return next;
      });
    }
  };

  // Delete Conversation locally
  const handleDeleteConversation = async (peerId: string) => {
    try {
      if (window.subnet?.deleteConversation) {
        const res = await window.subnet.deleteConversation(peerId);
        if (res.success) {
          showInfoToast('Conversation and messages deleted from this device');
          if (activeView.type === 'chat' && activeView.peerId === peerId) {
            changeActiveView({ type: 'radar' });
            try {
              localStorage.removeItem('subnet_last_view');
            } catch {}
          }
        }
      }
    } catch (err) {
      console.error('Failed to delete conversation:', err);
    }
  };

  // End Conversation for both participants
  const handleEndConversation = async (peerId: string) => {
    try {
      if (window.subnet?.endConversation) {
        const res = await window.subnet.endConversation(peerId);
        if (res.success && res.remoteConfirmed) {
          showInfoToast('Conversation ended and history deleted on both devices');
          if (activeView.type === 'chat' && activeView.peerId === peerId) {
            changeActiveView({ type: 'radar' });
            try {
              localStorage.removeItem('subnet_last_view');
            } catch {}
          }
        } else {
          showInfoToast(
            res.error || 'Could not end conversation: peer is unreachable on LAN'
          );
        }
      }
    } catch (err: any) {
      showInfoToast(err.message || 'Failed to end conversation');
    }
  };

  // Accept Room Invitation
  const handleAcceptRoomInvitation = async (roomId: string) => {
    try {
      if (window.subnet?.respondToRoomInvitation) {
        await window.subnet.respondToRoomInvitation(roomId, true);
        showInfoToast('Joined room. Available in Sidebar Rooms.');
      }
    } catch (err) {
      console.error('Failed to accept room invitation:', err);
    }
  };

  // Decline Room Invitation
  const handleDeclineRoomInvitation = async (roomId: string) => {
    try {
      if (window.subnet?.respondToRoomInvitation) {
        await window.subnet.respondToRoomInvitation(roomId, false);
        showInfoToast('Declined room invitation');
      }
    } catch (err) {
      console.error('Failed to decline room invitation:', err);
    }
  };

  // Leave / Delete / Close Room
  const handleDeleteRoom = async (roomId: string) => {
    try {
      const targetRoom = rooms.find((r) => r.id === roomId);
      const isHost = targetRoom?.isHost;
      if (window.subnet?.leaveRoom) {
        const res = await window.subnet.leaveRoom(roomId);
        if (res.success) {
          showInfoToast(isHost ? 'Room closed and deleted for everyone' : 'Left room');
          if (activeView.type === 'room' && activeView.roomId === roomId) {
            changeActiveView({ type: 'radar' });
            try {
              localStorage.removeItem('subnet_last_view');
            } catch {}
          }
        }
      }
    } catch (err) {
      console.error('Failed to leave/close room:', err);
    }
  };

  const handleDismissToast = (toastId: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== toastId));
  };

  const activeChatPeer = activeView.type === 'chat' ? activeView.peer : null;
  const activeConversation = activeChatPeer
    ? conversations.find((c) => c.peerId === activeChatPeer.id) || null
    : null;

  const activeRoom =
    activeView.type === 'room'
      ? rooms.find((r) => r.id === activeView.roomId) || null
      : null;

  return (
    <div className="subnet-app-layout">
      {/* Non-blocking top-right notification toasts */}
      <ToastNotification
        toasts={toasts}
        processingIds={processingIds}
        onAccept={handleAcceptInvitation}
        onDecline={handleDeclineInvitation}
        onDismiss={handleDismissToast}
        onOpenRequests={() => changeActiveView({ type: 'requests' })}
      />

      {/* ChatGPT-style Left Sidebar */}
      <Sidebar
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={handleToggleSidebar}
        activeView={activeView}
        onSelectRadar={() => changeActiveView({ type: 'radar' })}
        onSelectCreateRoom={() => changeActiveView({ type: 'create-room' })}
        onSelectFindRoom={() => changeActiveView({ type: 'find-room' })}
        onSelectRequests={() => changeActiveView({ type: 'requests' })}
        onSelectSettings={() => changeActiveView({ type: 'settings' })}
        userSettings={settings}
        onSelectConversation={(peer) =>
          changeActiveView({ type: 'chat', peerId: peer.id, peer })
        }
        onSelectRoom={(roomId) =>
          changeActiveView({ type: 'room', roomId })
        }
        onDeleteConversation={handleDeleteConversation}
        onEndConversation={handleEndConversation}
        onDeleteRoom={handleDeleteRoom}
        conversations={conversations}
        rooms={rooms}
        discoveredPeers={peers}
        pendingRequestsCount={pendingRequests.length}
        localProfile={profile}
      />

      {/* Main Content Area */}
      <div className="subnet-main-content">
        {/* Top Header with macOS Draggable Bar and Network Status */}
        <header className="main-topbar">
          <div className="topbar-left">
            <span className="topbar-transport-badge">
              <ShieldAlert style={{ width: 13, height: 13, color: '#94a3b8' }} />
              <span>Direct LAN Transport (Unencrypted WebSocket)</span>
            </span>
          </div>

          <div className="topbar-right">
            <span className={`status-dot ${networkStatus?.isRunning ? 'active' : ''}`} />
            <span className="network-status-text">
              {networkStatus?.isRunning
                ? `LAN Active • ${networkStatus.localIp || 'Local'}:${networkStatus.port}`
                : 'Initializing LAN Engine...'}
            </span>
          </div>
        </header>

        {/* Dynamic Main Body */}
        <div className="main-body-container">
          {activeView.type === 'chat' && activeChatPeer ? (
            <ChatPane
              activePeer={activeChatPeer}
              localProfile={profile}
              isPeerOnline={peers.some((p) => p.id === activeChatPeer.id)}
              conversation={activeConversation}
              onClose={() => changeActiveView({ type: 'radar' })}
              onAcceptInvitation={() => {
                if (activeConversation?.pendingInvitation) {
                  handleAcceptInvitation(activeConversation.pendingInvitation);
                }
              }}
              onDeclineInvitation={() => {
                if (activeConversation?.pendingInvitation) {
                  handleDeclineInvitation(activeConversation.pendingInvitation);
                }
              }}
            />
          ) : activeView.type === 'room' && activeRoom ? (
            <RoomChatPane
              room={activeRoom}
              localProfile={profile}
              onClose={() => changeActiveView({ type: 'radar' })}
              onLeaveRoom={handleDeleteRoom}
            />
          ) : activeView.type === 'create-room' ? (
            <CreateRoomView
              discoveredPeers={peers}
              defaultAnonymousNickname={settings.defaultAnonymousNickname}
              localProfile={profile}
              onCancel={() => changeActiveView({ type: 'radar' })}
              onRoomCreated={(roomId) => changeActiveView({ type: 'room', roomId })}
            />
          ) : activeView.type === 'find-room' ? (
            <FindRoomView
              rooms={rooms}
              discoveredAnonymousRooms={discoveredRooms}
              defaultAnonymousNickname={settings.defaultAnonymousNickname}
              onAcceptRoomInvitation={handleAcceptRoomInvitation}
              onDeclineRoomInvitation={handleDeclineRoomInvitation}
              onOpenRoom={(roomId) => changeActiveView({ type: 'room', roomId })}
              onJoinAnonymousRoom={async (roomId, nickname) => {
                return window.subnet.joinAnonymousRoom(roomId, nickname);
              }}
              onOpenCreateRoom={() => changeActiveView({ type: 'create-room' })}
              onCancel={() => changeActiveView({ type: 'radar' })}
            />
          ) : activeView.type === 'requests' ? (
            <RequestsView
              requests={pendingRequests}
              processingIds={processingIds}
              onAccept={handleAcceptInvitation}
              onDecline={handleDeclineInvitation}
              onOpenRadar={() => changeActiveView({ type: 'radar' })}
            />
          ) : activeView.type === 'settings' ? (
            <SettingsView
              localProfile={profile}
              settings={settings}
              onUpdateSettings={handleUpdateSettings}
              onClose={() => changeActiveView({ type: 'radar' })}
              onShowToast={showInfoToast}
            />
          ) : (
            /* Welcome / Searchable New Chat & Radar View */
            <div className="radar-view-container">
              {/* Search Bar at the top of New Chat / Radar */}
              <div className="radar-search-container">
                <div className="radar-search-input-wrap">
                  <Search className="radar-search-icon" style={{ width: 15, height: 15 }} />
                  <input
                    type="text"
                    className="radar-search-input"
                    placeholder="Search nearby peers by name..."
                    value={radarSearchQuery}
                    onChange={(e) => setRadarSearchQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') {
                        setRadarSearchQuery('');
                      }
                    }}
                    aria-label="Search nearby peers"
                  />
                  {radarSearchQuery && (
                    <button
                      type="button"
                      className="radar-search-clear-btn"
                      onClick={() => setRadarSearchQuery('')}
                      title="Clear search (Esc)"
                      aria-label="Clear search"
                    >
                      <X style={{ width: 14, height: 14 }} />
                    </button>
                  )}
                </div>
              </div>

              {peers.length === 0 ? (
                <div className="empty-state-card">
                  <WifiOff style={{ width: 22, height: 22, color: '#94a3b8' }} />
                  <h2 className="empty-state-title">No nearby peers found</h2>
                  <p className="empty-state-desc">
                    Open Subnet on another Mac or PC on the same Wi-Fi or Ethernet network.
                    Discovery happens automatically over Bonjour/mDNS without internet access.
                  </p>
                  <div className="empty-state-features">
                    <span className="feature-pill">Local LAN Only</span>
                    <span className="feature-pill">Zero Cloud</span>
                    <span className="feature-pill">Direct P2P</span>
                  </div>
                </div>
              ) : radarSearchQuery.trim() ? (
                /* Filtered Search Results View */
                filteredPeers.length === 0 ? (
                  <div className="empty-state-card">
                    <Search style={{ width: 22, height: 22, color: '#94a3b8' }} />
                    <h2 className="empty-state-title">No peers match "{radarSearchQuery}"</h2>
                    <p className="empty-state-desc">
                      No nearby peers match your search. Clear the search field to view all nearby devices.
                    </p>
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => setRadarSearchQuery('')}
                      style={{ marginTop: 14 }}
                    >
                      Clear Search
                    </button>
                  </div>
                ) : (
                  <div className="radar-search-results-list">
                    <div className="radar-search-header-meta">
                      <span>Matching peers ({filteredPeers.length})</span>
                    </div>
                    <div className="radar-search-cards-grid">
                      {filteredPeers.map((peer) => {
                        const peerConv = conversations.find((c) => c.peerId === peer.id);
                        const hasUnread = (peerConv?.unreadCount || 0) > 0;
                        const hasPendingInv = peerConv?.status === 'pending_incoming';

                        return (
                          <div
                            key={peer.id}
                            className="radar-search-peer-card"
                            onClick={() =>
                              changeActiveView({ type: 'chat', peerId: peer.id, peer })
                            }
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                changeActiveView({ type: 'chat', peerId: peer.id, peer });
                              }
                            }}
                          >
                            <div className="radar-search-card-left">
                              <UserAvatar
                                avatarType={peer.avatar?.avatarType}
                                avatarValue={peer.avatar?.avatarValue}
                                size={40}
                                fallbackIconColor="#38bdf8"
                              />
                              <div className="radar-search-card-info">
                                <div className="radar-search-name-row">
                                  <span className="radar-search-peer-name">{peer.name}</span>
                                  {hasUnread && (
                                    <span className="radar-unread-badge">
                                      {peerConv!.unreadCount}
                                    </span>
                                  )}
                                </div>
                                <span className="radar-search-peer-status">
                                  <span className="status-dot active" />
                                  {hasPendingInv
                                    ? 'Incoming Chat Request'
                                    : `Online • ${peer.host || 'LAN'}:${peer.port || ''}`}
                                </span>
                              </div>
                            </div>
                            <div className="radar-search-card-right">
                              <button
                                type="button"
                                className="btn-chat-action"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  changeActiveView({ type: 'chat', peerId: peer.id, peer });
                                }}
                              >
                                {hasPendingInv ? 'View Request' : 'Chat'}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )
              ) : (
                /* Circular Radar View when not actively querying */
                <div className="radar-stage">
                  <div className="radar-ring ring-1" />
                  <div className="radar-ring ring-2" />
                  <div className="radar-ring ring-3" />
                  <div className="radar-pulse" />

                  <div className="local-device-node">
                    <div className="device-avatar-container">
                      <UserAvatar
                        avatarType={settings.avatarType}
                        avatarValue={settings.avatarValue}
                        size={48}
                        fallbackIconColor="#38bdf8"
                      />
                    </div>
                    <div className="device-meta">
                      <span className="device-name">
                        {profile?.name || 'Local Mac'}
                      </span>
                      <span className="device-tag">Your Device</span>
                    </div>
                  </div>

                  {peers.map((peer, index) => {
                    const total = peers.length;
                    const angle = (index / total) * (2 * Math.PI) - Math.PI / 2;
                    const radius = 150;
                    const tx = Math.round(Math.cos(angle) * radius);
                    const ty = Math.round(Math.sin(angle) * radius);

                    const peerConv = conversations.find((c) => c.peerId === peer.id);
                    const hasUnread = (peerConv?.unreadCount || 0) > 0;
                    const hasPendingInv = peerConv?.status === 'pending_incoming';

                    return (
                      <button
                        key={peer.id}
                        type="button"
                        className={`discovered-peer-node ${hasPendingInv ? 'has-invitation' : ''}`}
                        onClick={() =>
                          changeActiveView({ type: 'chat', peerId: peer.id, peer })
                        }
                        title={`Click to chat with ${peer.name}`}
                        style={
                          {
                            '--tx': `${tx}px`,
                            '--ty': `${ty}px`,
                            transform: `translate(${tx}px, ${ty}px)`,
                          } as React.CSSProperties
                        }
                      >
                        <div className="peer-avatar-container">
                          <UserAvatar
                            avatarType={peer.avatar?.avatarType}
                            avatarValue={peer.avatar?.avatarValue}
                            size={36}
                            fallbackIconColor="#38bdf8"
                          />
                          {hasUnread && (
                            <span className="radar-unread-badge">
                              {peerConv!.unreadCount}
                            </span>
                          )}
                          {hasPendingInv && (
                            <span className="radar-invitation-dot" title="Incoming request" />
                          )}
                        </div>
                        <div className="peer-meta">
                          <span className="peer-name">{peer.name}</span>
                          <span className="peer-tag">
                            {hasPendingInv ? 'Requesting chat' : 'Nearby'}
                          </span>
                          <span className="peer-chat-hint">Click to chat</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer info strip */}
        <footer className="main-footer-bar">
          <div className="footer-left">
            <span>
              {peers.length} {peers.length === 1 ? 'peer' : 'peers'} nearby on LAN
            </span>
            {pendingRequests.length > 0 && (
              <span className="footer-requests-indicator" onClick={() => changeActiveView({ type: 'requests' })}>
                • {pendingRequests.length} pending {pendingRequests.length === 1 ? 'request' : 'requests'}
              </span>
            )}
            {rooms.length > 0 && (
              <span className="footer-requests-indicator" onClick={() => changeActiveView({ type: 'find-room' })}>
                • {rooms.length} {rooms.length === 1 ? 'room' : 'rooms'} joined
              </span>
            )}
          </div>
          <div className="footer-right">
            {profile?.id && (
              <span>ID: {profile.id.slice(0, 8)}</span>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
}
