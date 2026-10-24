import test from 'node:test';
import assert from 'node:assert/strict';
import { ConnectionManager } from '../connection-manager';

test('Direct Messaging & Acknowledgements between P2P Nodes', async () => {
  const profileA = {
    id: 'sender-node-1111',
    name: 'Alice',
    deviceModel: 'MacBook Air',
  };

  const profileB = {
    id: 'recipient-node-2222',
    name: 'Bob',
    deviceModel: 'MacBook Pro',
  };

  const managerA = new ConnectionManager(profileA);
  const managerB = new ConnectionManager(profileB);

  try {
    // 1. Start both nodes
    await managerA.start();
    await managerB.start();

    // 2. Wait for mutual discovery and connection
    await Promise.all([
      new Promise<void>((resolve, reject) => {
        if (managerA.isPeerConnected(profileB.id)) return resolve();
        const timer = setTimeout(() => reject(new Error('Node A connect timeout')), 6000);
        managerA.on('peer-connected', (id) => {
          if (id === profileB.id) {
            clearTimeout(timer);
            resolve();
          }
        });
      }),
      new Promise<void>((resolve, reject) => {
        if (managerB.isPeerConnected(profileA.id)) return resolve();
        const timer = setTimeout(() => reject(new Error('Node B connect timeout')), 6000);
        managerB.on('peer-connected', (id) => {
          if (id === profileA.id) {
            clearTimeout(timer);
            resolve();
          }
        });
      }),
    ]);

    // 3. Mark conversation as accepted on both sides to test normal direct messaging
    managerA.getChatStore().resolveInvitation = () => null; // or seed directly
    (managerA.getChatStore() as any).data.conversations[profileB.id] = {
      peerId: profileB.id,
      peerName: profileB.name,
      status: 'accepted',
      lastTimestamp: Date.now(),
      unreadCount: 0,
      messages: [],
    };
    (managerB.getChatStore() as any).data.conversations[profileA.id] = {
      peerId: profileA.id,
      peerName: profileA.name,
      status: 'accepted',
      lastTimestamp: Date.now(),
      unreadCount: 0,
      messages: [],
    };

    // 4. Test: Real Message Transmission & Reception
    const messagePromiseOnB = new Promise<any>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Node B did not receive message')), 5000);
      managerB.once('message-received', (msg) => {
        clearTimeout(timer);
        resolve(msg);
      });
    });

    const ackPromiseOnA = new Promise<any>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Node A did not receive ack')), 5000);
      managerA.once('message-ack', (ack) => {
        clearTimeout(timer);
        resolve(ack);
      });
    });

    const sendResult = await managerA.sendMessage(profileB.id, 'Hello from Alice on LAN!');
    assert.equal(sendResult.success, true);
    assert.ok(sendResult.messageId);

    const receivedOnB = await messagePromiseOnB;
    assert.equal(receivedOnB.id, sendResult.messageId);
    assert.equal(receivedOnB.senderId, profileA.id);
    assert.equal(receivedOnB.recipientId, profileB.id);
    assert.equal(receivedOnB.text, 'Hello from Alice on LAN!');

    const receivedAckOnA = await ackPromiseOnA;
    assert.equal(receivedAckOnA.messageId, sendResult.messageId);
    assert.equal(receivedAckOnA.senderId, profileB.id);
    assert.equal(receivedAckOnA.recipientId, profileA.id);

    // 4. Test: Message Deduplication
    let duplicateReceivedCount = 0;
    managerB.on('message-received', () => {
      duplicateReceivedCount++;
    });

    // Directly re-inject duplicate message envelope over active socket
    const activeConnA = (managerA as any).activeConnections.get(profileB.id);
    assert.ok(activeConnA, 'Active connection exists on manager A');

    activeConnA.sendEnvelope({
      type: 'message',
      id: sendResult.messageId, // Same ID as before
      senderId: profileA.id,
      recipientId: profileB.id,
      text: 'Duplicate message attempt',
      timestamp: Date.now(),
    });

    // Wait a brief moment to ensure duplicate is dropped
    await new Promise((r) => setTimeout(r, 200));
    assert.equal(duplicateReceivedCount, 0, 'Duplicate message ID must be dropped by deduplication filter');

    // 5. Test: Recipient Validation
    activeConnA.sendEnvelope({
      type: 'message',
      id: 'foreign-id-999',
      senderId: profileA.id,
      recipientId: 'someone-else-3333', // Not Bob!
      text: 'This is not meant for Bob',
      timestamp: Date.now(),
    });

    await new Promise((r) => setTimeout(r, 200));
    assert.equal(duplicateReceivedCount, 0, 'Message with mismatched recipientId must be discarded');

    // 6. Test: Disconnected / Invalid Peer Send Handling
    const invalidSend = await managerA.sendMessage('non-existent-peer', 'Test failure');
    assert.equal(invalidSend.success, false);
    assert.ok(invalidSend.error);

    // 7. Test: Empty message validation
    const emptySend = await managerA.sendMessage(profileB.id, '   ');
    assert.equal(emptySend.success, false);
    assert.equal(emptySend.error, 'Message text cannot be empty');
  } finally {
    await managerA.stop();
    await managerB.stop();
  }
});
