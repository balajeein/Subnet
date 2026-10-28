import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import test from 'node:test';
import { ChatStore, OutboxEntry } from '../chat-store';

function createTempStoragePath(): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'subnet-outbox-'));
  return path.join(directory, 'history.json');
}

function createEntry(id: string, nextAttemptAt: number): OutboxEntry {
  return {
    id,
    kind: 'direct',
    recipientId: 'peer-b',
    payload: {
      type: 'message',
      messageId: id,
      senderId: 'peer-a',
      recipientId: 'peer-b',
      text: 'queued while offline',
      timestamp: 1,
    },
    attempts: 0,
    nextAttemptAt,
    createdAt: 1,
  };
}

test('outbox survives restart and can be updated or removed', () => {
  const storagePath = createTempStoragePath();

  try {
    const store = new ChatStore(storagePath);
    store.enqueueOutbox(createEntry('message-2', 20));
    store.enqueueOutbox(createEntry('message-1', 10));

    const restarted = new ChatStore(storagePath);
    assert.deepEqual(restarted.getOutbox().map((entry) => entry.id), ['message-1', 'message-2']);
    assert.equal(restarted.updateOutbox('message-1', { attempts: 1, lastError: 'offline' }), true);
    assert.equal(restarted.getOutbox()[0].attempts, 1);
    assert.equal(restarted.getOutbox()[0].lastError, 'offline');
    assert.equal(restarted.removeOutbox('message-1'), true);
    assert.deepEqual(restarted.getOutbox().map((entry) => entry.id), ['message-2']);
  } finally {
    fs.rmSync(path.dirname(storagePath), { recursive: true, force: true });
  }
});

test('deleting a direct conversation removes its queued messages', () => {
  const storagePath = createTempStoragePath();

  try {
    const store = new ChatStore(storagePath);
    store.createOutgoingInvitation('peer-b', 'Peer B', {
      id: 'invitation-1',
      senderId: 'peer-a',
      senderName: 'Peer A',
      recipientId: 'peer-b',
      text: 'hello',
      timestamp: 1,
      status: 'pending',
    });
    store.enqueueOutbox(createEntry('message-1', 10));
    assert.equal(store.deleteConversation('peer-b'), true);
    assert.equal(store.getOutbox().length, 0);
  } finally {
    fs.rmSync(path.dirname(storagePath), { recursive: true, force: true });
  }
});
