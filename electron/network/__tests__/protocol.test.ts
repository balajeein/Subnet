import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateHandshake,
  validateHandshakeAck,
  parseAndValidateEnvelope,
  isPeerIdTieWinner,
  MAX_MESSAGE_SIZE,
  PROTOCOL_VERSION,
} from '../protocol';
import { BonjourDiscovery } from '../bonjour-discovery';
import type { Service } from 'bonjour-service';

test('Protocol - validateHandshake', async (t) => {
  await t.test('accepts valid handshake payload', () => {
    const raw = {
      type: 'handshake',
      peerId: 'peer-abc-123',
      name: "Alice's MacBook Pro",
      version: PROTOCOL_VERSION,
      timestamp: Date.now(),
    };
    const result = validateHandshake(raw);
    assert.ok(result);
    assert.equal(result.peerId, 'peer-abc-123');
    assert.equal(result.name, "Alice's MacBook Pro");
    assert.equal(result.version, PROTOCOL_VERSION);
  });

  await t.test('rejects missing or empty peerId', () => {
    assert.equal(
      validateHandshake({
        type: 'handshake',
        peerId: '   ',
        name: 'Alice',
        version: PROTOCOL_VERSION,
        timestamp: Date.now(),
      }),
      null
    );
  });

  await t.test('rejects missing or empty name', () => {
    assert.equal(
      validateHandshake({
        type: 'handshake',
        peerId: 'peer-1',
        name: '',
        version: PROTOCOL_VERSION,
        timestamp: Date.now(),
      }),
      null
    );
  });

  await t.test('rejects wrong message type', () => {
    assert.equal(
      validateHandshake({
        type: 'message',
        peerId: 'peer-1',
        name: 'Alice',
        version: PROTOCOL_VERSION,
        timestamp: Date.now(),
      }),
      null
    );
  });

  await t.test('rejects null or non-object', () => {
    assert.equal(validateHandshake(null), null);
    assert.equal(validateHandshake('not an object'), null);
  });
});

test('Protocol - validateHandshakeAck', async (t) => {
  await t.test('accepts valid handshake_ack payload', () => {
    const raw = {
      type: 'handshake_ack',
      peerId: 'peer-xyz-789',
      name: "Bob's Mac",
      version: PROTOCOL_VERSION,
      timestamp: Date.now(),
    };
    const result = validateHandshakeAck(raw);
    assert.ok(result);
    assert.equal(result.peerId, 'peer-xyz-789');
    assert.equal(result.name, "Bob's Mac");
  });

  await t.test('rejects invalid handshake_ack', () => {
    assert.equal(validateHandshakeAck({ type: 'handshake_ack' }), null);
  });
});

