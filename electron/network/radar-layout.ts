import type { Peer } from '../../src/types/subnet';

export interface RadarNodePosition {
  peer: Peer;
  x: number;
  y: number;
  ring: number;
  angle: number;
}

export interface CanvasBoundingBox {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  width: number;
  height: number;
}

export interface CanvasTransform {
  panX: number;
  panY: number;
  zoom: number;
}

/**
 * Filter out local user and deduplicate peers by unique peer.id.
 */
export function getUniqueRemotePeers(
  peers: Peer[],
  localPeerId?: string | null
): Peer[] {
  if (!Array.isArray(peers)) return [];

  const seenIds = new Set<string>();
  const uniqueList: Peer[] = [];

  for (const peer of peers) {
    if (!peer) continue;
    const id = (peer.id || '').trim();
    if (!id) continue;

    // Exclude the local user from the remote-peer list and count
    if (localPeerId && id === localPeerId.trim()) {
      continue;
    }

    if (!seenIds.has(id)) {
      seenIds.add(id);
      uniqueList.push(peer);
    }
  }

  return uniqueList;
}

/**
 * Number of nodes that fit comfortably in orbit ring k (1-indexed).
 * Ring 1: 6 nodes
 * Ring 2: 12 nodes
 * Ring 3: 18 nodes
 * Ring 4: 24 nodes
 * Ring 5: 30 nodes
 * Ring 6: 36 nodes
 * Total for 6 rings = 126 nodes (well beyond 100).
 */
export function getRingCapacity(ring: number): number {
  if (ring <= 0) return 1;
  return ring * 6;
}

/**
 * Ring radius in pixels.
 * Ring 1: 170px (clears center local node diameter of 64px + badge + labels)
 * Ring 2: 300px
 * Ring 3: 430px
 * Ring 4: 560px
 * Ring 5: 690px
 * Ring 6: 820px
 * Spacing between consecutive rings is 130px, ensuring no radial overlap.
 */
export function getRingRadius(ring: number): number {
  if (ring <= 0) return 0;
  return 170 + (ring - 1) * 130;
}

/**
 * Deterministic layout calculation for discovered peers.
 * - Nodes never randomly jump when re-rendered for the same peer set.
 * - Evenly distributes peers across concentric orbit rings.
 * - Alternating rings are angularly offset by half a step to prevent radial alignment crowding.
 */
export function getRadarNodePositions(
  peers: Peer[],
  localPeerId?: string | null
): RadarNodePosition[] {
  const remotePeers = getUniqueRemotePeers(peers, localPeerId);
  if (remotePeers.length === 0) return [];

  // Deterministic sorting by peer.id so node placement is completely stable
  const sortedPeers = [...remotePeers].sort((a, b) => a.id.localeCompare(b.id));

  // Determine how many rings are needed and allocate counts per ring
  const ringAllocations: Peer[][] = [];
  let remainingPeers = [...sortedPeers];
  let ringIndex = 1;

  while (remainingPeers.length > 0) {
    const capacity = getRingCapacity(ringIndex);
    const peersForThisRing = remainingPeers.slice(0, capacity);
    ringAllocations.push(peersForThisRing);
    remainingPeers = remainingPeers.slice(capacity);
    ringIndex++;
  }

  const positions: RadarNodePosition[] = [];

  ringAllocations.forEach((ringPeers, ringIdx) => {
    const ringNum = ringIdx + 1;
    const countOnRing = ringPeers.length;
    const radius = getRingRadius(ringNum);
    const ringCapacity = getRingCapacity(ringNum);

    // Stagger odd and even rings to maximize distance between adjacent layers
    const baseOffset = ringNum % 2 === 0 ? Math.PI / ringCapacity : 0;

    ringPeers.forEach((peer, i) => {
      // Distribute evenly around full circle
      const angle = (i / countOnRing) * (2 * Math.PI) - Math.PI / 2 + baseOffset;
      const x = Math.round(Math.cos(angle) * radius);
      const y = Math.round(Math.sin(angle) * radius);

      positions.push({
        peer,
        x,
        y,
        ring: ringNum,
        angle,
      });
    });
  });

  return positions;
}

/**
 * Computes bounding box enclosing all nodes (including center local node and padding).
 */
export function getCanvasBoundingBox(
  positions: RadarNodePosition[],
  nodePadding: number = 70
): CanvasBoundingBox {
  if (positions.length === 0) {
    return {
      minX: -nodePadding,
      maxX: nodePadding,
      minY: -nodePadding,
      maxY: nodePadding,
      width: nodePadding * 2,
      height: nodePadding * 2,
    };
  }

  let minX = -nodePadding;
  let maxX = nodePadding;
  let minY = -nodePadding;
  let maxY = nodePadding;

  for (const pos of positions) {
    if (pos.x - nodePadding < minX) minX = pos.x - nodePadding;
    if (pos.x + nodePadding > maxX) maxX = pos.x + nodePadding;
    if (pos.y - nodePadding < minY) minY = pos.y - nodePadding;
    if (pos.y + nodePadding > maxY) maxY = pos.y + nodePadding;
  }

  return {
    minX,
    maxX,
    minY,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

/**
 * Calculate Fit All pan and zoom to show all peers comfortably within container viewport.
 */
export function calculateFitAllTransform(
  positions: RadarNodePosition[],
  containerWidth: number,
  containerHeight: number,
  margin: number = 60
): CanvasTransform {
  if (containerWidth <= 0 || containerHeight <= 0) {
    return { panX: 0, panY: 0, zoom: 1 };
  }

  if (positions.length === 0) {
    return { panX: 0, panY: 0, zoom: 1 };
  }

  const bbox = getCanvasBoundingBox(positions, 65);
  const availableWidth = Math.max(containerWidth - margin * 2, 120);
  const availableHeight = Math.max(containerHeight - margin * 2, 120);

  const zoomX = availableWidth / bbox.width;
  const zoomY = availableHeight / bbox.height;
  const calculatedZoom = Math.min(zoomX, zoomY, 1.25);
  const zoom = Math.max(0.35, Math.min(1.25, Number(calculatedZoom.toFixed(2))));

  // Center on bounding box center
  const bboxCenterX = (bbox.minX + bbox.maxX) / 2;
  const bboxCenterY = (bbox.minY + bbox.maxY) / 2;

  const panX = Math.round(-bboxCenterX * zoom);
  const panY = Math.round(-bboxCenterY * zoom);

  return { panX, panY, zoom };
}
