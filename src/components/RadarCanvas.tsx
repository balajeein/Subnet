import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Hand, ChevronLeft, ChevronRight } from 'lucide-react';
import type { Peer, LocalProfile, UserSettings, ConversationSummary } from '../types/subnet';
import UserAvatar from './UserAvatar';
import {
  getRadarNodePositions,
  getRingRadius,
  getUniqueRemotePeers,
  type RadarNodePosition,
} from '../utils/radarLayout';

interface RadarCanvasProps {
  peers: Peer[];
  localProfile: LocalProfile | null;
  settings: UserSettings;
  conversations: ConversationSummary[];
  searchQuery?: string;
  onSelectPeer: (peer: Peer) => void;
}

export default function RadarCanvas({
  peers,
  localProfile,
  settings,
  conversations,
  searchQuery = '',
  onSelectPeer,
}: RadarCanvasProps): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);

  // Canvas viewport pan state (pannable, not zoomable)
  const [panX, setPanX] = useState<number>(0);
  const [panY, setPanY] = useState<number>(0);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [containerSize, setContainerSize] = useState<{ width: number; height: number }>({
    width: 800,
    height: 600,
  });

  // Track drag distance to differentiate between a click and a pan drag
  const dragStartRef = useRef<{
    pointerX: number;
    pointerY: number;
    initialPanX: number;
    initialPanY: number;
    hasMoved: boolean;
  }>({
    pointerX: 0,
    pointerY: 0,
    initialPanX: 0,
    initialPanY: 0,
    hasMoved: false,
  });

  // Deduplicate peers excluding local user
  const uniqueRemotePeers = useMemo(() => {
    return getUniqueRemotePeers(peers, localProfile?.id);
  }, [peers, localProfile?.id]);

  // Compute deterministic node positions
  const nodePositions = useMemo(() => {
    return getRadarNodePositions(uniqueRemotePeers, localProfile?.id);
  }, [uniqueRemotePeers, localProfile?.id]);

  const positionMap = useMemo(() => {
    const map = new Map<string, RadarNodePosition>();
    for (const pos of nodePositions) {
      map.set(pos.peer.id, pos);
    }
    return map;
  }, [nodePositions]);

  // Determine highest ring index in use
  const maxRing = useMemo(() => {
    let max = 1;
    for (const pos of nodePositions) {
      if (pos.ring > max) max = pos.ring;
    }
    return Math.max(2, max);
  }, [nodePositions]);

  // Bounded canvas extent based on discovered peer rings
  const outerRadius = useMemo(() => {
    return getRingRadius(maxRing);
  }, [maxRing]);

  // Dynamic pan bounds: keep canvas compact with few peers, expand as peer count grows
  const maxPanX = useMemo(() => {
    const extent = outerRadius + 80;
    const halfW = containerSize.width / 2;
    return Math.max(40, Math.round(Math.max(0, extent - halfW + 100)));
  }, [outerRadius, containerSize.width]);

  const maxPanY = useMemo(() => {
    const extent = outerRadius + 80;
    const halfH = containerSize.height / 2;
    return Math.max(40, Math.round(Math.max(0, extent - halfH + 80)));
  }, [outerRadius, containerSize.height]);

  const clampPanX = useCallback(
    (x: number) => {
      return Math.max(-maxPanX, Math.min(maxPanX, x));
    },
    [maxPanX]
  );

  const clampPanY = useCallback(
    (y: number) => {
      return Math.max(-maxPanY, Math.min(maxPanY, y));
    },
    [maxPanY]
  );

  // Stabilize user position within bounds when peers join/leave or window resizes
  useEffect(() => {
    setPanX((prev) => Math.max(-maxPanX, Math.min(maxPanX, prev)));
    setPanY((prev) => Math.max(-maxPanY, Math.min(maxPanY, prev)));
  }, [maxPanX, maxPanY]);

  // Observe container size
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const updateSize = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setContainerSize({ width: rect.width, height: rect.height });
      }
    };

    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Pointer drag panning handlers
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;

    const target = e.target as HTMLElement;
    if (target.closest('button')) {
      return;
    }

    setIsDragging(true);
    dragStartRef.current = {
      pointerX: e.clientX,
      pointerY: e.clientY,
      initialPanX: panX,
      initialPanY: panY,
      hasMoved: false,
    };

    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {}
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;

    const dx = e.clientX - dragStartRef.current.pointerX;
    const dy = e.clientY - dragStartRef.current.pointerY;

    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) {
      dragStartRef.current.hasMoved = true;
    }

    setPanX(clampPanX(dragStartRef.current.initialPanX + dx));
    setPanY(clampPanY(dragStartRef.current.initialPanY + dy));
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    setIsDragging(false);
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {}
  };

  // Wheel / trackpad pan handler (no zoom)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      setPanX((prev) => clampPanX(prev - e.deltaX));
      setPanY((prev) => clampPanY(prev - e.deltaY));
    };

    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [clampPanX, clampPanY]);

  // Keyboard navigation on canvas focus
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const panStep = 50;
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      setPanX((prev) => clampPanX(prev + panStep));
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      setPanX((prev) => clampPanX(prev - panStep));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setPanY((prev) => clampPanY(prev + panStep));
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setPanY((prev) => clampPanY(prev - panStep));
    }
  };

  // Safe peer click (suppressed if user was drag-panning)
  const handlePeerClick = (peer: Peer, e: React.MouseEvent) => {
    e.stopPropagation();
    if (dragStartRef.current.hasMoved) {
      return;
    }
    onSelectPeer(peer);
  };

  const cleanQuery = searchQuery.trim().toLowerCase();

  return (
    <div
      ref={containerRef}
      className={`radar-canvas-container ${isDragging ? 'is-dragging' : ''}`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      role="region"
      aria-label="Nearby user radar canvas. Drag to navigate nearby users."
    >
      {/* Side Pan Nudge Indicators when canvas extends beyond viewport */}
      {panX < maxPanX - 10 && outerRadius > containerSize.width / 2 - 40 && (
        <button
          type="button"
          className="radar-side-arrow radar-side-left"
          onClick={() => setPanX((prev) => clampPanX(prev + 180))}
          title="Pan left"
          aria-label="Pan left"
        >
          <ChevronLeft style={{ width: 18, height: 18 }} />
        </button>
      )}

      {panX > -maxPanX + 10 && outerRadius > containerSize.width / 2 - 40 && (
        <button
          type="button"
          className="radar-side-arrow radar-side-right"
          onClick={() => setPanX((prev) => clampPanX(prev - 180))}
          title="Pan right"
          aria-label="Pan right"
        >
          <ChevronRight style={{ width: 18, height: 18 }} />
        </button>
      )}

      {/* Pannable Canvas Layer */}
      <div
        className="radar-canvas-world"
        style={{
          transform: `translate(${panX}px, ${panY}px)`,
        }}
      >
        {/* Graduated radar field */}
        <div className="radar-grid-rings">
          {Array.from({ length: maxRing }, (_, i) => i + 1).map((ringIdx) => {
            const radius = getRingRadius(ringIdx);
            return (
              <div
                key={`ring-${ringIdx}`}
                className={`radar-orbit-ring ring-${ringIdx}`}
                style={{
                  width: `${radius * 2}px`,
                  height: `${radius * 2}px`,
                  '--ring-delay': `${(ringIdx - 1) * 0.65}s`,
                } as React.CSSProperties}
              />
            );
          })}
          <div className="radar-canvas-pulse" />
        </div>

        {/* Center Local User Device Node */}
        <div className="radar-local-node" title="Your device (Center)">
          <div className="radar-local-avatar-wrap">
            <UserAvatar
              avatarType={settings.avatarType}
              avatarValue={settings.avatarValue}
              size={52}
              name={localProfile?.name || 'This device'}
              alt={localProfile?.name || 'This device'}
              fallbackIconColor="#B58AE8"
            />
            <span className="radar-local-glow" />
          </div>
          <div className="radar-local-meta">
            <span className="radar-local-name">{localProfile?.name || 'This device'}</span>
            <span className="radar-local-tag">Your Device</span>
          </div>
        </div>

        {/* Discovered Remote Peer Nodes */}
        {uniqueRemotePeers.map((peer) => {
          const pos = positionMap.get(peer.id);
          if (!pos) return null;

          const peerConv = conversations.find((c) => c.peerId === peer.id);
          const unreadCount = peerConv?.unreadCount || 0;
          const hasPendingInv = peerConv?.status === 'pending_incoming';
          const isMatch = !cleanQuery || peer.name.toLowerCase().includes(cleanQuery);

          return (
            <button
              key={peer.id}
              type="button"
              className={`radar-peer-node ${hasPendingInv ? 'has-invitation' : ''} ${
                !isMatch ? 'dimmed-by-search' : ''
              }`}
              onClick={(e) => handlePeerClick(peer, e)}
              title={`Click to chat with ${peer.name}`}
              style={{
                transform: `translate(${pos.x}px, ${pos.y}px)`,
              }}
              tabIndex={0}
              aria-label={`Chat with ${peer.name}`}
            >
              <div className="radar-peer-avatar-wrap">
                <UserAvatar
                  avatarType={peer.avatar?.avatarType}
                  avatarValue={peer.avatar?.avatarValue}
                  size={46}
                  name={peer.name}
                  alt={peer.name}
                  fallbackIconColor="#B58AE8"
                />

                {/* Unread Message Badge */}
                {unreadCount > 0 && (
                  <span className="radar-node-unread-badge">{unreadCount}</span>
                )}

                {/* Pending Request Indicator */}
                {hasPendingInv && (
                  <span
                    className="radar-node-request-badge"
                    title="Incoming chat request"
                  />
                )}
              </div>

              {/* Peer Meta Box */}
              <div className="radar-peer-meta">
                <span className="radar-peer-name">{peer.name}</span>
                {hasPendingInv && (
                  <span className="radar-peer-status-tag">
                    <span className="status-dot active" />
                    <span>Requesting</span>
                  </span>
                )}
                <span className="radar-peer-action-hint">Click to chat</span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Subtle Drag Hint at Bottom */}
      <div className="radar-drag-hint" aria-hidden="true">
        <Hand style={{ width: 13, height: 13 }} />
        <span>Drag to explore nearby users</span>
      </div>
    </div>
  );
}
