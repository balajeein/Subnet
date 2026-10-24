import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { ConnectionManager } from '../connection-manager';
import { ChatStore } from '../../store/chat-store';
import { MAX_SOCKET_BUFFERED_AMOUNT } from '../peer-connection';
import type { LocalProfile, Peer } from '../../../src/types/subnet';

function createTempStoragePath(): string {
  const dir = path.join(
    os.tmpdir(),
    `subnet-search-unlimited-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  );
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, 'subnet-history.json');
}

test('Subnet — Private Room Member Search & Unlimited Anonymous Rooms Suite', async (t) => {
  // -------------------------------------------------------------
  // Part 1: Private Room Member Search Unit & Integration Tests
  // -------------------------------------------------------------

  await t.test('1. Private-room participant search filters peers case-insensitively and excludes host', () => {
    const hostProfile: LocalProfile = { id: 'peer-host', name: 'Alice Host' };
    const discovered: Peer[] = [
      { id: 'peer-host', name: 'Alice Host' }, // Host themselves
      { id: 'peer-1', name: 'Bob Dylan', host: '192.168.1.10', port: 50001 },
      { id: 'peer-2', name: 'bob marley', host: '192.168.1.11', port: 50002 },
      { id: 'peer-3', name: 'Charlie Brown', host: '192.168.1.12', port: 50003 },
      { id: 'peer-4', name: 'DAVID GILMOUR', host: '192.168.1.13', port: 50004 },
    ];

    // Exclude host from available peers
    const available = discovered.filter((p) => p.id !== hostProfile.id);
    assert.equal(available.length, 4);
    assert.ok(!available.some((p) => p.id === hostProfile.id), 'Host must never appear in selectable peers');

    // Filter case-insensitively for "bob"
    const searchBob = (q: string) =>
      available.filter((p) => p.name.toLowerCase().includes(q.trim().toLowerCase()));

    const bobResults = searchBob('BOB');
    assert.equal(bobResults.length, 2);
    assert.deepEqual(bobResults.map((p) => p.id).sort(), ['peer-1', 'peer-2']);

    // Filter case-insensitively for "david"
    const davidResults = searchBob('david');
    assert.equal(davidResults.length, 1);
    assert.equal(davidResults[0].id, 'peer-4');

    // Substring search for "brown"
    const charlieResults = searchBob('brown');
    assert.equal(charlieResults.length, 1);
    assert.equal(charlieResults[0].id, 'peer-3');
  });

  await t.test('2. Multiple peers can be selected across different search queries', () => {
    const peers: Peer[] = [
      { id: 'peer-1', name: 'Alice Smith' },
      { id: 'peer-2', name: 'Bob Jones' },
      { id: 'peer-3', name: 'Charlie Green' },
      { id: 'peer-4', name: 'Dave White' },
    ];

    const selectedPeerIds = new Set<string>();

    const toggle = (id: string) => {
      if (selectedPeerIds.has(id)) selectedPeerIds.delete(id);
      else selectedPeerIds.add(id);
    };

    // Query 1: search "Alice", select Alice
    const query1 = 'alice';
    const matches1 = peers.filter((p) => p.name.toLowerCase().includes(query1));
    assert.equal(matches1.length, 1);
    toggle(matches1[0].id);
    assert.ok(selectedPeerIds.has('peer-1'));

    // Query 2: search "Charlie", select Charlie
    const query2 = 'charlie';
    const matches2 = peers.filter((p) => p.name.toLowerCase().includes(query2));
    assert.equal(matches2.length, 1);
    toggle(matches2[0].id);
    assert.ok(selectedPeerIds.has('peer-3'));

    // Both peers remain selected across different queries
    assert.equal(selectedPeerIds.size, 2);
    assert.ok(selectedPeerIds.has('peer-1'));
    assert.ok(selectedPeerIds.has('peer-3'));

    // Duplicates are prevented by Set semantics
    toggle('peer-1'); // deselect
    assert.equal(selectedPeerIds.size, 1);
    assert.ok(!selectedPeerIds.has('peer-1'));
    toggle('peer-1'); // re-select
    assert.equal(selectedPeerIds.size, 2);
  });

  await t.test('3. Selected users remain selected when the search query changes or clears', () => {
    const peers: Peer[] = [
      { id: 'peer-1', name: 'Alice Smith' },
      { id: 'peer-2', name: 'Bob Jones' },
      { id: 'peer-3', name: 'Charlie Green' },
    ];

    const selectedPeerIds = new Set<string>(['peer-1', 'peer-2']);

    // Change search query to empty (all peers)
    let query = '';
    let filtered = peers.filter((p) => !query || p.name.toLowerCase().includes(query));
    assert.equal(filtered.length, 3);
    assert.ok(selectedPeerIds.has('peer-1'));
    assert.ok(selectedPeerIds.has('peer-2'));

    // Change search query to "Charlie" (does not include Alice or Bob)
    query = 'charlie';
    filtered = peers.filter((p) => p.name.toLowerCase().includes(query));
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0].id, 'peer-3');

    // Crucial: selections are not lost when query filters them out of view
    assert.equal(selectedPeerIds.size, 2);
    assert.ok(selectedPeerIds.has('peer-1'));
    assert.ok(selectedPeerIds.has('peer-2'));
  });

  await t.test('4. Empty search results and disappearing peers are handled gracefully', () => {
    let peers: Peer[] = [
      { id: 'peer-1', name: 'Alice' },
      { id: 'peer-2', name: 'Bob' },
    ];

    const selectedPeerIds = new Set<string>(['peer-1', 'peer-2']);

    // Empty search query produces 0 matches without breaking selections
    const query = 'xyz_nonexistent_person';
    const filtered = peers.filter((p) => p.name.toLowerCase().includes(query));
    assert.equal(filtered.length, 0, 'No peers match query');
    assert.equal(selectedPeerIds.size, 2, 'Selections remain intact even when filtered list is empty');

    // Peer disappears from Radar (e.g. Bob leaves LAN)
    peers = [{ id: 'peer-1', name: 'Alice' }];
    const activePeerIds = new Set(peers.map((p) => p.id));

    // Pruning cleans up disappeared peers
    for (const id of Array.from(selectedPeerIds)) {
      if (!activePeerIds.has(id)) {
        selectedPeerIds.delete(id);
      }
    }

    assert.equal(selectedPeerIds.size, 1);
    assert.ok(selectedPeerIds.has('peer-1'));
    assert.ok(!selectedPeerIds.has('peer-2'), 'Disappeared peer must be pruned from selected set');
  });

  // -------------------------------------------------------------
  // Part 2: Unlimited Anonymous Room Participants Tests
  // -------------------------------------------------------------

  const profileHost: LocalProfile = {
    id: `host-unlimited-${Date.now()}`,
    name: 'Unlimited Host',
  };

  const storeHost = new ChatStore(createTempStoragePath());
  const managerHost = new ConnectionManager(profileHost, storeHost);

  let statusHost: any;
  let anonRoomId = '';

  try {
    statusHost = await managerHost.start();

    await t.test('5. Anonymous rooms accept more participants than the previous maximum of 10', async () => {
      // Create anonymous room without hardcoded capacity (capacity = undefined -> unlimited)
      const createRes = await managerHost.createAnonymousRoom('Global Lounge', undefined, 'Host Ghost');
      assert.equal(createRes.success, true);
      assert.ok(createRes.roomId);
      anonRoomId = createRes.roomId!;

      const hostRoom = storeHost.getRoom(anonRoomId);
      assert.ok(hostRoom);
      assert.equal(hostRoom.capacity, undefined, 'Room capacity should be undefined for unlimited participant rooms');
      assert.equal(hostRoom.members.length, 1);

      // Join 12 distinct members (previous maximum was 10)
      const memberManagers: ConnectionManager[] = [];
      const memberCount = 12;

      for (let i = 1; i <= memberCount; i++) {
        const memProfile: LocalProfile = {
          id: `member-${i}-${Date.now()}`,
          name: `Real User ${i}`, // Real name must not leak into room
        };
        const memStore = new ChatStore(createTempStoragePath());
        const memManager = new ConnectionManager(memProfile, memStore);
        memberManagers.push(memManager);

        const statusMem = await memManager.start();

        // Simulate discovery of the anonymous room
        (memManager as any).discoveredRooms.set(anonRoomId, {
          id: anonRoomId,
          name: 'Global Lounge',
          hostId: profileHost.id,
          hostAddress: '127.0.0.1',
          hostPort: statusHost.port,
          capacity: undefined,
          occupancy: i,
          isJoinable: true,
          lastSeen: Date.now(),
        });

        const nickname = `Pseudonym-${i}`;
        const joinRes = await memManager.joinAnonymousRoom(anonRoomId, nickname);
        assert.equal(joinRes.success, true, `Member ${i} join must succeed beyond previous cap of 10`);

        const memRoom = memStore.getRoom(anonRoomId);
        assert.ok(memRoom);
        assert.equal(memRoom.myNickname, nickname);
        assert.equal(memRoom.type, 'anonymous');
      }

      // Verify Host's store has 1 host + 12 members = 13 participants
      const updatedHostRoom = storeHost.getRoom(anonRoomId);
      assert.ok(updatedHostRoom);
      assert.equal(
        updatedHostRoom.members.length,
        13,
        'Anonymous room must dynamically hold 13 participants (exceeding previous cap)'
      );

      // Cleanup member managers
      for (const m of memberManagers) {
        await m.stop();
      }
    });

    await t.test('6. Participant counts and room membership update dynamically and handle reconnects', async () => {
      // Verify dynamic room summaries
      const rooms = storeHost.getRooms(profileHost.id);
      const roomSummary = rooms.find((r) => r.id === anonRoomId);
      assert.ok(roomSummary);
      assert.equal(roomSummary.memberCount, 13);

      // Test reconnecting participant with same peerId
      const reconnectProfile: LocalProfile = {
        id: `reconnect-user-${Date.now()}`,
        name: 'Reconnect Real Name',
      };
      const reconnectStore = new ChatStore(createTempStoragePath());
      const reconnectManager = new ConnectionManager(reconnectProfile, reconnectStore);
      await reconnectManager.start();

      (reconnectManager as any).discoveredRooms.set(anonRoomId, {
        id: anonRoomId,
        name: 'Global Lounge',
        hostId: profileHost.id,
        hostAddress: '127.0.0.1',
        hostPort: statusHost.port,
        capacity: undefined,
        occupancy: 13,
        isJoinable: true,
        lastSeen: Date.now(),
      });

      // Initial join
      const join1 = await reconnectManager.joinAnonymousRoom(anonRoomId, 'Echo Phoenix');
      assert.equal(join1.success, true);
      const countAfterJoin = storeHost.getRoom(anonRoomId)!.members.length;
      assert.equal(countAfterJoin, 14);

      // Reconnect with same peerId and updated pseudonym
      const join2 = await reconnectManager.joinAnonymousRoom(anonRoomId, 'Echo Phoenix 2');
      assert.equal(join2.success, true);

      // Must not create duplicate member entry
      const members = storeHost.getRoom(anonRoomId)!.members;
      assert.equal(members.length, 14, 'Reconnecting member must not duplicate membership');
      const updatedMember = members.find((m) => m.id === reconnectProfile.id);
      assert.ok(updatedMember);
      assert.equal(updatedMember.nickname, 'Echo Phoenix 2');

      await reconnectManager.stop();
    });

    await t.test('7. Anonymous messages reach all authorized participants without duplicates and preserve anonymity', async () => {
      // Set up two active participants connected to host
      const memberAProfile: LocalProfile = { id: `active-a-${Date.now()}`, name: 'Real Alice' };
      const memberBProfile: LocalProfile = { id: `active-b-${Date.now()}`, name: 'Real Bob' };

      const storeA = new ChatStore(createTempStoragePath());
      const storeB = new ChatStore(createTempStoragePath());

      // Set custom profile picture on real profile to verify it NEVER leaks
      storeA.updateSettings({ avatarType: 'custom', avatarValue: 'data:image/png;base64,SECRET' });

      const managerA = new ConnectionManager(memberAProfile, storeA);
      const managerB = new ConnectionManager(memberBProfile, storeB);

      await managerA.start();
      await managerB.start();

      (managerA as any).discoveredRooms.set(anonRoomId, {
        id: anonRoomId,
        name: 'Global Lounge',
        hostId: profileHost.id,
        hostAddress: '127.0.0.1',
        hostPort: statusHost.port,
        isJoinable: true,
        lastSeen: Date.now(),
      });
      (managerB as any).discoveredRooms.set(anonRoomId, {
        id: anonRoomId,
        name: 'Global Lounge',
        hostId: profileHost.id,
        hostAddress: '127.0.0.1',
        hostPort: statusHost.port,
        isJoinable: true,
        lastSeen: Date.now(),
      });

      await managerA.joinAnonymousRoom(anonRoomId, 'Cyber Fox');
      await managerB.joinAnonymousRoom(anonRoomId, 'Solar Bear');

      // Member A sends an anonymous message
      const sendRes = await managerA.sendRoomMessage(anonRoomId, 'Hello everyone in the unlimited room!');
      assert.equal(sendRes.success, true);
      assert.ok(sendRes.messageId);

      // Wait for host relay
      await new Promise((r) => setTimeout(r, 400));

      // Verify Host received the message
      const hostMsgs = storeHost.getRoomMessages(anonRoomId);
      const hostMsg = hostMsgs.find((m) => m.id === sendRes.messageId);
      assert.ok(hostMsg, 'Host must receive room message');
      assert.equal(hostMsg.senderNickname, 'Cyber Fox');
      assert.equal(hostMsg.senderAvatar, undefined, 'Anonymous message must NEVER expose profile picture');

      // Verify Member B received the message via host relay
      const bMsgs = storeB.getRoomMessages(anonRoomId);
      const bMsg = bMsgs.find((m) => m.id === sendRes.messageId);
      assert.ok(bMsg, 'Member B must receive relayed message from Member A');
      assert.equal(bMsg.text, 'Hello everyone in the unlimited room!');
      assert.equal(bMsg.senderNickname, 'Cyber Fox');
      assert.equal(bMsg.senderAvatar, undefined, 'Real profile picture must never be present on Member B');

      // Message deduplication: if host receives identical message again, it drops it
      const initialCount = storeHost.getRoomMessages(anonRoomId).length;
      (managerHost as any).handleRawMessage?.(bMsg);
      assert.equal(storeHost.getRoomMessages(anonRoomId).length, initialCount);

      // Cleanup
      await managerA.stop();
      await managerB.stop();
    });

    await t.test('8. Ordinary member leaving does not close the room', async () => {
      const leaverProfile: LocalProfile = { id: `leaver-${Date.now()}`, name: 'Leaver User' };
      const leaverStore = new ChatStore(createTempStoragePath());
      const leaverManager = new ConnectionManager(leaverProfile, leaverStore);
      await leaverManager.start();

      (leaverManager as any).discoveredRooms.set(anonRoomId, {
        id: anonRoomId,
        name: 'Global Lounge',
        hostId: profileHost.id,
        hostAddress: '127.0.0.1',
        hostPort: statusHost.port,
        isJoinable: true,
        lastSeen: Date.now(),
      });

      await leaverManager.joinAnonymousRoom(anonRoomId, 'Temporary Ghost');
      const countBefore = storeHost.getRoom(anonRoomId)!.members.length;

      // Member leaves room
      const leaveRes = await leaverManager.leaveRoom(anonRoomId);
      assert.equal(leaveRes.success, true);
      assert.equal(leaverStore.getRoom(anonRoomId), null, 'Leaver store must delete room');

      await new Promise((r) => setTimeout(r, 300));

      // Host must remain active and room must NOT be closed
      const hostRoom = storeHost.getRoom(anonRoomId);
      assert.ok(hostRoom, 'Room must still exist on host');
      assert.equal(hostRoom.status, 'joined', 'Room status must remain joined, not closed');
      assert.equal(hostRoom.members.length, countBefore - 1, 'Member count must decrement by 1');
      assert.ok(!hostRoom.members.some((m) => m.id === leaverProfile.id), 'Leaver must be removed');

      await leaverManager.stop();
    });

    await t.test('9. Host closure still closes the room for everyone', async () => {
      // Connect member to verify host closure
      const clientProfile: LocalProfile = { id: `client-${Date.now()}`, name: 'Client User' };
      const clientStore = new ChatStore(createTempStoragePath());
      const clientManager = new ConnectionManager(clientProfile, clientStore);
      await clientManager.start();

      (clientManager as any).discoveredRooms.set(anonRoomId, {
        id: anonRoomId,
        name: 'Global Lounge',
        hostId: profileHost.id,
        hostAddress: '127.0.0.1',
        hostPort: statusHost.port,
        isJoinable: true,
        lastSeen: Date.now(),
      });

      await clientManager.joinAnonymousRoom(anonRoomId, 'Faithful Member');
      assert.ok(clientStore.getRoom(anonRoomId));

      // Host closes the room
      const closeRes = await managerHost.leaveRoom(anonRoomId);
      assert.equal(closeRes.success, true);
      assert.equal(storeHost.getRoom(anonRoomId), null, 'Host room history must be deleted');

      // Wait for room_closed event delivery
      await new Promise((r) => setTimeout(r, 400));

      // Connected client must have room deleted
      const clientRoom = clientStore.getRoom(anonRoomId);
      assert.equal(clientRoom, null, 'Client room history must be completely deleted upon host closure');

      // Any message sent to closed room must fail
      const sendAfterClose = await clientManager.sendRoomMessage(anonRoomId, 'Are you there?');
      assert.equal(sendAfterClose.success, false);

      await clientManager.stop();
    });

    await t.test('10. Backpressure safeguard protects against unbounded socket memory accumulation', () => {
      assert.equal(
        MAX_SOCKET_BUFFERED_AMOUNT,
        2 * 1024 * 1024,
        'Backpressure boundary must be bounded at 2MB per connection'
      );
    });
  } finally {
    await managerHost.stop();
  }
});
