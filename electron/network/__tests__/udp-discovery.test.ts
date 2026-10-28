import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateBroadcastAddress,
  createDiscoveryAnnouncement,
  parseDiscoveryAnnouncement,
} from '../udp-discovery';

test('UDP discovery calculates the subnet broadcast address', () => {
  assert.equal(
    calculateBroadcastAddress('10.7.13.223', '255.255.224.0'),
    '10.7.31.255'
  );
  assert.equal(
    calculateBroadcastAddress('192.168.1.42', '255.255.255.0'),
    '192.168.1.255'
  );
  assert.equal(calculateBroadcastAddress('not-an-ip', '255.255.255.0'), null);
});

test('UDP discovery creates and parses a peer announcement', () => {
  const announcement = createDiscoveryAnnouncement(
    'peer-a',
    "Alice's Mac",
    54321,
    123
  );
  const peer = parseDiscoveryAnnouncement(
    JSON.stringify(announcement),
    '10.7.13.223',
    'peer-b'
  );

  assert.ok(peer);
  assert.equal(peer.id, 'peer-a');
  assert.equal(peer.name, "Alice's Mac");
  assert.equal(peer.host, '10.7.13.223');
  assert.equal(peer.port, 54321);
  assert.equal(typeof peer.lastSeen, 'number');
  assert.equal(
    parseDiscoveryAnnouncement(JSON.stringify(announcement), '10.7.13.223', 'peer-a'),
    null
  );
});

test('UDP discovery rejects malformed or unsafe announcements', () => {
  assert.equal(parseDiscoveryAnnouncement('{bad json}', '10.7.13.223'), null);
  assert.equal(
    parseDiscoveryAnnouncement(
      JSON.stringify({ type: 'subnet_discovery', peerId: 'x', name: 'Peer', port: 0 }),
      '10.7.13.223'
    ),
    null
  );
  assert.equal(
    parseDiscoveryAnnouncement(
      JSON.stringify({
        type: 'other-protocol',
        version: '1.0.0',
        peerId: 'x',
        name: 'Peer',
        port: 1234,
        timestamp: Date.now(),
      }),
      '10.7.13.223'
    ),
    null
  );
});
