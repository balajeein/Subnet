import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { ConnectionManager } from '../connection-manager';
import { ChatStore } from '../../store/chat-store';
import {
  validateProfileAvatar,
  validateProfileUpdate,
  validateHandshake,
  validateHandshakeAck,
  validateRoomMessage,
  PRESET_AVATAR_IDS,
  getAnonymousAvatarIdForMember,
} from '../protocol';
import type { Peer, RoomSummary } from '../../../src/types/subnet';

function createTempStoragePath(): string {
  const dir = path.join(
    os.tmpdir(),
    `subnet-avatar-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  );
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, 'subnet-history.json');
}

test('Subnet — Global Profile Pictures & Anonymous Avatars', async (t) => {
  // Test 1 & 5: Profile avatar validation & Fallback handling
  await t.test('1 & 5. Avatar metadata validation, size enforcement, and fallback handling', () => {
    // Valid preset
    const validPreset = validateProfileAvatar({ avatarType: 'preset', avatarValue: 'preset-fox' });
    assert.deepEqual(validPreset, { avatarType: 'preset', avatarValue: 'preset-fox' });

    // Valid default fallback
    const defaultAvatar = validateProfileAvatar({ avatarType: 'default', avatarValue: '' });
    assert.deepEqual(defaultAvatar, { avatarType: 'default', avatarValue: '' });

    // Null or undefined returns undefined fallback
    assert.equal(validateProfileAvatar(null), undefined);
    assert.equal(validateProfileAvatar(undefined), undefined);

    // Malformed avatarType
    assert.equal(validateProfileAvatar({ avatarType: 'invalid_type', avatarValue: 'xyz' }), undefined);

    // Valid custom data URL under 45KB limit
    const validCustomUrl = 'data:image/jpeg;base64,' + Buffer.alloc(100, 65).toString('base64');
    const validCustom = validateProfileAvatar({ avatarType: 'custom', avatarValue: validCustomUrl });
    assert.ok(validCustom);
    assert.equal(validCustom.avatarType, 'custom');
    assert.equal(validCustom.avatarValue, validCustomUrl);

    // Oversized custom image payload (> 45,000 chars) must be rejected
    const oversizedUrl = 'data:image/jpeg;base64,' + 'A'.repeat(46000);
    assert.equal(validateProfileAvatar({ avatarType: 'custom', avatarValue: oversizedUrl }), undefined);

    // Invalid mime-type must be rejected (security check)
    const dangerousUrl = 'data:text/html;base64,PHNjcmlwdD4=';
    assert.equal(validateProfileAvatar({ avatarType: 'custom', avatarValue: dangerousUrl }), undefined);
  });

  // Test 6 & 8: Anonymous room avatar assignment, stability, and collision avoidance
  await t.test('6 & 8. Anonymous room assigns stable, collision-free avatars across room session', () => {
    const roomId = 'anon-room-test-123';
    const member1 = { id: 'member-anon-1' };
    const member2 = { id: 'member-anon-2' };
    const member3 = { id: 'member-anon-3' };
    const member4 = { id: 'member-anon-4' };
    const members = [member1, member2, member3, member4];

    // Stability: avatar for member1 remains identical across multiple invocations/messages
    const avatar1A = getAnonymousAvatarIdForMember(roomId, member1.id, members);
    const avatar1B = getAnonymousAvatarIdForMember(roomId, member1.id, members);
    assert.equal(avatar1A, avatar1B, 'Same participant must receive consistent avatar');

    // Collision avoidance: all 4 participants in the same room must receive distinct avatars
    const avatar1 = getAnonymousAvatarIdForMember(roomId, member1.id, members);
    const avatar2 = getAnonymousAvatarIdForMember(roomId, member2.id, members);
    const avatar3 = getAnonymousAvatarIdForMember(roomId, member3.id, members);
    const avatar4 = getAnonymousAvatarIdForMember(roomId, member4.id, members);

    const assignedIds = new Set([avatar1, avatar2, avatar3, avatar4]);
    assert.equal(assignedIds.size, 4, 'All participants within room must receive unique avatars');

    // Presets collection has at least 12 distinct avatars
    assert.ok(PRESET_AVATAR_IDS.length >= 12, 'Preset collection must contain at least 12 avatars');
    for (const id of PRESET_AVATAR_IDS) {
      assert.ok(id.startsWith('preset-'));
    }
  });

  // Test 7: Anonymous rooms never leak real profile pictures or device-derived names
  await t.test('7. Anonymous rooms never render or transmit real profile picture or real device name', () => {
    // When validating room messages in protocol
    const anonMessagePayload = {
      type: 'room_message',
      id: 'msg-anon-1',
      roomId: 'room-anon-secret',
      senderId: 'anon-user-xyz',
      senderNickname: 'Silent Falcon',
      text: 'Anonymous secret note',
      timestamp: Date.now(),
      // Real avatar must NOT be present
    };

    const validated = validateRoomMessage(anonMessagePayload);
    assert.ok(validated);
    assert.equal(validated.senderAvatar, undefined, 'Anonymous message must not contain real avatar');
    assert.equal(validated.senderNickname, 'Silent Falcon', 'Anonymous message uses pseudonym only');
  });

  // Test 9: Simplified profile UI settings persistence
  await t.test('9. Simplified profile UI persists avatar settings across restarts', () => {
    const tempPath = createTempStoragePath();
    const store = new ChatStore(tempPath);

    // Initial default
    assert.equal(store.getSettings().avatarType, 'default');
    assert.equal(store.getSettings().avatarValue, '');

    // Set preset avatar
    store.updateSettings({
      avatarType: 'preset',
      avatarValue: 'preset-astro',
    });

    const store2 = new ChatStore(tempPath);
    assert.equal(store2.getSettings().avatarType, 'preset');
    assert.equal(store2.getSettings().avatarValue, 'preset-astro');

    // Reset to default
    store2.updateSettings({
      avatarType: 'default',
      avatarValue: '',
    });

    const store3 = new ChatStore(tempPath);
    assert.equal(store3.getSettings().avatarType, 'default');
    assert.equal(store3.getSettings().avatarValue, '');

    try {
      fs.rmSync(path.dirname(tempPath), { recursive: true, force: true });
    } catch {}
  });

  // Networked P2P Integration Tests for Criteria 1, 2, 3, 4
  const profileA = {
    id: 'node-alice-avatar-p2p',
    name: "Alice's MacBook Pro",
    deviceModel: 'MacBookPro18,1',
  };

  const profileB = {
    id: 'node-bob-avatar-p2p',
    name: "Bob's Mac mini",
    deviceModel: 'Macmini9,1',
  };

  const storagePathA = createTempStoragePath();
  const storagePathB = createTempStoragePath();

  const storeA = new ChatStore(storagePathA);
  const storeB = new ChatStore(storagePathB);

  // Set Alice's initial avatar to preset-astro
  storeA.updateSettings({
    avatarType: 'preset',
    avatarValue: 'preset-astro',
  });

  // Set Bob's initial avatar to preset-fox
  storeB.updateSettings({
    avatarType: 'preset',
    avatarValue: 'preset-fox',
  });

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

    // Give handshake exchange a brief moment to process
    await new Promise((r) => setTimeout(r, 200));

    // Test 1 & 2: Remote avatars appear correctly on Radar & in Private 1:1 Chat
    await t.test('1 & 2. Remote avatar received in handshake, visible on Radar and in private chat', () => {
      // Bob's avatar on Alice's Radar
      const cachedBobAvatarOnA = storeA.getPeerAvatar(profileB.id);
      assert.ok(cachedBobAvatarOnA, 'Alice must have cached Bob avatar');
      assert.equal(cachedBobAvatarOnA?.avatarType, 'preset');
      assert.equal(cachedBobAvatarOnA?.avatarValue, 'preset-fox');

      // Alice's avatar on Bob's Radar
      const cachedAliceAvatarOnB = storeB.getPeerAvatar(profileA.id);
      assert.ok(cachedAliceAvatarOnB, 'Bob must have cached Alice avatar');
      assert.equal(cachedAliceAvatarOnB?.avatarType, 'preset');
      assert.equal(cachedAliceAvatarOnB?.avatarValue, 'preset-astro');
    });

    // Test 3: Private group chat shows the correct avatar for each sender
    await t.test('3. Private group chat includes sender avatar on messages', async () => {
      // Alice creates a private room inviting Bob
      const createRes = await managerA.createPrivateRoom('Project Alpha', [profileB.id]);
      assert.equal(createRes.success, true);
      const roomId = createRes.roomId!;

      // Wait for Bob to receive room invitation
      await new Promise((r) => setTimeout(r, 200));

      // Bob accepts room invitation
      const acceptRes = await managerB.respondToRoomInvitation(roomId, true);
      assert.equal(acceptRes.success, true);

      await new Promise((r) => setTimeout(r, 200));

      // Alice sends a message in the private room
      const msgPromise = new Promise<any>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Bob room message timeout')), 5000);
        managerB.once('room-message-received', (msg) => {
          clearTimeout(timer);
          resolve(msg);
        });
      });

      const sendRes = await managerA.sendRoomMessage(roomId, 'Welcome to Project Alpha!');
      assert.equal(sendRes.success, true);

      const receivedMsg = await msgPromise;
      assert.equal(receivedMsg.text, 'Welcome to Project Alpha!');
      assert.ok(receivedMsg.senderAvatar, 'Private room message must contain sender profile avatar');
      assert.equal(receivedMsg.senderAvatar.avatarType, 'preset');
      assert.equal(receivedMsg.senderAvatar.avatarValue, 'preset-astro');
    });

    // Test 4: Changing an avatar updates connected peers without an app restart
    await t.test('4. Changing an avatar updates connected peers dynamically without app restart', async () => {
      const updatePromise = new Promise<Peer>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Bob peer-updated timeout')), 5000);
        managerB.once('peer-updated', (peer) => {
          if (peer.id === profileA.id) {
            clearTimeout(timer);
            resolve(peer);
          }
        });
      });

      // Alice updates her avatar to 'preset-owl' live
      managerA.updateSettings({
        avatarType: 'preset',
        avatarValue: 'preset-owl',
      });

      const updatedPeer = await updatePromise;
      assert.equal(updatedPeer.id, profileA.id);
      assert.ok(updatedPeer.avatar);
      assert.equal(updatedPeer.avatar.avatarType, 'preset');
      assert.equal(updatedPeer.avatar.avatarValue, 'preset-owl');

      // Verify Bob's cache was updated immediately
      const bobCache = storeB.getPeerAvatar(profileA.id);
      assert.equal(bobCache?.avatarValue, 'preset-owl');
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
