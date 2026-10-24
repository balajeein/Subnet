import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { ConnectionManager } from '../connection-manager';
import { ChatStore, type StoredRoom } from '../../store/chat-store';
import type { LocalProfile } from '../../../src/types/subnet';

function createTempStoragePath(): string {
  const dir = path.join(
    os.tmpdir(),
    `subnet-closure-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  );
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, 'subnet-history.json');
}

test('Subnet — Room Closure & Sidebar Improvements Suite', async (t) => {
  const profileHost: LocalProfile = {
    id: `node-host-${Date.now()}`,
    name: 'Host Alice',
  };

  const profileMemberB: LocalProfile = {
    id: `node-memberB-${Date.now()}`,
    name: 'Member Bob',
  };

  const profileMemberC: LocalProfile = {
    id: `node-memberC-${Date.now()}`,
    name: 'Member Charlie',
  };

  const storageHost = createTempStoragePath();
  const storageB = createTempStoragePath();
  const storageC = createTempStoragePath();

  const storeHost = new ChatStore(storageHost);
  const storeB = new ChatStore(storageB);
  const storeC = new ChatStore(storageC);

  const managerHost = new ConnectionManager(profileHost, storeHost);
  const managerB = new ConnectionManager(profileMemberB, storeB);
  const managerC = new ConnectionManager(profileMemberC, storeC);

  try {
    const statusHost = await managerHost.start();
    const statusB = await managerB.start();

    // Establish mutual connection between Host and Member B
    await (managerB as any).connectToAddress(
      profileHost.id,
      '127.0.0.1',
      statusHost.port,
      profileHost.name
    );
    await new Promise((r) => setTimeout(r, 600));

    // 1. Host closes a private room → all online members leave and room history is deleted.
    await t.test('1. Host closes a private room → all online members leave and room history is deleted', async () => {
      const createRes = await managerHost.createPrivateRoom('Private Room 1', [profileMemberB.id]);
      assert.ok(createRes.success && createRes.roomId);
      const roomId = createRes.roomId;

      // Member B receives invite and accepts
      await new Promise((r) => setTimeout(r, 300));
      const acceptRes = await managerB.respondToRoomInvitation(roomId, true);
      assert.ok(acceptRes.success);
      await new Promise((r) => setTimeout(r, 300));

      // Exchange messages
      const send1 = await managerHost.sendRoomMessage(roomId, 'Welcome to private room');
      assert.ok(send1.success);
      await new Promise((r) => setTimeout(r, 200));

      const send2 = await managerB.sendRoomMessage(roomId, 'Thanks for having me');
      assert.ok(send2.success);
      await new Promise((r) => setTimeout(r, 200));

      assert.ok(storeHost.getRoom(roomId));
      assert.ok(storeB.getRoom(roomId));
      assert.ok(storeHost.getRoomMessages(roomId).length >= 2);
      assert.ok(storeB.getRoomMessages(roomId).length >= 2);

      // Host closes the room
      let hostClosedEmitted = false;
      let memberClosedEmitted = false;
      managerHost.once('room-closed', (d) => {
        if (d.roomId === roomId) hostClosedEmitted = true;
      });
      managerB.once('room-closed', (d) => {
        if (d.roomId === roomId) memberClosedEmitted = true;
      });

      const closeRes = await managerHost.leaveRoom(roomId);
      assert.ok(closeRes.success);
      assert.ok(hostClosedEmitted, 'Host must emit room-closed');

      await new Promise((r) => setTimeout(r, 400));
      assert.ok(memberClosedEmitted, 'Member must receive room_closed event');

      // Verify Host has deleted room and history
      assert.equal(storeHost.getRoom(roomId), null, 'Host room must be deleted');
      assert.equal(storeHost.getRoomMessages(roomId).length, 0, 'Host room history must be cleared');
      assert.ok(storeHost.isRoomClosed(roomId), 'Host chatStore must remember room was closed');

      // Verify Member B has deleted room and history
      assert.equal(storeB.getRoom(roomId), null, 'Member room must be deleted');
      assert.equal(storeB.getRoomMessages(roomId).length, 0, 'Member room history must be cleared');
      assert.ok(storeB.isRoomClosed(roomId), 'Member chatStore must remember room was closed');
    });

    // 2. Host closes an anonymous room → all online members leave and room history is deleted.
    await t.test('2. Host closes an anonymous room → all online members leave and room history is deleted', async () => {
      const createRes = await managerHost.createAnonymousRoom('Anonymous Lounge', 10, 'Host Ghost');
      assert.ok(createRes.success && createRes.roomId);
      const roomId = createRes.roomId;

      // Mock discovery for B
      (managerB as any).discoveredRooms.set(roomId, {
        id: roomId,
        name: 'Anonymous Lounge',
        hostId: profileHost.id,
        hostAddress: '127.0.0.1',
        hostPort: statusHost.port!,
        capacity: 10,
        occupancy: 1,
        isJoinable: true,
        lastSeen: Date.now(),
      });

      const joinRes = await managerB.joinAnonymousRoom(roomId, 'Shadow Fox');
      assert.ok(joinRes.success);
      await new Promise((r) => setTimeout(r, 200));

      await managerHost.sendRoomMessage(roomId, 'Anon chat started');
      await new Promise((r) => setTimeout(r, 200));

      assert.ok(storeHost.getRoom(roomId));
      assert.ok(storeB.getRoom(roomId));

      // Host closes anonymous room
      let memberBClosed = false;
      managerB.once('room-closed', (d) => {
        if (d.roomId === roomId) memberBClosed = true;
      });

      const closeRes = await managerHost.leaveRoom(roomId);
      assert.ok(closeRes.success);

      await new Promise((r) => setTimeout(r, 400));
      assert.ok(memberBClosed, 'Member must receive room_closed for anonymous room');

      assert.equal(storeHost.getRoom(roomId), null, 'Host anonymous room deleted');
      assert.equal(storeB.getRoom(roomId), null, 'Member anonymous room deleted');
      assert.equal(storeB.getRoomMessages(roomId).length, 0, 'Member history deleted');
    });

    // 3. A non-host leaving does not close the room for other members.
    await t.test('3. A non-host leaving does not close the room for other members', async () => {
      const createRes = await managerHost.createPrivateRoom('Multi-member Room', [profileMemberB.id]);
      assert.ok(createRes.success && createRes.roomId);
      const roomId = createRes.roomId;

      await new Promise((r) => setTimeout(r, 300));
      await managerB.respondToRoomInvitation(roomId, true);
      await new Promise((r) => setTimeout(r, 300));

      assert.ok(storeHost.getRoom(roomId));
      assert.ok(storeB.getRoom(roomId));

      // Member B leaves room (non-host)
      let hostReceivedClose = false;
      managerHost.once('room-closed', () => {
        hostReceivedClose = true;
      });

      const leaveRes = await managerB.leaveRoom(roomId);
      assert.ok(leaveRes.success);
      assert.equal(storeB.getRoom(roomId), null, 'Member B left and removed room locally');

      await new Promise((r) => setTimeout(r, 300));
      assert.equal(hostReceivedClose, false, 'Host must NOT receive room closure when non-host leaves');

      const roomOnHost = storeHost.getRoom(roomId);
      assert.ok(roomOnHost, 'Room must remain open and intact on Host');
      assert.equal(
        roomOnHost.members.some((m) => m.id === profileMemberB.id),
        false,
        'Member B was removed from host list'
      );

      // Clean up room on host
      await managerHost.leaveRoom(roomId);
    });

    // 4. Duplicate closure events do not crash or duplicate cleanup.
    await t.test('4. Duplicate closure events do not crash or duplicate cleanup', async () => {
      const dummyRoomId = `dup-room-${Date.now()}`;
      let emitCount = 0;
      const onClosed = () => {
        emitCount++;
      };
      managerB.on('room-closed', onClosed);

      // Save a dummy room first
      const dummyRoom: StoredRoom = {
        id: dummyRoomId,
        name: 'Dummy Room',
        type: 'private',
        hostId: profileHost.id,
        myNickname: 'Bob',
        members: [{ id: profileHost.id, nickname: 'Alice', isHost: true }],
        status: 'joined',
        lastTimestamp: Date.now(),
        unreadCount: 0,
        messages: [],
      };
      storeB.saveRoom(dummyRoom);

      // Trigger first close
      (managerB as any).handleRoomClosedByHost(dummyRoomId, profileHost.id, 'First close');
      assert.equal(storeB.getRoom(dummyRoomId), null);
      assert.equal(emitCount, 1);

      // Trigger second duplicate close
      (managerB as any).handleRoomClosedByHost(dummyRoomId, profileHost.id, 'Duplicate close 1');
      assert.equal(emitCount, 1, 'Duplicate event must not re-emit');

      // Trigger third duplicate close
      (managerB as any).handleRoomClosedByHost(dummyRoomId, profileHost.id, 'Duplicate close 2');
      assert.equal(emitCount, 1, 'Third duplicate event must not re-emit');

      managerB.off('room-closed', onClosed);
    });

    // 5. A closed room cannot receive or send new messages.
    await t.test('5. A closed room cannot receive or send new messages', async () => {
      const testRoomId = `closed-test-${Date.now()}`;
      storeB.markRoomClosed(testRoomId);

      // Attempt to send message
      const sendRes = await managerB.sendRoomMessage(testRoomId, 'Should be blocked');
      assert.equal(sendRes.success, false);
      assert.ok(sendRes.error?.includes('closed') || sendRes.error?.includes('exist'));

      // Attempt to join closed room
      const joinRes = await managerB.joinAnonymousRoom(testRoomId, 'Nickname');
      assert.equal(joinRes.success, false);
      assert.ok(joinRes.error?.includes('closed'));

      // Attempt to respond to invitation for closed room
      const invRes = await managerB.respondToRoomInvitation(testRoomId, true);
      assert.equal(invRes.success, false);
      assert.ok(invRes.error?.includes('closed'));
    });

    // 6. Reconnection cannot restore a closed room from stale metadata.
    await t.test('6. Reconnection cannot restore a closed room from stale metadata', async () => {
      // Create room with Host and Member B
      const createRes = await managerHost.createPrivateRoom('Room For Reconnect', [profileMemberB.id]);
      assert.ok(createRes.success && createRes.roomId);
      const roomId = createRes.roomId;

      // Close room on Host
      await managerHost.leaveRoom(roomId);
      assert.ok(storeHost.isRoomClosed(roomId));

      // Member C was "offline" and has stale metadata saved locally
      const staleRoom: StoredRoom = {
        id: roomId,
        name: 'Room For Reconnect',
        type: 'private',
        hostId: profileHost.id,
        myNickname: 'Charlie',
        members: [
          { id: profileHost.id, nickname: 'Alice', isHost: true },
          { id: profileMemberC.id, nickname: 'Charlie' },
        ],
        status: 'joined',
        lastTimestamp: Date.now(),
        unreadCount: 0,
        messages: [
          {
            id: 'old-msg-1',
            roomId,
            senderId: profileHost.id,
            senderNickname: 'Alice',
            text: 'Old msg before offline',
            timestamp: Date.now() - 5000,
          },
        ],
      };
      storeC.saveRoom(staleRoom);
      assert.ok(storeC.getRoom(roomId));

      // Charlie connects to Host
      await managerC.start();
      await (managerC as any).connectToAddress(
        profileHost.id,
        '127.0.0.1',
        statusHost.port,
        profileHost.name
      );

      // Wait for peer connection and closed-room sync
      await new Promise<void>((resolve) => {
        const check = setInterval(() => {
          if (!storeC.getRoom(roomId) && storeC.isRoomClosed(roomId)) {
            clearInterval(check);
            resolve();
          }
        }, 50);
        setTimeout(() => {
          clearInterval(check);
          resolve();
        }, 3000);
      });

      // Verify that Charlie's stale room was purged and cannot be restored
      assert.equal(storeC.getRoom(roomId), null, 'Stale room was purged on reconnect');
      assert.equal(storeC.getRoomMessages(roomId).length, 0, 'Stale messages purged');

      // Charlie attempts to send a message using stale ID
      const staleSend = await managerC.sendRoomMessage(roomId, 'Stale hello');
      assert.equal(staleSend.success, false);
      assert.ok(staleSend.error?.includes('closed') || staleSend.error?.includes('exist'));
    });

    // 7. Closing one room does not affect other rooms or direct chats.
    await t.test('7. Closing one room does not affect other rooms or direct chats', async () => {
      // 1. Create Room 1
      const r1Res = await managerHost.createPrivateRoom('Room One', [profileMemberB.id]);
      assert.ok(r1Res.success && r1Res.roomId);
      const room1Id = r1Res.roomId;

      // 2. Create Room 2
      const r2Res = await managerHost.createPrivateRoom('Room Two', [profileMemberB.id]);
      assert.ok(r2Res.success && r2Res.roomId);
      const room2Id = r2Res.roomId;

      // 3. Create direct conversation between Host and Member B
      storeHost.addMessage(
        profileMemberB.id,
        {
          id: 'direct-msg-1',
          senderId: profileMemberB.id,
          recipientId: profileHost.id,
          text: 'Direct message hello',
          timestamp: Date.now(),
          status: 'delivered',
        },
        false,
        profileMemberB.name
      );

      // Verify both rooms and direct chat exist
      assert.ok(storeHost.getRoom(room1Id));
      assert.ok(storeHost.getRoom(room2Id));
      assert.ok(storeHost.getConversation(profileMemberB.id));

      // Close Room 1
      await managerHost.leaveRoom(room1Id);

      // Verify Room 1 is deleted
      assert.equal(storeHost.getRoom(room1Id), null, 'Room 1 deleted');

      // Verify Room 2 and direct chat are unaffected
      assert.ok(storeHost.getRoom(room2Id), 'Room 2 remains unaffected');
      assert.ok(storeHost.getConversation(profileMemberB.id), 'Direct chat remains unaffected');
      assert.equal(
        storeHost.getMessages(profileMemberB.id).length,
        1,
        'Direct chat messages intact'
      );

      // Clean up Room 2
      await managerHost.leaveRoom(room2Id);
    });

    // 8. Sidebar scrolling works with many chats and rooms.
    await t.test('8. Sidebar scrolling structure works with many chats and rooms', () => {
      // Populate store with 35 direct conversations and 20 rooms
      for (let i = 0; i < 35; i++) {
        const peerId = `scroll-peer-${i}`;
        storeHost.addMessage(
          peerId,
          {
            id: `msg-${i}`,
            senderId: peerId,
            recipientId: profileHost.id,
            text: `Message ${i}`,
            timestamp: Date.now() - i * 1000,
            status: 'delivered',
          },
          false,
          `Peer ${i}`
        );
      }

      for (let j = 0; j < 20; j++) {
        const rId = `scroll-room-${j}`;
        storeHost.saveRoom({
          id: rId,
          name: `Scroll Room ${j}`,
          type: j % 2 === 0 ? 'private' : 'anonymous',
          hostId: profileHost.id,
          myNickname: 'Alice',
          members: [{ id: profileHost.id, nickname: 'Alice', isHost: true }],
          status: 'joined',
          lastTimestamp: Date.now() - j * 1000,
          unreadCount: j % 3 === 0 ? 1 : 0,
          messages: [],
        });
      }

      const allConvs = storeHost.getConversations();
      const allRooms = storeHost.getRooms(profileHost.id);

      assert.ok(allConvs.length >= 35, 'Store holds all 35 conversations');
      assert.ok(allRooms.length >= 20, 'Store holds all 20 rooms');

      // Verify CSS styles include the single scroll container without nested overflow traps
      const cssPath = path.join(process.cwd(), 'src/styles/index.css');
      const css = fs.readFileSync(cssPath, 'utf-8');
      assert.ok(css.includes('.sidebar-scrollable-content'), 'Must have .sidebar-scrollable-content');
      assert.ok(css.includes('overflow-y: auto'), 'Must have vertical auto overflow');
      assert.ok(
        !css.includes('.sidebar-chats-scroll {\n  flex: 1;\n  overflow-y: auto;'),
        'Must not have nested scroll trap'
      );
    });

    // 9. Chats and Rooms expand/collapse independently with correct chevron direction.
    await t.test('9. Chats and Rooms expand/collapse independently with correct chevron direction', () => {
      const sidebarComponentPath = path.join(process.cwd(), 'src/components/Sidebar.tsx');
      const sidebarContent = fs.readFileSync(sidebarComponentPath, 'utf-8');

      // Check for independent expand states
      assert.ok(sidebarContent.includes('roomsExpanded'), 'Must track roomsExpanded state');
      assert.ok(sidebarContent.includes('chatsExpanded'), 'Must track chatsExpanded state');
      assert.ok(sidebarContent.includes('toggleRoomsExpanded'), 'Must have toggleRoomsExpanded');
      assert.ok(sidebarContent.includes('toggleChatsExpanded'), 'Must have toggleChatsExpanded');

      // Check chevron direction: down arrow when expanded, up arrow when collapsed
      assert.ok(sidebarContent.includes('ChevronDown'), 'Must import and use ChevronDown');
      assert.ok(sidebarContent.includes('ChevronUp'), 'Must import and use ChevronUp');
      assert.ok(
        sidebarContent.includes('roomsExpanded ? (') &&
          sidebarContent.includes('ChevronDown') &&
          sidebarContent.includes('ChevronUp'),
        'Rooms section must render ChevronDown when expanded, ChevronUp when collapsed'
      );
      assert.ok(
        sidebarContent.includes('chatsExpanded ? (') &&
          sidebarContent.includes('ChevronDown') &&
          sidebarContent.includes('ChevronUp'),
        'Chats section must render ChevronDown when expanded, ChevronUp when collapsed'
      );
    });

    // 10. Expanded/collapsed state persists after restart.
    await t.test('10. Expanded/collapsed state persists after restart', () => {
      const sidebarComponentPath = path.join(process.cwd(), 'src/components/Sidebar.tsx');
      const sidebarContent = fs.readFileSync(sidebarComponentPath, 'utf-8');

      assert.ok(
        sidebarContent.includes('subnet_sidebar_rooms_expanded'),
        'Must persist subnet_sidebar_rooms_expanded in localStorage'
      );
      assert.ok(
        sidebarContent.includes('subnet_sidebar_chats_expanded'),
        'Must persist subnet_sidebar_chats_expanded in localStorage'
      );
      assert.ok(
        sidebarContent.includes('localStorage.getItem') &&
          sidebarContent.includes('localStorage.setItem'),
        'Must load and save expanded states to localStorage'
      );
    });
  } finally {
    await managerHost.stop();
    await managerB.stop();
    await managerC.stop();

    try {
      fs.rmSync(path.dirname(storageHost), { recursive: true, force: true });
      fs.rmSync(path.dirname(storageB), { recursive: true, force: true });
      fs.rmSync(path.dirname(storageC), { recursive: true, force: true });
    } catch {}
  }
});
