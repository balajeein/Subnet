import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { ConnectionManager } from '../connection-manager';
import { ChatStore } from '../../store/chat-store';
import type { Invitation, Message } from '../../../src/types/subnet';

function createTempStoragePath(): string {
  const dir = path.join(
    os.tmpdir(),
    `subnet-first-msg-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  );
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, 'subnet-history.json');
}

test('Subnet — First Message Bug Fix & Settings Tests', async (t) => {
  // Test 1: Settings persistence and default values across restarts
  await t.test('1. Settings persistence across store restarts', () => {
    const tempPath = createTempStoragePath();
    const store1 = new ChatStore(tempPath);

    // Initial defaults
    const defaults = store1.getSettings();
    assert.equal(defaults.avatarType, 'default');
    assert.equal(defaults.defaultAnonymousNickname, '');
    assert.equal(defaults.theme, 'system');
    assert.equal(defaults.notificationsEnabled, true);
    assert.equal(defaults.soundEnabled, true);

    // Save customized settings
    store1.updateSettings({
      avatarType: 'preset',
      avatarValue: 'preset-fox',
      defaultAnonymousNickname: 'Shadow Otter',
      theme: 'dark',
      soundEnabled: false,
    });

    // Simulate app restart
    const store2 = new ChatStore(tempPath);
    const loaded = store2.getSettings();
    assert.equal(loaded.avatarType, 'preset');
    assert.equal(loaded.avatarValue, 'preset-fox');
    assert.equal(loaded.defaultAnonymousNickname, 'Shadow Otter');
    assert.equal(loaded.theme, 'dark');
    assert.equal(loaded.soundEnabled, false);
    assert.equal(loaded.notificationsEnabled, true);

    // Clear anonymous nickname
    store2.updateSettings({ defaultAnonymousNickname: '' });
    const store3 = new ChatStore(tempPath);
    assert.equal(store3.getSettings().defaultAnonymousNickname, '');

    try {
      fs.rmSync(path.dirname(tempPath), { recursive: true, force: true });
    } catch {}
  });

  // Test 2: Restarting recipient app before and after accepting does not lose initial message
  await t.test('2. Restarting recipient app does not lose initial request message', () => {
    const tempPath = createTempStoragePath();
    const store = new ChatStore(tempPath);

    const inv: Invitation = {
      id: 'inv-restart-test-1',
      senderId: 'peer-alice',
      senderName: 'Alice',
      recipientId: 'peer-bob',
      text: 'Original initial message for restart test',
      timestamp: 1000,
      status: 'pending',
    };

    // Record incoming invitation
    store.recordIncomingInvitation(inv);

    // Restart app BEFORE accepting
    const storeRestartBefore = new ChatStore(tempPath);
    const convBefore = storeRestartBefore.getConversation('peer-alice');
    assert.ok(convBefore);
    assert.equal(convBefore.status, 'pending_incoming');
    assert.equal(convBefore.pendingInvitation?.text, 'Original initial message for restart test');
    assert.equal(storeRestartBefore.getMessages('peer-alice').length, 0);

    // Now accept the request after restart
    const resolved = storeRestartBefore.resolveInvitation('peer-alice', true);
    assert.ok(resolved);
    assert.equal(resolved.status, 'accepted');

    const msgsAfterAccept = storeRestartBefore.getMessages('peer-alice');
    assert.equal(msgsAfterAccept.length, 1);
    assert.equal(msgsAfterAccept[0].id, 'inv-restart-test-1');
    assert.equal(msgsAfterAccept[0].text, 'Original initial message for restart test');
    assert.equal(msgsAfterAccept[0].status, 'delivered');

    // Restart app AFTER accepting
    const storeRestartAfter = new ChatStore(tempPath);
    const msgsAfterRestart = storeRestartAfter.getMessages('peer-alice');
    assert.equal(msgsAfterRestart.length, 1);
    assert.equal(msgsAfterRestart[0].id, 'inv-restart-test-1');
    assert.equal(msgsAfterRestart[0].text, 'Original initial message for restart test');
    assert.equal(msgsAfterRestart[0].status, 'delivered');

    try {
      fs.rmSync(path.dirname(tempPath), { recursive: true, force: true });
    } catch {}
  });

  // Test 3: Rejection does not create an accepted conversation or deliver message
  await t.test('3. Rejection does not create an accepted conversation or deliver message', () => {
    const tempPath = createTempStoragePath();
    const store = new ChatStore(tempPath);

    const inv: Invitation = {
      id: 'inv-reject-test',
      senderId: 'peer-charlie',
      senderName: 'Charlie',
      recipientId: 'peer-bob',
      text: 'Please reject this request',
      timestamp: 2000,
      status: 'pending',
    };

    store.recordIncomingInvitation(inv);
    assert.equal(store.getConversation('peer-charlie')?.status, 'pending_incoming');

    // Reject invitation
    const resolved = store.resolveInvitation('peer-charlie', false);
    assert.ok(resolved);
    assert.equal(resolved.status, 'declined');

    const conv = store.getConversation('peer-charlie');
    assert.ok(conv);
    assert.equal(conv.status, 'declined');
    assert.equal(conv.pendingInvitation, undefined);
    assert.equal(store.getMessages('peer-charlie').length, 0, 'No messages must be delivered upon rejection');

    try {
      fs.rmSync(path.dirname(tempPath), { recursive: true, force: true });
    } catch {}
  });

  // Networked P2P integration tests for full lifecycle
  const profileA = {
    id: 'node-alice-fix-test',
    name: 'Alice Fix',
    deviceModel: 'MacBook Pro',
  };

  const profileB = {
    id: 'node-bob-fix-test',
    name: 'Bob Fix',
    deviceModel: 'MacBook Air',
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

    // Mutual discovery and handshake
    await Promise.all([
      new Promise<void>((resolve, reject) => {
        if (managerA.isPeerConnected(profileB.id)) return resolve();
        const timer = setTimeout(() => reject(new Error('A connect timeout')), 8000);
        managerA.on('peer-connected', (id) => {
          if (id === profileB.id) {
            clearTimeout(timer);
            resolve();
          }
        });
      }),
      new Promise<void>((resolve, reject) => {
        if (managerB.isPeerConnected(profileA.id)) return resolve();
        const timer = setTimeout(() => reject(new Error('B connect timeout')), 8000);
        managerB.on('peer-connected', (id) => {
          if (id === profileA.id) {
            clearTimeout(timer);
            resolve();
          }
        });
      }),
    ]);

    // Test 4: Initial request message appears for both users exactly once after acceptance
    await t.test('4. Initial request message appears for both users exactly once after acceptance', async () => {
      let bobDeliveredMsg: Message | null = null;
      managerB.once('message-received', (msg) => {
        bobDeliveredMsg = msg;
      });

      const acceptPromise = new Promise<any>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Alice accept response timeout')), 5000);
        managerA.once('invitation-response', (res) => {
          clearTimeout(timer);
          resolve(res);
        });
      });

      // Alice sends initial invitation
      const sendRes = await managerA.sendMessage(profileB.id, 'Hello Bob! This is message #1');
      assert.equal(sendRes.success, true);
      assert.equal(sendRes.isInvitation, true);

      // Wait a moment for Bob to receive
      await new Promise((r) => setTimeout(r, 100));

      const convB = storeB.getConversation(profileA.id);
      assert.ok(convB?.pendingInvitation);
      const invId = convB.pendingInvitation.id;

      // Bob accepts request
      const acceptRes = await managerB.respondToInvitation(invId, true);
      assert.equal(acceptRes.success, true);

      await acceptPromise;

      // Check Bob's store
      const msgsOnB = storeB.getMessages(profileA.id);
      assert.equal(msgsOnB.length, 1, 'Bob must have exactly 1 message');
      assert.equal(msgsOnB[0].text, 'Hello Bob! This is message #1');
      assert.equal(msgsOnB[0].status, 'delivered');

      // Check Bob received event notification for the initial message
      assert.ok(bobDeliveredMsg);
      assert.equal((bobDeliveredMsg as Message).text, 'Hello Bob! This is message #1');

      // Check Alice's store
      const msgsOnA = storeA.getMessages(profileB.id);
      assert.equal(msgsOnA.length, 1, 'Alice must have exactly 1 message');
      assert.equal(msgsOnA[0].text, 'Hello Bob! This is message #1');
      assert.equal(msgsOnA[0].status, 'delivered');

      // Duplicate acceptance attempt must be safely rejected and not duplicate message
      const dupRes = await managerB.respondToInvitation(invId, true);
      assert.equal(dupRes.success, false);
      assert.equal(storeB.getMessages(profileA.id).length, 1, 'Message must not be duplicated');
    });

    // Test 5: A second message sent immediately after acceptance does not overtake the first
    await t.test('5. Second message immediately after acceptance does not overtake the first', async () => {
      // Bob is actively chatting with Alice
      managerB.setActiveChatPeerId(profileA.id);

      const msg2Promise = new Promise<Message>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Bob msg2 timeout')), 5000);
        managerB.once('message-received', (msg) => {
          clearTimeout(timer);
          resolve(msg);
        });
      });

      // Alice immediately sends second message
      const sendRes2 = await managerA.sendMessage(profileB.id, 'Second message right after accept!');
      assert.equal(sendRes2.success, true);
      assert.equal(sendRes2.isInvitation, undefined);

      const receivedMsg2 = await msg2Promise;
      assert.equal(receivedMsg2.text, 'Second message right after accept!');

      // Inspect Bob's message list: strict ordering preserved
      const bMessages = storeB.getMessages(profileA.id);
      assert.equal(bMessages.length, 2, 'Bob must have exactly 2 messages in total');
      assert.equal(bMessages[0].text, 'Hello Bob! This is message #1', 'First message must remain first');
      assert.equal(bMessages[1].text, 'Second message right after accept!', 'Second message must be second');
      assert.ok(bMessages[0].timestamp <= bMessages[1].timestamp, 'Message timestamps must be chronologically ordered');

      // Inspect Alice's message list
      const aMessages = storeA.getMessages(profileB.id);
      assert.equal(aMessages.length, 2, 'Alice must have exactly 2 messages in total');
      assert.equal(aMessages[0].text, 'Hello Bob! This is message #1');
      assert.equal(aMessages[1].text, 'Second message right after accept!');
      assert.ok(aMessages[0].timestamp <= aMessages[1].timestamp);
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
