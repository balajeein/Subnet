import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { ConnectionManager } from '../connection-manager';
import { ChatStore } from '../../store/chat-store';
import type { Message, LocalProfile } from '../../../src/types/subnet';

function createTempStoragePath(): string {
  const dir = path.join(os.tmpdir(), `subnet-delete-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, 'subnet-history.json');
}

test('Delete Chat - Local Persistence, Scoping, and Restart Survival', async (t) => {
  await t.test('1. Deletes conversation and messages locally, surviving reload', () => {
    const tempPath = createTempStoragePath();
    const store = new ChatStore(tempPath);

    const peerA = 'peer-aaa';
    const peerB = 'peer-bbb';

    const msgA: Message = {
      id: 'msg-a1',
      senderId: peerA,
      recipientId: 'local',
      text: 'Hello from peer A',
      timestamp: 1000,
    };
    const msgB: Message = {
      id: 'msg-b1',
      senderId: peerB,
      recipientId: 'local',
      text: 'Hello from peer B',
      timestamp: 1100,
    };

    store.addMessage(peerA, msgA, true, 'Alice');
    store.addMessage(peerB, msgB, false, 'Bob');

    assert.equal(store.getConversations().length, 2);
    assert.equal(store.getMessages(peerA).length, 1);
    assert.equal(store.getMessages(peerB).length, 1);

    // Delete peerA's conversation
    const deleted = store.deleteConversation(peerA);
    assert.equal(deleted, true, 'deleteConversation should return true for existing conversation');

    // Peer A should be gone, Peer B must remain untouched (strictly scoped)
    assert.equal(store.getConversation(peerA), null);
    assert.equal(store.getMessages(peerA).length, 0);
    assert.equal(store.getConversations().length, 1);
    assert.equal(store.getConversations()[0].peerId, peerB);
    assert.equal(store.getMessages(peerB).length, 1);

    // Verify persistence survives restart/reload
    const reloadedStore = new ChatStore(tempPath);
    assert.equal(reloadedStore.getConversation(peerA), null, 'Deleted chat must not exist after reload');
    assert.equal(reloadedStore.getMessages(peerA).length, 0);
    assert.equal(reloadedStore.getConversations().length, 1);
    assert.equal(reloadedStore.getConversations()[0].peerId, peerB);
    assert.equal(reloadedStore.getMessages(peerB).length, 1);

    // Deleting non-existent conversation returns false
    const deleteAgain = store.deleteConversation(peerA);
    assert.equal(deleteAgain, false);
  });

  await t.test('2. ConnectionManager deleteConversation resets activeChatPeerId and emits updates', () => {
    const tempPath = createTempStoragePath();
    const store = new ChatStore(tempPath);

    const localProfile: LocalProfile = { id: 'local-test', name: 'Tester' };
    const manager = new ConnectionManager(localProfile, store);

    const peerId = 'peer-target';
    store.addMessage(peerId, {
      id: 'msg-1',
      senderId: peerId,
      recipientId: localProfile.id,
      text: 'Test message',
      timestamp: 1200,
    }, true, 'Target Peer');

    manager.setActiveChatPeerId(peerId);
    assert.equal((manager as any).currentlyActiveChatPeerId, peerId);

    let emittedConvs: any[] | null = null;
    manager.on('conversations-updated', (convs) => {
      emittedConvs = convs;
    });

    const success = manager.deleteConversation(peerId);
    assert.equal(success, true);
    assert.equal((manager as any).currentlyActiveChatPeerId, null, 'Active chat peer must be reset');
    assert.ok(emittedConvs);
    assert.equal((emittedConvs as any).length, 0);

    // Arriving message afterwards recreates conversation safely
    const incomingMsg: Message = {
      id: 'msg-after-delete',
      senderId: peerId,
      recipientId: localProfile.id,
      text: 'New message after delete',
      timestamp: 1300,
    };
    store.addMessage(peerId, incomingMsg, true, 'Target Peer');
    assert.equal(store.getConversations().length, 1);
    assert.equal(store.getMessages(peerId).length, 1);
  });
});
