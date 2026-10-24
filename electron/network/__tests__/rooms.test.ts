import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { ConnectionManager } from '../connection-manager';
import { ChatStore } from '../../store/chat-store';
import {
  validateNickname,
  validateRoomInvitation,
  validateRoomJoin,
  validateRoomMessage,
  parseAndValidateEnvelope,
} from '../protocol';
import type { LocalProfile, RoomMessage } from '../../../src/types/subnet';

function createTempStoragePath(): string {
  const dir = path.join(os.tmpdir(), `subnet-room-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, 'subnet-history.json');
}

test('Room Protocol & Membership Validation Tests', async (t) => {
  await t.test('1. Nickname validator enforcement', () => {
    assert.equal(validateNickname('Neon Hawk'), 'Neon Hawk');
    assert.equal(validateNickname('swift_fox-42'), 'swift_fox-42');
    assert.equal(validateNickname('Ab'), 'Ab'); // 2 chars min

    // Invalid nicknames
    assert.equal(validateNickname('A'), null, 'Must reject < 2 chars');
    assert.equal(validateNickname('This nickname is way too long and should be rejected completely because it exceeds 30 chars'), null);
    assert.equal(validateNickname('<script>alert(1)</script>'), null, 'Must reject HTML/special chars');
    assert.equal(validateNickname('User@Domain!'), null, 'Must reject disallowed symbols');
    assert.equal(validateNickname(null), null);
    assert.equal(validateNickname('   '), null);
  });

  await t.test('2. Protocol envelope validation for room payloads', () => {
    const validInv = {
      type: 'room_invitation',
      id: 'inv-123',
      roomId: 'room-456',
      roomName: 'Dev Group',
      roomType: 'private',
      hostId: 'host-1',
      hostName: 'Alice',
      invitedPeerId: 'peer-2',
      timestamp: 1000,
    };
    assert.ok(validateRoomInvitation(validInv));
    assert.ok(parseAndValidateEnvelope(JSON.stringify(validInv)));

    const invalidInv = { ...validInv, roomName: '' };
    assert.equal(validateRoomInvitation(invalidInv), null);

    const validMsg = {
      type: 'room_message',
      id: 'msg-999',
      roomId: 'room-456',
      senderId: 'host-1',
      senderNickname: 'Alice',
      text: 'Hello room members',
      timestamp: 2000,
    };
    assert.ok(validateRoomMessage(validMsg));
    assert.ok(parseAndValidateEnvelope(JSON.stringify(validMsg)));

    // Message too long or empty
    assert.equal(validateRoomMessage({ ...validMsg, text: '' }), null);
    assert.equal(validateRoomMessage({ ...validMsg, roomId: '' }), null);
  });
});

test('Private & Anonymous Room Lifecycle Tests', async (t) => {
  const storagePathA = createTempStoragePath();
  const storagePathB = createTempStoragePath();
  const storagePathC = createTempStoragePath();

  const storeA = new ChatStore(storagePathA);
  const storeB = new ChatStore(storagePathB);
  const storeC = new ChatStore(storagePathC);

  const profileA: LocalProfile = { id: 'node-alice-host', name: 'Alice Host' };
  const profileB: LocalProfile = { id: 'node-bob-member', name: 'Bob Member' };
  const profileC: LocalProfile = { id: 'node-charlie-anon', name: 'Charlie Anon' };

  const managerA = new ConnectionManager(profileA, storeA);
  const managerB = new ConnectionManager(profileB, storeB);
  const managerC = new ConnectionManager(profileC, storeC);

  try {
    const statusA = await managerA.start();
    const statusB = await managerB.start();
    const statusC = await managerC.start();

    // Connect nodes on LAN
    await (managerB as any).connectToAddress(profileA.id, '127.0.0.1', statusA.port, profileA.name);
    await (managerC as any).connectToAddress(profileA.id, '127.0.0.1', statusA.port, profileA.name);
    await new Promise((r) => setTimeout(r, 600));

    // Test 1: Private room creation, invitation, acceptance, and group messaging
    let privateRoomId = '';
    await t.test('3. Private room creation, invitation dispatch, and acceptance', async () => {
      // Bob listens for room invitation
      const invPromise = new Promise<any>((resolve) => {
        managerB.once('room-invitation-received', resolve);
      });

      const createRes = await managerA.createPrivateRoom('Design Team', [profileB.id]);
      assert.equal(createRes.success, true);
      assert.ok(createRes.roomId);
      privateRoomId = createRes.roomId!;

      const receivedInv = await invPromise;
      assert.equal(receivedInv.roomId, privateRoomId);
      assert.equal(receivedInv.roomName, 'Design Team');
      assert.equal(receivedInv.hostId, profileA.id);

      // Verify Bob's store has room as 'invited'
      const roomBBefore = storeB.getRoom(privateRoomId);
      assert.ok(roomBBefore);
      assert.equal(roomBBefore.status, 'invited');

      // Bob accepts room invitation
      const acceptRes = await managerB.respondToRoomInvitation(privateRoomId, true);
      assert.equal(acceptRes.success, true);

      await new Promise((r) => setTimeout(r, 400));

      // Alice's room member list should now include Bob
      const roomA = storeA.getRoom(privateRoomId);
      assert.ok(roomA);
      assert.ok(roomA.members.some((m) => m.id === profileB.id));

      // Bob's store should be 'joined'
      const roomBAfter = storeB.getRoom(privateRoomId);
      assert.ok(roomBAfter);
      assert.equal(roomBAfter.status, 'joined');
    });

    // Test 2: Real-time group messaging and deduplication
    await t.test('4. Group messaging and message deduplication', async () => {
      const msgPromise = new Promise<RoomMessage>((resolve) => {
        managerB.once('room-message-received', resolve);
      });

      const sendRes = await managerA.sendRoomMessage(privateRoomId, 'Welcome Bob to Design Team!');
      assert.equal(sendRes.success, true);

      const received = await msgPromise;
      assert.equal(received.text, 'Welcome Bob to Design Team!');
      assert.equal(received.senderId, profileA.id);

      // Verify message is saved in Bob's store
      const messagesB = storeB.getRoomMessages(privateRoomId);
      assert.ok(messagesB.some((m) => m.text === 'Welcome Bob to Design Team!'));

      // Test duplicate message suppression
      let bReceivedCount = 0;
      const countListener = () => { bReceivedCount++; };
      managerB.on('room-message-received', countListener);

      const connB = (managerA as any).activeConnections.get(profileB.id);
      assert.ok(connB);

      // Re-send same message envelope
      connB.sendEnvelope({
        type: 'room_message',
        id: received.id,
        roomId: privateRoomId,
        senderId: profileA.id,
        senderNickname: 'Alice',
        text: 'Welcome Bob to Design Team!',
        timestamp: received.timestamp,
      });

      await new Promise((r) => setTimeout(r, 200));
      assert.equal(bReceivedCount, 0, 'Duplicate room message must be suppressed');
      managerB.off('room-message-received', countListener);
    });

    // Test 3: Unauthorized message rejection (non-member)
    await t.test('5. Rejects room messages from unauthorized non-members', async () => {
      const initialCount = storeA.getRoomMessages(privateRoomId).length;

      // Charlie is NOT a member of Design Team. Try to inject a message into Design Team!
      const connC = (managerC as any).activeConnections.get(profileA.id);
      assert.ok(connC);

      connC.sendEnvelope({
        type: 'room_message',
        id: 'spoofed-msg-999',
        roomId: privateRoomId,
        senderId: profileC.id, // Not in Design Team member list!
        senderNickname: 'Charlie Attacker',
        text: 'Injected message from outsider',
        timestamp: Date.now(),
      });

      await new Promise((r) => setTimeout(r, 300));

      const afterCount = storeA.getRoomMessages(privateRoomId).length;
      assert.equal(afterCount, initialCount, 'Unauthorized message from non-member must be dropped');
    });

    // Test 4: Anonymous room creation, nickname collision rejection, and capacity
    let anonRoomId = '';
    await t.test('6. Anonymous room nickname validation and collision prevention', async () => {
      const createRes = await managerA.createAnonymousRoom('Secret Lounge', 2, 'Neon Fox');
      assert.equal(createRes.success, true);
      assert.ok(createRes.roomId);
      anonRoomId = createRes.roomId!;

      // Register anonymous room in managerC's discovery table (simulating Bonjour mDNS discovery)
      (managerC as any).discoveredRooms.set(anonRoomId, {
        id: anonRoomId,
        name: 'Secret Lounge',
        hostId: profileA.id,
        hostAddress: '127.0.0.1',
        hostPort: statusA.port!,
        capacity: 2,
        occupancy: 1,
        isJoinable: true,
        lastSeen: Date.now(),
      });

      // Charlie tries to join with identical nickname "Neon Fox" (collision)
      const collisionJoin = await managerC.joinAnonymousRoom(anonRoomId, 'Neon Fox');
      assert.equal(collisionJoin.success, false);
      assert.ok(collisionJoin.error?.includes('already taken'), 'Must reject nickname collision');

      // Charlie tries to join with invalid nickname
      const invalidNickJoin = await managerC.joinAnonymousRoom(anonRoomId, 'X');
      assert.equal(invalidNickJoin.success, false);
      assert.ok(invalidNickJoin.error?.includes('2-30 characters'));

      // Charlie joins with unique nickname "Quiet Hawk"
      const successfulJoin = await managerC.joinAnonymousRoom(anonRoomId, 'Quiet Hawk');
      assert.equal(successfulJoin.success, true);

      // Verify Charlie's store has the anonymous room with chosen nickname
      const roomC = storeC.getRoom(anonRoomId);
      assert.ok(roomC);
      assert.equal(roomC.myNickname, 'Quiet Hawk');
      assert.equal(roomC.type, 'anonymous');

      // Verify Alice Host's store has Charlie's chosen nickname, not Charlie's real profile name
      const roomA = storeA.getRoom(anonRoomId);
      assert.ok(roomA);
      const charlieMember = roomA.members.find((m) => m.id === profileC.id);
      assert.ok(charlieMember);
      assert.equal(charlieMember.nickname, 'Quiet Hawk');
      assert.notEqual(charlieMember.nickname, profileC.name, 'Real name must not be used');

      // Try to join when room capacity (2) is reached
      (managerB as any).discoveredRooms.set(anonRoomId, {
        id: anonRoomId,
        name: 'Secret Lounge',
        hostId: profileA.id,
        hostAddress: '127.0.0.1',
        hostPort: statusA.port!,
        capacity: 2,
        occupancy: 2,
        isJoinable: true,
        lastSeen: Date.now(),
      });
      const capacityJoin = await managerB.joinAnonymousRoom(anonRoomId, 'Silver Wolf');
      assert.equal(capacityJoin.success, false);
      assert.ok(capacityJoin.error?.includes('capacity'));
    });

    // Test 5: Host departure / room closure behavior
    await t.test('7. Host leaves/closes room - terminates room and deletes history for everyone', async () => {
      // Alice closes the private room
      await managerA.leaveRoom(privateRoomId);

      await new Promise((r) => setTimeout(r, 300));

      // Bob's room should now be deleted from active rooms
      const roomB = storeB.getRoom(privateRoomId);
      assert.equal(roomB, null, 'Room must be deleted on member device');

      // Bob's message history must be cleared
      const historyB = storeB.getRoomMessages(privateRoomId);
      assert.equal(historyB.length, 0, 'History must be deleted');

      // Alice's room and history must also be deleted
      const roomA = storeA.getRoom(privateRoomId);
      assert.equal(roomA, null, 'Room must be deleted on host device');

      // Sending message in closed room must fail gracefully
      const sendClosed = await managerB.sendRoomMessage(privateRoomId, 'Hello after close');
      assert.equal(sendClosed.success, false);
      assert.ok(sendClosed.error?.includes('closed') || sendClosed.error?.includes('exist'));
    });

    // Test 6: Persistence across app restarts (closed room not restored)
    await t.test('8. Closed room is not restored across restarts', () => {
      // Reload storeB from disk
      const reloadedStoreB = new ChatStore(storagePathB);
      const reloadedRooms = reloadedStoreB.getRooms(profileB.id);

      assert.ok(!reloadedRooms.some((r) => r.id === privateRoomId));
      assert.ok(reloadedStoreB.isRoomClosed(privateRoomId));
    });
  } finally {
    await managerA.stop();
    await managerB.stop();
    await managerC.stop();

    try {
      fs.rmSync(path.dirname(storagePathA), { recursive: true, force: true });
      fs.rmSync(path.dirname(storagePathB), { recursive: true, force: true });
      fs.rmSync(path.dirname(storagePathC), { recursive: true, force: true });
    } catch {}
  }
});
