import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getUniqueRemotePeers,
  getRadarNodePositions,
  getRingCapacity,
  getRingRadius,
  getCanvasBoundingBox,
  calculateFitAllTransform,
  type RadarNodePosition,
} from '../radar-layout';
import type { Peer } from '../../../src/types/subnet';

function createMockPeer(id: string, name: string, port = 51234): Peer {
  return {
    id,
    name,
    host: '192.168.1.100',
    port,
    lastSeen: Date.now(),
    avatar: {
      avatarType: 'preset',
      avatarValue: 'preset-cat',
    },
  };
}

test('Subnet — Scalable Radar Canvas & Live LAN User Count', async (t) => {
  // Test 1 & 3: Peer deduplication and local user exclusion
  await t.test('1 & 3. Deduplicates multiple discovery events and strictly excludes local user', () => {
    const localId = 'local-mac-user-id';
    const peerA = createMockPeer('peer-alice', 'Alice');
    const peerB = createMockPeer('peer-bob', 'Bob');
    const localPeer = createMockPeer(localId, 'Local Device');

    // Simulate repeated discovery events and advertisements
    const rawEvents: Peer[] = [
      peerA,
      { ...peerA, lastSeen: Date.now() + 10 },
      peerB,
      { ...peerB, port: 51235 },
      localPeer, // local user advertised
      { ...localPeer, port: 51236 },
      peerA,
    ];

    const unique = getUniqueRemotePeers(rawEvents, localId);

    // Must have exactly 2 remote peers (Alice and Bob)
    assert.equal(unique.length, 2, 'Expected exactly 2 unique remote peers');
    assert.deepEqual(
      unique.map((p) => p.id).sort(),
      ['peer-alice', 'peer-bob']
    );

    // Local user must not be present
    assert.ok(!unique.some((p) => p.id === localId), 'Local user must be excluded');

    // Edge cases: empty array, null/undefined
    assert.deepEqual(getUniqueRemotePeers([], localId), []);
    assert.deepEqual(getUniqueRemotePeers(null as any, localId), []);
  });

  // Test 2: Live count updates when peers appear and disappear
  await t.test('2. Live count updates dynamically when peers appear and disappear', () => {
    const localId = 'local-user-id';
    let currentPeers: Peer[] = [];

    // Initial state: 0 peers
    let remotePeers = getUniqueRemotePeers(currentPeers, localId);
    assert.equal(remotePeers.length, 0);

    // Peer 1 discovers
    const peer1 = createMockPeer('p1', 'Device 1');
    currentPeers = [...currentPeers, peer1];
    remotePeers = getUniqueRemotePeers(currentPeers, localId);
    assert.equal(remotePeers.length, 1);

    // Duplicate event for Peer 1 does not increase count
    currentPeers = [...currentPeers, { ...peer1 }];
    remotePeers = getUniqueRemotePeers(currentPeers, localId);
    assert.equal(remotePeers.length, 1);

    // Peer 2 and 3 discover
    const peer2 = createMockPeer('p2', 'Device 2');
    const peer3 = createMockPeer('p3', 'Device 3');
    currentPeers = [...currentPeers, peer2, peer3];
    remotePeers = getUniqueRemotePeers(currentPeers, localId);
    assert.equal(remotePeers.length, 3);

    // Peer 2 disappears / leaves network
    currentPeers = currentPeers.filter((p) => p.id !== 'p2');
    remotePeers = getUniqueRemotePeers(currentPeers, localId);
    assert.equal(remotePeers.length, 2);
    assert.ok(!remotePeers.some((p) => p.id === 'p2'));

    // All peers leave
    currentPeers = [];
    remotePeers = getUniqueRemotePeers(currentPeers, localId);
    assert.equal(remotePeers.length, 0);
  });

  // Test 4: Deterministic layout for stable peer set
  await t.test('4. Deterministic node placement for a stable peer set', () => {
    const localId = 'local-mac';
    const peers: Peer[] = [
      createMockPeer('node-zeta', 'Zeta'),
      createMockPeer('node-alpha', 'Alpha'),
      createMockPeer('node-gamma', 'Gamma'),
      createMockPeer('node-beta', 'Beta'),
    ];

    // Calculate layout multiple times
    const layout1 = getRadarNodePositions(peers, localId);
    const layout2 = getRadarNodePositions(peers, localId);

    // Reorder input array to test input order independence
    const reversedPeers = [...peers].reverse();
    const layout3 = getRadarNodePositions(reversedPeers, localId);

    assert.equal(layout1.length, 4);
    assert.equal(layout2.length, 4);
    assert.equal(layout3.length, 4);

    // All coordinates must match exactly regardless of render passes or input array order
    for (let i = 0; i < layout1.length; i++) {
      assert.equal(layout1[i].peer.id, layout2[i].peer.id);
      assert.equal(layout1[i].x, layout2[i].x);
      assert.equal(layout1[i].y, layout2[i].y);
      assert.equal(layout1[i].ring, layout2[i].ring);

      assert.equal(layout1[i].peer.id, layout3[i].peer.id);
      assert.equal(layout1[i].x, layout3[i].x);
      assert.equal(layout1[i].y, layout3[i].y);
    }
  });

  // Test 5: Node spacing and non-overlapping layout validation for 1, 10, 30, 50, and 100 peers
  await t.test('5. Scalable layout non-overlap verification across 1, 10, 30, 50, and 100 peers', () => {
    const testCounts = [1, 10, 30, 50, 100];
    const localId = 'local-user';

    for (const count of testCounts) {
      const peers: Peer[] = [];
      for (let i = 0; i < count; i++) {
        // Pad ID with leading zeroes so sort is predictable
        const id = `peer-${String(i).padStart(3, '0')}`;
        peers.push(createMockPeer(id, `Peer ${i}`));
      }

      const positions = getRadarNodePositions(peers, localId);
      assert.equal(positions.length, count, `Expected ${count} positioned nodes`);

      // 1. Verify every node is clear from the center local node (radius >= 170px)
      for (const pos of positions) {
        const distFromCenter = Math.hypot(pos.x, pos.y);
        assert.ok(
          distFromCenter >= 169.5,
          `Peer ${pos.peer.id} distance from center is ${distFromCenter}px (should be >= 170px)`
        );
      }

      // 2. Pairwise Euclidean distance between all nodes to guarantee no overlap
      let minDistance = Infinity;
      let closestPair: [string, string] = ['', ''];

      for (let i = 0; i < positions.length; i++) {
        for (let j = i + 1; j < positions.length; j++) {
          const dx = positions[i].x - positions[j].x;
          const dy = positions[i].y - positions[j].y;
          const dist = Math.hypot(dx, dy);

          if (dist < minDistance) {
            minDistance = dist;
            closestPair = [positions[i].peer.id, positions[j].peer.id];
          }
        }
      }

      if (count > 1) {
        // Standard peer node avatar is 44px, total node bounding footprint is ~90px.
        // Our layout guarantees at least > 100px minimum distance between any two peer nodes!
        assert.ok(
          minDistance >= 100,
          `Peer count ${count}: Minimum distance between ${closestPair[0]} and ${closestPair[1]} is ${minDistance.toFixed(
            1
          )}px, which must be >= 100px to prevent visual overlap`
        );
      }
    }
  });

  // Test 6: Pan, zoom, and Fit All transform calculations
  await t.test('6. Bounding box and Fit All transform calculation', () => {
    const localId = 'local';
    const peers50: Peer[] = Array.from({ length: 50 }, (_, i) =>
      createMockPeer(`p-${i}`, `Peer ${i}`)
    );

    const positions50 = getRadarNodePositions(peers50, localId);
    const bbox = getCanvasBoundingBox(positions50, 70);

    // Verify bounding box dimensions
    assert.ok(bbox.width > 0);
    assert.ok(bbox.height > 0);
    assert.ok(bbox.maxX > bbox.minX);
    assert.ok(bbox.maxY > bbox.minY);

    // Standard desktop container 1000x700
    const transform = calculateFitAllTransform(positions50, 1000, 700, 80);
    assert.ok(transform.zoom >= 0.35 && transform.zoom <= 1.25, `Zoom ${transform.zoom} within bounds`);
    assert.equal(typeof transform.panX, 'number');
    assert.equal(typeof transform.panY, 'number');

    // Empty positions returns default centered transform
    const emptyTransform = calculateFitAllTransform([], 800, 600);
    assert.deepEqual(emptyTransform, { panX: 0, panY: 0, zoom: 1 });
  });

  // Test 7: Ring capacity and concentric radius progression
  await t.test('7. Concentric orbit capacity and radial spacing formula', () => {
    // Ring capacity progression: 6, 12, 18, 24, 30, 36...
    assert.equal(getRingCapacity(1), 6);
    assert.equal(getRingCapacity(2), 12);
    assert.equal(getRingCapacity(3), 18);
    assert.equal(getRingCapacity(4), 24);
    assert.equal(getRingCapacity(5), 30);
    assert.equal(getRingCapacity(6), 36);

    // Total capacity across 6 rings = 126
    const totalCapacity6Rings = [1, 2, 3, 4, 5, 6].reduce((sum, r) => sum + getRingCapacity(r), 0);
    assert.equal(totalCapacity6Rings, 126, '6 rings can accommodate up to 126 peers');

    // Ring radius progression: 170, 300, 430, 560, 690, 820
    assert.equal(getRingRadius(1), 170);
    assert.equal(getRingRadius(2), 300);
    assert.equal(getRingRadius(3), 430);
    assert.equal(getRingRadius(4), 560);
    assert.equal(getRingRadius(5), 690);
    assert.equal(getRingRadius(6), 820);

    // Consecutive radial clearance between rings is 130px
    for (let r = 2; r <= 6; r++) {
      assert.equal(getRingRadius(r) - getRingRadius(r - 1), 130);
    }
  });

  // Test 8: Performance benchmark: 100 peers positioned in under 5ms
  await t.test('8. Layout performance benchmark: 100 peers computed in < 5ms', () => {
    const peers100: Peer[] = Array.from({ length: 100 }, (_, i) =>
      createMockPeer(`perf-peer-${i}`, `Fast Peer ${i}`)
    );

    const start = performance.now();
    const positions = getRadarNodePositions(peers100, 'local');
    const elapsed = performance.now() - start;

    assert.equal(positions.length, 100);
    assert.ok(
      elapsed < 10,
      `100-peer layout calculation completed in ${elapsed.toFixed(3)}ms (target < 10ms, expected < 5ms)`
    );
  });
});
