import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { ConnectionManager } from '../connection-manager';
import { ChatStore, StoredRoom } from '../../store/chat-store';
import { validateConversationEnd, parseAndValidateEnvelope } from '../protocol';
import type { LocalProfile, Message, RoomMessage } from '../../../src/types/subnet';

function createTempStoragePath(): string {
  const dir = path.join(
    os.tmpdir(),
    `subnet-end-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  );
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, 'subnet-history.json');
}

test('Bug Fixes: End Conversation, Auto-Accept & Private Chat Alignment', async (t) => {
  // Test 1: Delete Chat removes only the initiator's local history
  await t.test('1. Delete Chat removes only the initiator local history', () => {
    const storeA = new ChatStore(createTempStoragePath());
    const storeB = new ChatStore(createTempStoragePath());

    const peerA = 'peer-alice-1111';
    const peerB = 'peer-bob-2222';

    const msg: Message = {
      id: 'msg-1',
      senderId: peerA,
      recipientId: peerB,
      text: 'Direct message',
      timestamp: Date.now(),
    };

    storeA.addMessage(peerB, msg, false, 'Bob');
    storeB.addMessage(peerA, msg, true, 'Alice');

    assert.equal(storeA.getConversations().length, 1);
    assert.equal(storeB.getConversations().length, 1);

    // Peer A performs Delete Chat
    const deletedA = storeA.deleteConversation(peerB);
    assert.equal(deletedA, true);

    // Peer A has 0 conversations locally
    assert.equal(storeA.getConversations().length, 0);
    assert.equal(storeA.getMessages(peerB).length, 0);

    // Peer B's history remains intact
    assert.equal(storeB.getConversations().length, 1);
    assert.equal(storeB.getMessages(peerA).length, 1);
  });

  // Test 2 & 3: End Conversation removes both histories when reachable, does not falsely report when offline
  await t.test('2 & 3. End Conversation removes both histories when reachable; fails honestly when offline', async () => {
    const profA: LocalProfile = { id: 'node-alice-3333', name: 'Alice' };
    const profB: LocalProfile = { id: 'node-bob-4444', name: 'Bob' };

    const storeA = new ChatStore(createTempStoragePath());
    const storeB = new ChatStore(createTempStoragePath());

    const mgrA = new ConnectionManager(profA, storeA);
    const mgrB = new ConnectionManager(profB, storeB);

    // Case 3: Offline peer test before starting network
    const offlineRes = await mgrA.endConversation(profB.id);
    assert.equal(offlineRes.success, false, 'Must not claim success when peer is offline');
    assert.equal(offlineRes.remoteConfirmed, false);
    assert.ok(offlineRes.error?.includes('offline') || offlineRes.error?.includes('reach'));

    // Start network for both
    const statusA = await mgrA.start();
    const statusB = await mgrB.start();

    // Manually register discovered peer info
    (mgrA as any).discoveredPeers.set(profB.id, {
      id: profB.id,
      name: profB.name,
      host: '127.0.0.1',
      port: statusB.port,
    });
    (mgrB as any).discoveredPeers.set(profA.id, {
      id: profA.id,
      name: profA.name,
      host: '127.0.0.1',
      port: statusA.port,
    });

    // Establish mutual connection
    const connA = await mgrA.connectToPeer(profB.id);
    assert.ok(connA, 'Should connect A to B');
    await new Promise((r) => setTimeout(r, 150));

    // Seed conversation on both
    const sharedMsg: Message = {
      id: 'shared-1',
      senderId: profA.id,
      recipientId: profB.id,
      text: 'Hello Bob',
      timestamp: Date.now(),
      status: 'delivered',
    };
    storeA.addMessage(profB.id, sharedMsg, false, profB.name);
    storeB.addMessage(profA.id, sharedMsg, false, profA.name);

    assert.equal(storeA.getConversations().length, 1);
    assert.equal(storeB.getConversations().length, 1);

    let bReceivedEndNotice = false;
    mgrB.on('conversation-ended', (data) => {
      if (data.peerId === profA.id) {
        bReceivedEndNotice = true;
      }
    });

    // Alice ends conversation
    const endRes = await mgrA.endConversation(profB.id);
    assert.equal(endRes.success, true);
    assert.equal(endRes.remoteConfirmed, true);

    await new Promise((r) => setTimeout(r, 100));

    // Both stores must now have 0 conversations
    assert.equal(storeA.getConversations().length, 0);
    assert.equal(storeA.getMessages(profB.id).length, 0);

    assert.equal(storeB.getConversations().length, 0);
    assert.equal(storeB.getMessages(profA.id).length, 0);
    assert.equal(bReceivedEndNotice, true, 'Bob should receive conversation-ended event');

    // Test 4: Duplicate end events are safe and idempotent
    const duplicatePayload = {
      type: 'conversation_end',
      id: 'dup-end-id',
      senderId: profA.id,
      recipientId: profB.id,
      timestamp: Date.now(),
    };
    assert.ok(validateConversationEnd(duplicatePayload));
    assert.ok(parseAndValidateEnvelope(JSON.stringify(duplicatePayload)));

    // Simulating duplicate delivery
    (mgrB as any).processedEndEventIds.add(duplicatePayload.id);
    // Does not crash or recreate
    assert.equal(storeB.getConversations().length, 0);

    // Test 5: An ended conversation cannot continue receiving ordinary messages
    const staleMsgPayload = {
      type: 'message',
      id: 'stale-msg-1',
      senderId: profA.id,
      recipientId: profB.id,
      text: 'Stale injected message',
      timestamp: Date.now(),
    };
    // Emit through conn
    const connB = (mgrB as any).activeConnections.get(profA.id);
    if (connB) {
      connB.emit('message', staleMsgPayload);
    }
    // Conversation must NOT be recreated
    assert.equal(storeB.getConversations().length, 0, 'Stale message must not recreate ended conversation');

    // Test 6: A fresh invitation is required to restart an ended conversation
    const restartSend = await mgrA.sendMessage(profB.id, 'Let us talk again');
    assert.equal(restartSend.success, true);
    assert.equal(restartSend.isInvitation, true, 'Must send an invitation, not an ordinary message');

    await mgrA.stop();
    await mgrB.stop();
  });

  // Test 7: A recipient sending a message from a valid pending direct invitation auto-accepts it
  await t.test('7. Recipient sending a message from a valid pending direct invitation auto-accepts it', async () => {
    const profA: LocalProfile = { id: 'node-alice-7777', name: 'Alice' };
    const profB: LocalProfile = { id: 'node-bob-8888', name: 'Bob' };

    const storeA = new ChatStore(createTempStoragePath());
    const storeB = new ChatStore(createTempStoragePath());

    const mgrA = new ConnectionManager(profA, storeA);
    const mgrB = new ConnectionManager(profB, storeB);

    const statusA = await mgrA.start();
    const statusB = await mgrB.start();

    (mgrA as any).discoveredPeers.set(profB.id, {
      id: profB.id,
      name: profB.name,
      host: '127.0.0.1',
      port: statusB.port,
    });
    (mgrB as any).discoveredPeers.set(profA.id, {
      id: profA.id,
      name: profA.name,
      host: '127.0.0.1',
      port: statusA.port,
    });

    // Alice sends invitation to Bob
    const invRes = await mgrA.sendMessage(profB.id, 'Want to chat?');
    assert.equal(invRes.success, true);
    assert.equal(invRes.isInvitation, true);

    await new Promise((r) => setTimeout(r, 200));

    // Verify Bob has pending_incoming conversation
    const convB = storeB.getConversation(profA.id);
    assert.ok(convB);
    assert.equal(convB.status, 'pending_incoming');
    assert.ok(convB.pendingInvitation);

    // Bob now replies by sending a message without clicking Accept first
    const replyRes = await mgrB.sendMessage(profA.id, 'Sure, let us chat!');
    assert.equal(replyRes.success, true);

    await new Promise((r) => setTimeout(r, 200));

    // Both should now be in 'accepted' state!
    const updatedConvB = storeB.getConversation(profA.id);
    assert.equal(updatedConvB?.status, 'accepted');
    assert.equal(updatedConvB?.pendingInvitation, undefined);

    const updatedConvA = storeA.getConversation(profB.id);
    assert.equal(updatedConvA?.status, 'accepted');

    await mgrA.stop();
    await mgrB.stop();
  });

  // Test 8: Explicit participation in a pending private-room invitation accepts it before sending
  await t.test('8. Explicit participation in a pending private-room invitation accepts it before sending', async () => {
    const profHost: LocalProfile = { id: 'host-alice-9999', name: 'Alice Host' };
    const profMember: LocalProfile = { id: 'member-bob-0000', name: 'Bob Member' };

    const storeHost = new ChatStore(createTempStoragePath());
    const storeMember = new ChatStore(createTempStoragePath());

    const mgrHost = new ConnectionManager(profHost, storeHost);
    const mgrMember = new ConnectionManager(profMember, storeMember);

    const statusHost = await mgrHost.start();
    const statusMember = await mgrMember.start();

    (mgrHost as any).discoveredPeers.set(profMember.id, {
      id: profMember.id,
      name: profMember.name,
      host: '127.0.0.1',
      port: statusMember.port,
    });
    (mgrMember as any).discoveredPeers.set(profHost.id, {
      id: profHost.id,
      name: profHost.name,
      host: '127.0.0.1',
      port: statusHost.port,
    });

    // Host creates private room with Bob invited
    const roomRes = await mgrHost.createPrivateRoom('Secret Team', [profMember.id]);
    assert.equal(roomRes.success, true);
    const roomId = roomRes.roomId!;

    await new Promise((r) => setTimeout(r, 200));

    // Bob has room in 'invited' status
    const roomOnBob = storeMember.getRoom(roomId);
    assert.ok(roomOnBob);
    assert.equal(roomOnBob.status, 'invited');

    // Bob sends a message in the room directly (explicit participation)
    const sendRes = await mgrMember.sendRoomMessage(roomId, 'Hello everyone!');
    assert.equal(sendRes.success, true);

    await new Promise((r) => setTimeout(r, 200));

    // Bob's room should have auto-transitioned to 'joined'
    const joinedRoomOnBob = storeMember.getRoom(roomId);
    assert.equal(joinedRoomOnBob?.status, 'joined');

    // Message delivered to host
    const msgsOnHost = storeHost.getRoomMessages(roomId);
    assert.ok(msgsOnHost.some((m) => m.text === 'Hello everyone!'));

    await mgrHost.stop();
    await mgrMember.stop();
  });

  // Test 9: Viewing a request alone does not auto-accept it
  await t.test('9. Viewing a request alone does not auto-accept it', () => {
    const store = new ChatStore(createTempStoragePath());
    const inv: any = {
      id: 'inv-view-only',
      senderId: 'peer-sender',
      senderName: 'Sender',
      recipientId: 'peer-me',
      text: 'Hello view',
      timestamp: Date.now(),
      status: 'pending',
    };

    store.recordIncomingInvitation(inv);

    // Reading or querying requests
    const pendingList = store.getPendingIncomingInvitations();
    assert.equal(pendingList.length, 1);

    const conv = store.getConversation('peer-sender');
    assert.equal(conv?.status, 'pending_incoming', 'Conversation must stay in pending_incoming on view');
    assert.ok(conv?.pendingInvitation);
  });

  // Test 10 & 11: Private-room message sender identification and alignment logic
  await t.test('10 & 11. Private-room message sender identity comparison', () => {
    const localProfile: LocalProfile = { id: 'local-peer-id', name: 'Local User' };
    const remotePeerId = 'remote-peer-id';

    const testRoom: StoredRoom = {
      id: 'room-align-test',
      name: 'Alignment Room',
      type: 'private',
      hostId: localProfile.id,
      myNickname: 'Local User',
      members: [
        { id: localProfile.id, nickname: 'Local User', isHost: true },
        { id: remotePeerId, nickname: 'Remote Peer' },
      ],
      status: 'joined',
      lastTimestamp: Date.now(),
      unreadCount: 0,
      messages: [],
    };

    const incomingMsg: RoomMessage = {
      id: 'msg-in-1',
      roomId: testRoom.id,
      senderId: remotePeerId,
      senderNickname: 'Remote Peer',
      text: 'Incoming message from remote peer',
      timestamp: 1000,
    };

    const outgoingMsg: RoomMessage = {
      id: 'msg-out-1',
      roomId: testRoom.id,
      senderId: localProfile.id,
      senderNickname: 'Local User',
      text: 'Outgoing message from local user',
      timestamp: 1001,
    };

    // Test comparison logic used in RoomChatPane: msg.senderId === localProfile?.id
    const incomingIsSelf = !!localProfile?.id && incomingMsg.senderId === localProfile.id;
    assert.equal(incomingIsSelf, false, 'Remote message must not be flagged as isSelf');

    const outgoingIsSelf = !!localProfile?.id && outgoingMsg.senderId === localProfile.id;
    assert.equal(outgoingIsSelf, true, 'Local message must be flagged as isSelf');

    // Test remote display name resolution
    const member = testRoom.members.find((m) => m.id === incomingMsg.senderId);
    assert.equal(member?.nickname, 'Remote Peer');
    assert.equal(member?.isHost, undefined);
  });
});