test('Protocol - parseAndValidateEnvelope', async (t) => {
  await t.test('parses valid JSON buffer', () => {
    const raw = Buffer.from(
      JSON.stringify({
        type: 'ping',
        timestamp: 12345678,
      })
    );
    const env = parseAndValidateEnvelope(raw);
    assert.ok(env);
    assert.equal(env.type, 'ping');
  });

  await t.test('rejects payloads exceeding MAX_MESSAGE_SIZE', () => {
    const hugePayload = 'A'.repeat(MAX_MESSAGE_SIZE + 10);
    assert.equal(parseAndValidateEnvelope(hugePayload), null);
  });

  await t.test('rejects malformed JSON syntax', () => {
    assert.equal(parseAndValidateEnvelope('{ invalid json : true'), null);
  });

  await t.test('rejects unrecognized message types', () => {
    const unknownType = JSON.stringify({ type: 'unknown_command' });
    assert.equal(parseAndValidateEnvelope(unknownType), null);
  });

  await t.test('validates message envelope fields', () => {
    const validMsg = JSON.stringify({
      type: 'message',
      id: 'msg-1',
      senderId: 'peer-1',
      recipientId: 'peer-2',
      text: 'Hello LAN peer!',
      timestamp: Date.now(),
    });
    const parsed = parseAndValidateEnvelope(validMsg);
    assert.ok(parsed);
    assert.equal(parsed.type, 'message');
    if (parsed.type === 'message') {
      assert.equal(parsed.text, 'Hello LAN peer!');
    }
  });

  await t.test('rejects message with missing recipient or empty text', () => {
    assert.equal(
      parseAndValidateEnvelope(
        JSON.stringify({
          type: 'message',
          id: 'msg-1',
          senderId: 'peer-1',
          recipientId: '',
          text: 'hello',
          timestamp: Date.now(),
        })
      ),
      null
    );

    assert.equal(
      parseAndValidateEnvelope(
        JSON.stringify({
          type: 'message',
          id: 'msg-1',
          senderId: 'peer-1',
          recipientId: 'peer-2',
          text: '   ',
          timestamp: Date.now(),
        })
      ),
      null
    );
  });

  await t.test('validates message ack envelope', () => {
    const validAck = JSON.stringify({
      type: 'ack',
      messageId: 'msg-1',
      senderId: 'peer-2',
      recipientId: 'peer-1',
      timestamp: Date.now(),
    });
    const parsed = parseAndValidateEnvelope(validAck);
    assert.ok(parsed);
    assert.equal(parsed.type, 'ack');
    if (parsed.type === 'ack') {
      assert.equal(parsed.messageId, 'msg-1');
      assert.equal(parsed.senderId, 'peer-2');
    }
  });
});

test('Duplicate Connection Handling - Deterministic Tie Breaker', async (t) => {
  await t.test('correctly orders two peer IDs', () => {
    const peerA = '0000-alice';
    const peerB = '9999-bob';

    // Alice compares with Bob: Alice is smaller, so Alice wins
    assert.equal(isPeerIdTieWinner(peerA, peerB), true);

    // Bob compares with Alice: Bob is larger, so Bob loses
    assert.equal(isPeerIdTieWinner(peerB, peerA), false);
  });

  await t.test('guarantees strict symmetry between any two distinct peers', () => {
    const peers = [
      'f47ac10b-58cc-4372-a567-0e02b2c3d479',
      'c9a646d3-9c61-4cd9-bc15-47f87c5217a6',
      'a1b2c3d4-0000-1111-2222-333344445555',
      'z9y8x7w6-9999-8888-7777-666655554444',
    ];

    for (let i = 0; i < peers.length; i++) {
      for (let j = i + 1; j < peers.length; j++) {
        const idA = peers[i];
        const idB = peers[j];

        const aWinsAgainstB = isPeerIdTieWinner(idA, idB);
        const bWinsAgainstA = isPeerIdTieWinner(idB, idA);

        // Exactly one node must be the winner
        assert.notEqual(
          aWinsAgainstB,
          bWinsAgainstA,
          `Tie breaking between ${idA} and ${idB} must be strictly asymmetric`
        );
      }
    }
  });
});

test('Bonjour Peer Extraction', async (t) => {
  const discovery = new BonjourDiscovery({
    localPeerId: 'my-local-peer-id',
    displayName: 'My Local Mac',
    port: 50000,
  });

  await t.test('extracts valid peer from Bonjour service record', () => {
    const mockService = {
      name: 'Subnet-peer123',
      port: 51234,
      addresses: ['127.0.0.1', '192.168.1.85'],
      txt: {
        id: 'remote-peer-uuid',
        name: "Carol's Mac",
        v: '1.0.0',
      },
    } as unknown as Service;

    const peer = discovery.extractPeerFromService(mockService);
    assert.ok(peer);
    assert.equal(peer.id, 'remote-peer-uuid');
    assert.equal(peer.name, "Carol's Mac");
    assert.equal(peer.port, 51234);
    assert.equal(peer.host, '192.168.1.85'); // Prefers routable LAN IP over loopback
  });

  await t.test('rejects service without txt.id', () => {
    const mockService = {
      name: 'Other-Service',
      port: 8080,
      txt: {},
    } as unknown as Service;

    const peer = discovery.extractPeerFromService(mockService);
    assert.equal(peer, null);
  });
});
