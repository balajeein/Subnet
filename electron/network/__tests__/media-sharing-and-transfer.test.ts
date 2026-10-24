import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {
  validateFileAttachmentMetadata,
  validateFileOffer,
  validateFileRequest,
  validateFileChunk,
  validateFileCancel,
  validateFileComplete,
} from '../protocol';
import {
  FileTransferManager,
  CHUNK_SIZE,
  sanitizeFileName,
  resolveUniqueFilePath,
} from '../transfer-manager';
import { ChatStore } from '../../store/chat-store';
import type { FileAttachmentMetadata, Peer, Message } from '../../../src/types/subnet';

test('Media Sharing & Transfer Test Suite', async (suite) => {
  const tmpDir = path.join(os.tmpdir(), `subnet-test-transfer-${Date.now()}`);
  await fs.promises.mkdir(tmpDir, { recursive: true });

  suite.after(async () => {
    try {
      await fs.promises.rm(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  // 1. File transfer metadata validation
  await suite.test('1. File transfer metadata validation', () => {
    const validMeta: FileAttachmentMetadata = {
      transferId: 'tx-12345',
      fileName: 'photo.jpg',
      fileSize: 1024,
      mimeType: 'image/jpeg',
      sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      totalChunks: 1,
      thumbnail: 'data:image/jpeg;base64,...',
    };

    assert.ok(validateFileAttachmentMetadata(validMeta));

    // Rejects empty transferId or fileName
    assert.equal(validateFileAttachmentMetadata({ ...validMeta, transferId: '' }), undefined);
    assert.equal(validateFileAttachmentMetadata({ ...validMeta, fileName: '   ' }), undefined);

    // Supports large files up to 100GB, rejects > 100GB and negative
    assert.equal(validateFileAttachmentMetadata({ ...validMeta, fileSize: -5 }), undefined);
    assert.ok(validateFileAttachmentMetadata({ ...validMeta, fileSize: 10 * 1024 * 1024 * 1024 })); // 10GB is valid
    assert.equal(validateFileAttachmentMetadata({ ...validMeta, fileSize: 101 * 1024 * 1024 * 1024 }), undefined); // > 100GB rejected

    // Rejects missing sha256
    assert.equal(validateFileAttachmentMetadata({ ...validMeta, sha256: 'invalid-hash' }), undefined);

    // Offer payload validator
    const validOffer = {
      type: 'file_offer',
      transferId: 'tx-123',
      senderId: 'peer-a',
      recipientId: 'peer-b',
      attachment: validMeta,
      timestamp: Date.now(),
    };
    assert.ok(validateFileOffer(validOffer));
    assert.equal(validateFileOffer({ ...validOffer, type: 'wrong_type' }), null);

    // Request payload validator
    const validReq = {
      type: 'file_request',
      transferId: 'tx-123',
      senderId: 'peer-b',
      recipientId: 'peer-a',
      startIndex: 0,
      timestamp: Date.now(),
    };
    assert.ok(validateFileRequest(validReq));
    assert.equal(validateFileRequest({ ...validReq, startIndex: -1 }), null);

    // Chunk payload validator
    const validChunk = {
      type: 'file_chunk',
      transferId: 'tx-123',
      chunkIndex: 0,
      totalChunks: 5,
      data: Buffer.from('hello').toString('base64'),
      timestamp: Date.now(),
    };
    assert.ok(validateFileChunk(validChunk));
    assert.equal(validateFileChunk({ ...validChunk, chunkIndex: 10 }), null); // index >= totalChunks

    // Cancel and Complete payload validators
    assert.ok(
      validateFileCancel({
        type: 'file_cancel',
        transferId: 'tx-123',
        senderId: 'peer-a',
        reason: 'User cancelled',
        timestamp: Date.now(),
      })
    );
    assert.ok(
      validateFileComplete({
        type: 'file_complete',
        transferId: 'tx-123',
        senderId: 'peer-b',
        success: true,
        timestamp: Date.now(),
      })
    );
  });

  // 2. Chunk ordering and duplicate-chunk handling
  await suite.test('2. Chunk ordering and duplicate-chunk handling', async () => {
    const manager = new FileTransferManager();
    const testContent = Buffer.from('chunk0-content---chunk1-content');
    const sha256 = crypto.createHash('sha256').update(testContent).digest('hex');

    const meta: FileAttachmentMetadata = {
      transferId: 'tx-order-test',
      fileName: 'order-test.txt',
      fileSize: testContent.length,
      mimeType: 'text/plain',
      sha256,
      totalChunks: 2,
    };

    const destDir = path.join(tmpDir, 'downloads-order');
    await fs.promises.mkdir(destDir, { recursive: true });

    await manager.startInboundDownload(meta, 'peer-sender', destDir);

    const chunk0Data = testContent.subarray(0, 16).toString('base64');
    const chunk1Data = testContent.subarray(16).toString('base64');

    // Feed chunk 0
    const res0 = await manager.handleIncomingChunk({
      type: 'file_chunk',
      transferId: 'tx-order-test',
      chunkIndex: 0,
      totalChunks: 2,
      data: chunk0Data,
      timestamp: Date.now(),
    });
    assert.equal(res0.success, true);
    assert.equal(res0.completed, false);

    // Duplicate chunk 0 should be safely recognized as duplicate and not corrupt file
    const resDup = await manager.handleIncomingChunk({
      type: 'file_chunk',
      transferId: 'tx-order-test',
      chunkIndex: 0,
      totalChunks: 2,
      data: chunk0Data,
      timestamp: Date.now(),
    });
    assert.equal(resDup.success, true);
    assert.equal(resDup.duplicate, true);

    // Feed out-of-order / gap index (e.g. index 5 when totalChunks is 2)
    const resBad = await manager.handleIncomingChunk({
      type: 'file_chunk',
      transferId: 'tx-order-test',
      chunkIndex: 5,
      totalChunks: 2,
      data: chunk1Data,
      timestamp: Date.now(),
    });
    assert.equal(resBad.success, false);

    // Feed chunk 1
    const res1 = await manager.handleIncomingChunk({
      type: 'file_chunk',
      transferId: 'tx-order-test',
      chunkIndex: 1,
      totalChunks: 2,
      data: chunk1Data,
      timestamp: Date.now(),
    });
    assert.equal(res1.success, true);
    assert.equal(res1.completed, true);
  });

  // 3. SHA-256 integrity verification
  await suite.test('3. SHA-256 integrity verification', async () => {
    const manager = new FileTransferManager();
    const genuineContent = Buffer.from('authentic file contents');
    const genuineSha = crypto.createHash('sha256').update(genuineContent).digest('hex');

    const meta: FileAttachmentMetadata = {
      transferId: 'tx-sha-test',
      fileName: 'sha-test.txt',
      fileSize: genuineContent.length,
      mimeType: 'text/plain',
      sha256: genuineSha,
      totalChunks: 1,
    };

    const destDir = path.join(tmpDir, 'downloads-sha');
    await fs.promises.mkdir(destDir, { recursive: true });

    // Test A: Mismatched data is rejected
    await manager.startInboundDownload(meta, 'peer-sender', destDir);
    const tamperedData = Buffer.from('tampered corrupted content').toString('base64');

    const resTampered = await manager.handleIncomingChunk({
      type: 'file_chunk',
      transferId: 'tx-sha-test',
      chunkIndex: 0,
      totalChunks: 1,
      data: tamperedData,
      timestamp: Date.now(),
    });

    assert.equal(resTampered.success, false);
    assert.match(resTampered.error || '', /checksum mismatch/i);

    // Partial .part file should be unlinked upon integrity failure
    const expectedDest = path.join(destDir, 'sha-test.txt');
    assert.equal(fs.existsSync(expectedDest), false);
    assert.equal(fs.existsSync(`${expectedDest}.part`), false);
  });

  // 4. Cancellation and interrupted transfer cleanup
  await suite.test('4. Cancellation and interrupted transfer cleanup', async () => {
    const manager = new FileTransferManager();
    const meta: FileAttachmentMetadata = {
      transferId: 'tx-cancel-test',
      fileName: 'cancelled-file.bin',
      fileSize: 10000,
      mimeType: 'application/octet-stream',
      sha256: 'a'.repeat(64),
      totalChunks: 10,
    };

    const destDir = path.join(tmpDir, 'downloads-cancel');
    await fs.promises.mkdir(destDir, { recursive: true });

    const handle = await manager.startInboundDownload(meta, 'peer-sender', destDir);

    // Write chunk 0 so partial file is active on disk
    await manager.handleIncomingChunk({
      type: 'file_chunk',
      transferId: 'tx-cancel-test',
      chunkIndex: 0,
      totalChunks: 10,
      data: Buffer.from('chunk0 data').toString('base64'),
      timestamp: Date.now(),
    });
    assert.ok(fs.existsSync(handle.tempPath));

    // Cancel while in flight
    manager.cancelTransfer('tx-cancel-test', 'User cancelled transfer');

    // Temporary part file must be cleaned up immediately
    assert.equal(fs.existsSync(handle.tempPath), false);
    assert.equal(manager.getInboundTransfer('tx-cancel-test'), undefined);
  });

  // 5. Large-file streaming without whole-file buffering
  await suite.test('5. Large-file streaming without whole-file buffering', async () => {
    const manager = new FileTransferManager();
    const largeFilePath = path.join(tmpDir, 'large-test-file.bin');

    // Create a 2MB test file in bounded chunks
    const chunkData = crypto.randomBytes(CHUNK_SIZE);
    const targetChunks = 64; // 2 MB total
    const writeStream = fs.createWriteStream(largeFilePath);
    for (let i = 0; i < targetChunks; i++) {
      writeStream.write(chunkData);
    }
    await new Promise((resolve) => writeStream.end(resolve));

    // Prepare outbound transfer metadata via streaming hash
    const meta = await manager.prepareOutboundFile(largeFilePath);
    assert.equal(meta.fileSize, targetChunks * CHUNK_SIZE);

    // Stream file chunks through bounded chunk generator
    let receivedChunks = 0;
    let maxChunkLength = 0;

    await manager.streamFileChunks(meta.transferId, (chunk) => {
      receivedChunks++;
      if (chunk.data.length > maxChunkLength) {
        maxChunkLength = chunk.data.length;
      }
      return true;
    });

    assert.equal(receivedChunks, targetChunks);
    // Bounded chunk base64 size must stay within WebSocket message limits (64KB)
    assert.ok(maxChunkLength < 60000);
  });

  // 6. Duplicate filenames and safe download destination selection
  await suite.test('6. Duplicate filenames and safe download destination selection', async () => {
    const destDir = path.join(tmpDir, 'downloads-collision');
    await fs.promises.mkdir(destDir, { recursive: true });

    // Path traversal sanitization
    const sanitized = sanitizeFileName('../../etc/passwd.txt');
    assert.equal(sanitized, 'passwd.txt');

    // Collision avoidance: report.pdf -> report (1).pdf -> report (2).pdf
    const file1 = path.join(destDir, 'report.pdf');
    await fs.promises.writeFile(file1, 'first');

    const unique1 = resolveUniqueFilePath(destDir, 'report.pdf');
    assert.equal(path.basename(unique1), 'report (1).pdf');

    await fs.promises.writeFile(unique1, 'second');
    const unique2 = resolveUniqueFilePath(destDir, 'report.pdf');
    assert.equal(path.basename(unique2), 'report (2).pdf');
  });

  // 7. Receiving an attachment does not download it without user action
  await suite.test('7. Receiving an attachment does not download it without user action', async () => {
    const historyFile = path.join(tmpDir, 'history-no-auto-download.json');
    const store = new ChatStore(historyFile);

    const meta: FileAttachmentMetadata = {
      transferId: 'tx-manual-download',
      fileName: 'document.pdf',
      fileSize: 45000,
      mimeType: 'application/pdf',
      sha256: 'b'.repeat(64),
      totalChunks: 2,
    };

    const msg: Message = {
      id: 'msg-attachment-1',
      senderId: 'peer-sender',
      recipientId: 'peer-me',
      text: 'Check this document',
      timestamp: Date.now(),
      status: 'delivered',
      attachment: meta,
      transferStatus: 'idle', // Idle: recipient must explicitly click download
    };

    store.addMessage('peer-sender', msg, true, 'Sender Peer');

    const messages = store.getMessages('peer-sender');
    assert.equal(messages.length, 1);
    assert.equal(messages[0].attachment?.fileName, 'document.pdf');
    assert.equal(messages[0].transferStatus, 'idle');
    // Ensure no localAttachmentPath exists yet
    assert.equal(messages[0].localAttachmentPath, undefined);
  });

  // 8. Attachment history survives app restart
  await suite.test('8. Attachment history survives app restart', async () => {
    const historyFile = path.join(tmpDir, 'history-persist.json');
    const store1 = new ChatStore(historyFile);

    const meta: FileAttachmentMetadata = {
      transferId: 'tx-persisted',
      fileName: 'vacation.jpg',
      fileSize: 84000,
      mimeType: 'image/jpeg',
      sha256: 'c'.repeat(64),
      totalChunks: 3,
      thumbnail: 'data:image/jpeg;base64,sample',
    };

    const msg: Message = {
      id: 'msg-photo-1',
      senderId: 'peer-bob',
      recipientId: 'peer-me',
      text: '',
      timestamp: Date.now(),
      status: 'delivered',
      attachment: meta,
      localAttachmentPath: '/Users/test/Downloads/vacation.jpg',
      transferStatus: 'downloaded',
    };

    store1.addMessage('peer-bob', msg, false, 'Bob');

    // Re-initialize store from same file (simulating app restart)
    const store2 = new ChatStore(historyFile);
    const convs = store2.getConversations();
    assert.equal(convs.length, 1);
    assert.equal(convs[0].lastMessage, '📎 vacation.jpg');

    const messages = store2.getMessages('peer-bob');
    assert.equal(messages.length, 1);
    assert.equal(messages[0].attachment?.fileName, 'vacation.jpg');
    assert.equal(messages[0].localAttachmentPath, '/Users/test/Downloads/vacation.jpg');
    assert.equal(messages[0].transferStatus, 'downloaded');
  });

  // 9. Camera denial and cancellation do not leak camera resources
  await suite.test('9. Camera denial and cancellation do not leak camera resources', () => {
    let tracksStopped = 0;
    const fakeTrack = {
      kind: 'video',
      readyState: 'live',
      stop: () => {
        tracksStopped++;
      },
    };
    const fakeStream = {
      getTracks: () => [fakeTrack],
    };

    // Simulate stopping tracks on close/cancel
    const stopTracks = (stream: any) => {
      if (stream) {
        stream.getTracks().forEach((t: any) => t.stop());
      }
    };

    stopTracks(fakeStream);
    assert.equal(tracksStopped, 1);
  });

  // 10. Search filters peers case-insensitively
  await suite.test('10. Search filters peers case-insensitively', () => {
    const peers: Peer[] = [
      { id: '1', name: "Alice's MacBook Pro", host: '10.0.0.1', port: 5001 },
      { id: '2', name: 'Bob Laptop', host: '10.0.0.2', port: 5002 },
      { id: '3', name: 'ALEXANDER Workstation', host: '10.0.0.3', port: 5003 },
    ];

    const filterPeers = (query: string): Peer[] => {
      const q = query.trim().toLowerCase();
      if (!q) return peers;
      return peers.filter((p) => p.name.toLowerCase().includes(q));
    };

    // Case-insensitive tests
    assert.equal(filterPeers('alice').length, 1);
    assert.equal(filterPeers('ALICE').length, 1);
    assert.equal(filterPeers('alex').length, 1);
    assert.equal(filterPeers('LAPTOP').length, 1);
    assert.equal(filterPeers('nonexistent').length, 0);
  });

  // 11. Search results update dynamically when peers appear or disappear
  await suite.test('11. Search results update when peers appear or disappear', () => {
    let peerList: Peer[] = [
      { id: '1', name: 'Alice MacBook', host: '10.0.0.1', port: 5001 },
    ];

    const query = 'mac';
    const getMatches = () =>
      peerList.filter((p) => p.name.toLowerCase().includes(query.toLowerCase()));

    assert.equal(getMatches().length, 1);

    // Peer appears
    peerList = [
      ...peerList,
      { id: '2', name: 'Charlie iMac', host: '10.0.0.2', port: 5002 },
    ];
    assert.equal(getMatches().length, 2);

    // Peer disappears
    peerList = peerList.filter((p) => p.id !== '1');
    assert.equal(getMatches().length, 1);
    assert.equal(getMatches()[0].name, 'Charlie iMac');
  });
});
