import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {
  FileTransferManager,
  CHUNK_SIZE,
} from '../transfer-manager';
import {
  validateFileAttachmentMetadata,
  FileChunkPayload,
} from '../protocol';

test('Large-File Transfer & Backpressure Suite', async (suite) => {
  const tmpDir = path.join(os.tmpdir(), `subnet-test-largefile-${Date.now()}`);
  await fs.promises.mkdir(tmpDir, { recursive: true });

  const senderDownloadsDir = path.join(tmpDir, 'sender-downloads');
  const receiverDownloadsDir = path.join(tmpDir, 'receiver-downloads');
  await fs.promises.mkdir(senderDownloadsDir, { recursive: true });
  await fs.promises.mkdir(receiverDownloadsDir, { recursive: true });

  const senderTransfer = new FileTransferManager();
  const receiverTransfer = new FileTransferManager();

  suite.after(async () => {
    try {
      await fs.promises.rm(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  await suite.test('1. Validates metadata for files exceeding 300 MB and up to 100 GB', () => {
    const baseMeta = {
      transferId: 'tr-large-1',
      fileName: 'archive.tar.gz',
      fileSize: 500 * 1024 * 1024, // 500 MB
      mimeType: 'application/gzip',
      sha256: 'a'.repeat(64),
      totalChunks: Math.ceil((500 * 1024 * 1024) / CHUNK_SIZE),
    };

    // 500 MB is valid
    assert.ok(validateFileAttachmentMetadata(baseMeta));

    // 10 GB is valid
    assert.ok(validateFileAttachmentMetadata({ ...baseMeta, fileSize: 10 * 1024 * 1024 * 1024 }));

    // 100 GB is valid
    assert.ok(validateFileAttachmentMetadata({ ...baseMeta, fileSize: 100 * 1024 * 1024 * 1024 }));

    // 101 GB exceeds limit
    assert.equal(validateFileAttachmentMetadata({ ...baseMeta, fileSize: 101 * 1024 * 1024 * 1024 }), undefined);

    // Negative size is rejected
    assert.equal(validateFileAttachmentMetadata({ ...baseMeta, fileSize: -1 }), undefined);
  });

  await suite.test('2. Streams a 320 MB file with backpressure, reconstructs exact bytes and SHA-256', async () => {
    // Generate a 320 MB test file
    const targetFileSize = 320 * 1024 * 1024; // 320 MB (> 300 MB limitation)
    const srcFilePath = path.join(tmpDir, 'source-320mb.bin');

    const srcHash = crypto.createHash('sha256');
    const writeStream = fs.createWriteStream(srcFilePath);

    // Write 1 MB chunks 320 times
    const patternChunk = Buffer.alloc(1024 * 1024);
    for (let i = 0; i < patternChunk.length; i += 4) {
      patternChunk.writeUInt32LE((i * 17) % 0xffffffff, i);
    }

    for (let c = 0; c < 320; c++) {
      srcHash.update(patternChunk);
      const canWrite = writeStream.write(patternChunk);
      if (!canWrite) {
        await new Promise<void>((r) => {
          writeStream.once('drain', () => r());
        });
      }
    }
    await new Promise<void>((resolve, reject) => {
      writeStream.end((err: any) => (err ? reject(err) : resolve()));
    });

    const expectedSha256 = srcHash.digest('hex');

    // Prepare outbound file in sender
    const metadata = await senderTransfer.prepareOutboundFile(srcFilePath);
    assert.equal(metadata.fileSize, targetFileSize);
    assert.equal(metadata.sha256, expectedSha256);
    assert.equal(metadata.totalChunks, Math.ceil(targetFileSize / CHUNK_SIZE)); // 10,240 chunks

    // Prepare inbound receiver transfer
    await receiverTransfer.startInboundDownload(
      metadata,
      'peer-sender',
      receiverDownloadsDir
    );

    let backpressureSimulatedCount = 0;
    let chunksStreamed = 0;
    let transferCompleted = false;
    let finalReceivedPath = '';

    // Stream file chunks through receiver with simulated socket backpressure
    await senderTransfer.streamFileChunks(
      metadata.transferId,
      async (chunkPayload: FileChunkPayload) => {
        chunksStreamed++;

        // Simulate network backpressure every 500 chunks
        if (chunksStreamed % 500 === 0) {
          backpressureSimulatedCount++;
          await new Promise((r) => setTimeout(r, 1));
        }

        const handleRes = await receiverTransfer.handleIncomingChunk(chunkPayload);
        if (!handleRes.success) {
          throw new Error(`Receiver rejected chunk ${chunkPayload.chunkIndex}: ${handleRes.error}`);
        }

        if (handleRes.completed) {
          transferCompleted = true;
          finalReceivedPath = handleRes.finalPath || '';
        }

        return true;
      }
    );

    assert.ok(transferCompleted);
    assert.equal(chunksStreamed, metadata.totalChunks);
    assert.ok(backpressureSimulatedCount > 0);
    assert.ok(finalReceivedPath);
    assert.ok(fs.existsSync(finalReceivedPath));

    // Verify exact byte size
    const destStat = await fs.promises.stat(finalReceivedPath);
    assert.equal(destStat.size, targetFileSize);

    // Verify exact SHA-256 of reconstructed file
    const destHash = crypto.createHash('sha256');
    const readStream = fs.createReadStream(finalReceivedPath);
    for await (const chunk of readStream) {
      destHash.update(chunk);
    }
    const actualSha256 = destHash.digest('hex');
    assert.equal(actualSha256, expectedSha256);
  });

  await suite.test('3. Cleans up incomplete temporary files (.part) upon cancellation', async () => {
    // Create a 5 MB test file
    const srcFilePath = path.join(tmpDir, 'test-cancel.bin');
    await fs.promises.writeFile(srcFilePath, Buffer.alloc(5 * 1024 * 1024, 0x42));

    const metadata = await senderTransfer.prepareOutboundFile(srcFilePath);
    await receiverTransfer.startInboundDownload(
      metadata,
      'peer-sender-2',
      receiverDownloadsDir
    );

    // Send only first 5 chunks
    for (let i = 0; i < 5; i++) {
      await receiverTransfer.handleIncomingChunk({
        type: 'file_chunk',
        transferId: metadata.transferId,
        chunkIndex: i,
        totalChunks: metadata.totalChunks,
        data: Buffer.alloc(CHUNK_SIZE, 0x42).toString('base64'),
        timestamp: Date.now(),
      });
    }

    const activeInbound = receiverTransfer.getInboundTransfer(metadata.transferId);
    assert.ok(activeInbound);
    assert.ok(activeInbound.tempPath);
    assert.ok(fs.existsSync(activeInbound.tempPath)); // .part exists during transfer

    // Cancel the transfer
    receiverTransfer.cancelTransfer(metadata.transferId);

    // Incomplete .part file MUST be cleaned up and deleted
    assert.equal(fs.existsSync(activeInbound.tempPath), false);
  });

  await suite.test('4. Cleans up active peer transfers and .part files when peer disconnects', async () => {
    const srcFilePath = path.join(tmpDir, 'test-peer-disc.bin');
    await fs.promises.writeFile(srcFilePath, Buffer.alloc(1024 * 1024, 0x99));

    const metadata = await senderTransfer.prepareOutboundFile(srcFilePath);
    const peerId = 'peer-disconnect-test';

    await receiverTransfer.startInboundDownload(
      metadata,
      peerId,
      receiverDownloadsDir
    );

    // Write 1 chunk
    await receiverTransfer.handleIncomingChunk({
      type: 'file_chunk',
      transferId: metadata.transferId,
      chunkIndex: 0,
      totalChunks: metadata.totalChunks,
      data: Buffer.alloc(CHUNK_SIZE, 0x99).toString('base64'),
      timestamp: Date.now(),
    });

    const activeInbound = receiverTransfer.getInboundTransfer(metadata.transferId);
    assert.ok(activeInbound);
    const tempPartPath = activeInbound.tempPath;
    assert.ok(fs.existsSync(tempPartPath));

    // Peer disconnects: cancelTransfersForPeer is called
    await receiverTransfer.cancelTransfersForPeer(peerId);

    // Active transfer removed and temporary .part file deleted
    assert.equal(receiverTransfer.getInboundTransfer(metadata.transferId), undefined);
    assert.equal(fs.existsSync(tempPartPath), false);
  });

  await suite.test('5. Verifies saving a file copy preserves exact byte size and SHA-256 checksum', async () => {
    const originalFile = path.join(tmpDir, 'photo-original.jpg');
    const randomContent = crypto.randomBytes(1024 * 512); // 512 KB
    await fs.promises.writeFile(originalFile, randomContent);

    const originalHash = crypto.createHash('sha256').update(randomContent).digest('hex');

    // Simulate saving file as copy via fs.promises.copyFile (same as subnet:save-file-as)
    const destinationCopy = path.join(tmpDir, 'photo-downloaded-copy.jpg');
    await fs.promises.copyFile(originalFile, destinationCopy);

    assert.ok(fs.existsSync(destinationCopy));
    const destStat = await fs.promises.stat(destinationCopy);
    assert.equal(destStat.size, randomContent.length);

    const copyContent = await fs.promises.readFile(destinationCopy);
    const copyHash = crypto.createHash('sha256').update(copyContent).digest('hex');
    assert.equal(copyHash, originalHash);
  });
});
