import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { ConnectionManager } from '../connection-manager';
import { ChatStore } from '../../store/chat-store';
import type { Invitation, Message } from '../../../src/types/subnet';

function createTempStoragePath(): string {
  const dir = path.join(os.tmpdir(), `subnet-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, 'subnet-history.json');
}

test('Phase 3 Tests - Chat Invitations & Local History Persistence', async (t) => {
  // Test 7: Incoming and outgoing message persistence across app restarts
  await t.test('7. Incoming and outgoing message persistence across app restarts', () => {
    const tempPath = createTempStoragePath();
    const store1 = new ChatStore(tempPath);

    const peerId = 'peer-test-1111';
    const peerName = 'Alice Mac';

    const outgoingMsg: Message = {
      id: 'msg-out-1',
      senderId: 'local-node',
      recipientId: peerId,
      text: 'Hello from local',
      timestamp: 1000,
      status: 'delivered',
    };

    const incomingMsg: Message = {
      id: 'msg-in-1',
      senderId: peerId,
      recipientId: 'local-node',
      text: 'Hello back from Alice',
      timestamp: 2000,
      status: 'delivered',
    };

    store1.addMessage(peerId, outgoingMsg, false, peerName);
    store1.addMessage(peerId, incomingMsg, true, peerName);

    // Simulate app restart by creating a new ChatStore instance pointing to the same file
    const store2 = new ChatStore(tempPath);
    const messages = store2.getMessages(peerId);

    assert.equal(messages.length, 2, 'Must persist all 2 messages');
    assert.equal(messages[0].id, 'msg-out-1');
    assert.equal(messages[0].text, 'Hello from local');
    assert.equal(messages[0].status, 'delivered');

    assert.equal(messages[1].id, 'msg-in-1');
    assert.equal(messages[1].text, 'Hello back from Alice');

    const conv = store2.getConversation(peerId);
    assert.ok(conv);
    assert.equal(conv.peerName, peerName);
    assert.equal(conv.unreadCount, 1);

    // Cleanup
    try {
      fs.rmSync(path.dirname(tempPath), { recursive: true, force: true });
    } catch {}
  });

  // Test 8: Conversation history retrieval and unread counts
  await t.test('8. Conversation history retrieval and unread counts', () => {
    const tempPath = createTempStoragePath();
    const store = new ChatStore(tempPath);

    const peer1 = 'peer-1';
    const peer2 = 'peer-2';

    store.addMessage(peer1, {
      id: 'm1',
      senderId: peer1,
      recipientId: 'me',
      text: 'Msg 1',
      timestamp: 1000,
      status: 'delivered',
    }, true, 'Peer One');

    store.addMessage(peer1, {
      id: 'm2',
      senderId: peer1,
      recipientId: 'me',
      text: 'Msg 2',
      timestamp: 2000,
      status: 'delivered',
    }, true, 'Peer One');

    store.addMessage(peer2, {
      id: 'm3',
      senderId: peer2,
      recipientId: 'me',
      text: 'Msg 3 from peer 2',
      timestamp: 3000,
      status: 'delivered',
    }, true, 'Peer Two');

    const convs = store.getConversations();
    assert.equal(convs.length, 2);

    // Sorted by latest timestamp descending (peer 2 at 3000 is first)
    assert.equal(convs[0].peerId, peer2);
    assert.equal(convs[0].unreadCount, 1);

    assert.equal(convs[1].peerId, peer1);
    assert.equal(convs[1].unreadCount, 2);

    // Mark conversation 1 as read
    store.markConversationRead(peer1);
    const updatedConvs = store.getConversations();
    const conv1 = updatedConvs.find((c) => c.peerId === peer1);
    assert.equal(conv1?.unreadCount, 0, 'Unread count must be cleared after marking read');

    // Cleanup
    try {
      fs.rmSync(path.dirname(tempPath), { recursive: true, force: true });
    } catch {}
  });

  // Test 9: Corrupted local history handling
  await t.test('9. Corrupted local history handling', () => {
    const tempPath = createTempStoragePath();

    // Write completely invalid/corrupted JSON
    fs.writeFileSync(tempPath, '{"version": 1, "conversations": { CORRUPT TRUNCATED...', 'utf-8');

    // ChatStore should not throw on loading corrupted file
    let store!: ChatStore;
    assert.doesNotThrow(() => {
      store = new ChatStore(tempPath);
    });

    assert.ok(store);
    assert.deepEqual(store.getConversations(), []);

    // A backup file should have been created
    const dir = path.dirname(tempPath);
    const files = fs.readdirSync(dir);
    const hasBackup = files.some((f) => f.includes('.corrupted.'));
    assert.ok(hasBackup, 'Must create a backup of the corrupted history file');

    // Normal operations should work fine after recovering
    store.addMessage('peer-x', {
      id: 'm-x',
      senderId: 'peer-x',
      recipientId: 'me',
      text: 'Recovered message',
      timestamp: Date.now(),
      status: 'delivered',
    }, false, 'Peer X');

    assert.equal(store.getMessages('peer-x').length, 1);

    // Cleanup
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {}
  });

  // Networking P2P integration tests (Tests 1 - 6 and 10)
  const profileA = {
    id: 'test-node-alice-1',
    name: 'Alice Node',
    deviceModel: 'MacBook Air',
  };

  const profileB = {
    id: 'test-node-bob-2',
    name: 'Bob Node',
    deviceModel: 'MacBook Pro',
  };

  const storagePathA = createTempStoragePath();
  const storagePathB = createTempStoragePath();

  const storeA = new ChatStore(storagePathA);
  const storeB = new ChatStore(storagePathB);

  const managerA = new ConnectionManager(profileA, storeA);
  const managerB = new ConnectionManager(profileB, storeB);

  try {
    await managerA.start();
    await managerB.start();

    // Wait for mutual discovery & connection
    await Promise.all([
      new Promise<void>((resolve, reject) => {
        if (managerA.isPeerConnected(profileB.id)) return resolve();
        const timer = setTimeout(() => reject(new Error('A connect timeout')), 6000);
        managerA.on('peer-connected', (id) => {
          if (id === profileB.id) {
            clearTimeout(timer);
            resolve();
          }
        });
      }),
      new Promise<void>((resolve, reject) => {
        if (managerB.isPeerConnected(profileA.id)) return resolve();
        const timer = setTimeout(() => reject(new Error('B connect timeout')), 6000);
        managerB.on('peer-connected', (id) => {
          if (id === profileA.id) {
            clearTimeout(timer);
            resolve();
          }
        });
      }),
    ]);

    // Test 1: Receiving an invitation while the radar is open
    await t.test('1. Receiving an invitation while radar is open', async () => {
      // Bob is on radar (activeChatPeerId is null)
      managerB.setActiveChatPeerId(null);

      const invitationPromise = new Promise<Invitation>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Bob did not receive invitation')), 5000);
        managerB.once('invitation-received', (inv) => {
          clearTimeout(timer);
          resolve(inv);
        });
      });

      const sendResult = await managerA.sendMessage(profileB.id, 'Hi Bob, care to chat?');
      assert.equal(sendResult.success, true);
      assert.equal(sendResult.isInvitation, true, 'First message must be an invitation');

      const receivedInv = await invitationPromise;
      assert.equal(receivedInv.senderId, profileA.id);
      assert.equal(receivedInv.senderName, profileA.name);
      assert.equal(receivedInv.text, 'Hi Bob, care to chat?');

      const convOnB = storeB.getConversation(profileA.id);
      assert.ok(convOnB);
      assert.equal(convOnB.status, 'pending_incoming');
      assert.equal(convOnB.unreadCount, 1);
    });

    // Test 5: Duplicate invitation suppression
    await t.test('5. Duplicate invitation suppression', async () => {
      let duplicateTriggered = false;
      const listener = () => {
        duplicateTriggered = true;
      };
      managerB.on('invitation-received', listener);

      // Sending another message while outgoing is pending should be rejected
      const secondSend = await managerA.sendMessage(profileB.id, 'Spamming invitation');
      assert.equal(secondSend.success, false);
      assert.ok(secondSend.error?.includes('already pending'));

      await new Promise((r) => setTimeout(r, 200));
      assert.equal(duplicateTriggered, false, 'Duplicate invitation must not trigger notification');
      managerB.off('invitation-received', listener);
    });

    // Test 4: Rejecting an invitation and notifying the sender
    await t.test('4. Rejecting an invitation and notifying sender', async () => {
      const convB = storeB.getConversation(profileA.id);
      assert.ok(convB?.pendingInvitation);

      const rejectionResponsePromise = new Promise<any>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Alice did not receive decline response')), 5000);
        managerA.once('invitation-response', (res) => {
          clearTimeout(timer);
          resolve(res);
        });
      });

      const invitationId = convB.pendingInvitation.id;

      // Bob rejects Alice's invitation
      const rejectResult = await managerB.respondToInvitation(invitationId, false);
      assert.equal(rejectResult.success, true);

      // Verify that rapid double-processing of the same invitation is strictly prevented
      const doubleProcessResult = await managerB.respondToInvitation(invitationId, true);
      assert.equal(doubleProcessResult.success, false);
      assert.ok(
        doubleProcessResult.error?.includes('already processed') ||
          doubleProcessResult.error?.includes('not found'),
        'Double-processing must be rejected'
      );

      // Bob's store should mark it declined and NOT put the message in conversation
      assert.equal(storeB.getConversation(profileA.id)?.status, 'declined');
      assert.equal(storeB.getMessages(profileA.id).length, 0);

      // Alice receives notification that invitation was declined
      const response = await rejectionResponsePromise;
      assert.equal(response.senderId, profileB.id);
      assert.equal(response.accepted, false);
      assert.equal(storeA.getConversation(profileB.id)?.status, 'declined');
    });

    // Test 2: Receiving an invitation while another chat is active
    await t.test('2. Receiving an invitation while another chat is active', async () => {
      // Bob is actively chatting with Charlie
      managerB.setActiveChatPeerId('peer-charlie');

      // Wait a moment so rate limit clears
      await new Promise((r) => setTimeout(r, 2200));

      const invitationPromise = new Promise<Invitation>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Bob did not receive new invitation')), 5000);
        managerB.once('invitation-received', (inv) => {
          clearTimeout(timer);
          resolve(inv);
        });
      });

      // Alice sends a new invitation after previous rejection
      const sendResult = await managerA.sendMessage(profileB.id, 'Hey Bob, second try!');
      assert.equal(sendResult.success, true);
      assert.equal(sendResult.isInvitation, true);

      const receivedInv = await invitationPromise;
      assert.equal(receivedInv.text, 'Hey Bob, second try!');

      // Bob's active chat with Charlie is preserved!
      assert.equal((managerB as any).currentlyActiveChatPeerId, 'peer-charlie');
      assert.equal(storeB.getConversation(profileA.id)?.status, 'pending_incoming');
    });

    // Test 3: Accepting an invitation and displaying the original message
    await t.test('3. Accepting an invitation and displaying original message', async () => {
      const convB = storeB.getConversation(profileA.id);
      assert.ok(convB?.pendingInvitation);

      const acceptResponsePromise = new Promise<any>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Alice did not receive accept response')), 5000);
        managerA.once('invitation-response', (res) => {
          clearTimeout(timer);
          resolve(res);
        });
      });

      // Bob accepts Alice's invitation
      const acceptResult = await managerB.respondToInvitation(convB.pendingInvitation.id, true);
      assert.equal(acceptResult.success, true);

      // Bob's store should now be accepted, and the original opening message is present!
      const convAfterB = storeB.getConversation(profileA.id);
      assert.equal(convAfterB?.status, 'accepted');
      const messagesB = storeB.getMessages(profileA.id);
      assert.equal(messagesB.length, 1);
      assert.equal(messagesB[0].text, 'Hey Bob, second try!');
      assert.equal(messagesB[0].status, 'delivered');

      // Alice receives accept response
      const response = await acceptResponsePromise;
      assert.equal(response.accepted, true);
      assert.equal(storeA.getConversation(profileB.id)?.status, 'accepted');
      const secondMsgA = storeA.getMessages(profileB.id).find((m) => m.text === 'Hey Bob, second try!');
      assert.ok(secondMsgA);
      assert.equal(secondMsgA.status, 'delivered');
    });

    // Test 6: Receiving messages without opening the sender's chat
    await t.test('6. Receiving messages without opening sender chat', async () => {
      // Bob is on the Radar screen (chat with Alice is not open)
      managerB.setActiveChatPeerId(null);

      const messagePromise = new Promise<Message>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Bob did not receive message')), 5000);
        managerB.once('message-received', (msg) => {
          clearTimeout(timer);
          resolve(msg);
        });
      });

      // Alice sends normal message (since conversation is accepted)
      const sendResult = await managerA.sendMessage(profileB.id, 'Message while Bob is on radar');
      assert.equal(sendResult.success, true);
      assert.equal(sendResult.isInvitation, undefined);

      const receivedMsg = await messagePromise;
      assert.equal(receivedMsg.text, 'Message while Bob is on radar');

      // Bob's store must have persisted the message and incremented unread count
      const convB = storeB.getConversation(profileA.id);
      assert.ok(convB);
      assert.ok(convB.unreadCount >= 1, 'Must increment unread count');
      const allMsgs = storeB.getMessages(profileA.id);
      assert.ok(allMsgs.some((m) => m.text === 'Message while Bob is on radar'));
    });

    // Test 10: Duplicate-message suppression and disconnected-peer behavior
    await t.test('10. Duplicate-message suppression and disconnected-peer behavior', async () => {
      let duplicateCount = 0;
      const countListener = () => {
        duplicateCount++;
      };
      managerB.on('message-received', countListener);

      const activeConnA = (managerA as any).activeConnections.get(profileB.id);
      assert.ok(activeConnA);

      // Re-send an envelope with an already received ID
      const existingMsg = storeB.getMessages(profileA.id)[0];
      activeConnA.sendEnvelope({
        type: 'message',
        id: existingMsg.id,
        senderId: profileA.id,
        recipientId: profileB.id,
        text: 'Duplicate packet',
        timestamp: Date.now(),
      });

      await new Promise((r) => setTimeout(r, 200));
      assert.equal(duplicateCount, 0, 'Duplicate message ID must be suppressed');
      managerB.off('message-received', countListener);

      // Disconnected peer behavior: send to offline/unknown peer
      const offlineSend = await managerA.sendMessage('ghost-peer-9999', 'Hello ghost');
      assert.equal(offlineSend.success, false);
      assert.ok(offlineSend.error);
    });
  } finally {
    await managerA.stop();
    await managerB.stop();

    try {
      fs.rmSync(path.dirname(storagePathA), { recursive: true, force: true });
      fs.rmSync(path.dirname(storagePathB), { recursive: true, force: true });
    } catch {}
  }
});
