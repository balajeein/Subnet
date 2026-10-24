import test from 'node:test';
import assert from 'node:assert/strict';
import { ConnectionManager } from '../connection-manager';

test('ConnectionManager - Symmetrical P2P Discovery and Mutual Connection', async () => {
  const profileA = {
    id: 'node-alpha-1111',
    name: 'Alpha Node',
    deviceModel: 'MacBook Pro Alpha',
  };

  const profileB = {
    id: 'node-bravo-2222',
    name: 'Bravo Node',
    deviceModel: 'MacBook Pro Bravo',
  };

  const managerA = new ConnectionManager(profileA);
  const managerB = new ConnectionManager(profileB);

  try {
    // 1. Start Node A first
    const statusA = await managerA.start();
    assert.equal(statusA.isRunning, true);
    assert.ok(statusA.port && statusA.port > 0);

    // Stagger start of Node B to emulate real-world sequential launching
    await new Promise((r) => setTimeout(r, 600));

    // 2. Start Node B
    const statusB = await managerB.start();
    assert.equal(statusB.isRunning, true);
    assert.ok(statusB.port && statusB.port > 0);
    assert.notEqual(statusA.port, statusB.port, 'Instances must bind to distinct ports');

    // 3. Symmetrical Discovery verification:
    // Node A must discover Node B AND Node B must discover Node A
    const [discoveredBOnA, discoveredAOnB] = await Promise.all([
      new Promise<any>((resolve, reject) => {
        const existing = managerA.getDiscoveredPeers().find((p) => p.id === profileB.id);
        if (existing) return resolve(existing);

        const timer = setTimeout(() => reject(new Error('Node A failed to discover Node B')), 6000);
        managerA.on('peer-discovered', (peer) => {
          if (peer.id === profileB.id) {
            clearTimeout(timer);
            resolve(peer);
          }
        });
      }),
      new Promise<any>((resolve, reject) => {
        const existing = managerB.getDiscoveredPeers().find((p) => p.id === profileA.id);
        if (existing) return resolve(existing);

        const timer = setTimeout(() => reject(new Error('Node B failed to discover Node A')), 6000);
        managerB.on('peer-discovered', (peer) => {
          if (peer.id === profileA.id) {
            clearTimeout(timer);
            resolve(peer);
          }
        });
      }),
    ]);

    assert.equal(discoveredBOnA.id, profileB.id);
    assert.equal(discoveredAOnB.id, profileA.id);

    // 4. Verify symmetrical peer-list states
    const peersOnA = managerA.getDiscoveredPeers();
    const peersOnB = managerB.getDiscoveredPeers();
    assert.ok(peersOnA.some((p) => p.id === profileB.id), 'Manager A list must contain Node B');
    assert.ok(peersOnB.some((p) => p.id === profileA.id), 'Manager B list must contain Node A');

    // 5. Verify WebSocket connection and tie-breaker resolution
    await Promise.all([
      new Promise<void>((resolve, reject) => {
        if (managerA.isPeerConnected(profileB.id)) {
          return resolve();
        }
        const timer = setTimeout(() => reject(new Error('Manager A connection timeout')), 6000);
        managerA.on('peer-connected', (peerId) => {
          if (peerId === profileB.id) {
            clearTimeout(timer);
            resolve();
          }
        });
      }),
      new Promise<void>((resolve, reject) => {
        if (managerB.isPeerConnected(profileA.id)) {
          return resolve();
        }
        const timer = setTimeout(() => reject(new Error('Manager B connection timeout')), 6000);
        managerB.on('peer-connected', (peerId) => {
          if (peerId === profileA.id) {
            clearTimeout(timer);
            resolve();
          }
        });
      }),
    ]);

    assert.ok(managerA.isPeerConnected(profileB.id), 'Manager A must be connected to Node B');
    assert.ok(managerB.isPeerConnected(profileA.id), 'Manager B must be connected to Node A');
  } finally {
    // 6. Clean shutdown
    await managerA.stop();
    await managerB.stop();
  }
});
