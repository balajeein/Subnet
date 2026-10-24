import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { EventEmitter } from 'events';
import {
  FileAttachmentMetadata,
  FileChunkPayload,
  validateFileAttachmentMetadata,
  validateFileChunk,
} from './protocol';

export const CHUNK_SIZE = 32 * 1024; // 32 KB bounded chunks
export const MAX_FILE_SIZE = 100 * 1024 * 1024 * 1024; // 100 GB safety limit, bounded by disk space and capacity

export interface OutboundTransfer {
  transferId: string;
  filePath: string;
  metadata: FileAttachmentMetadata;
  recipientPeerId?: string;
  roomId?: string;
  isStreaming: boolean;
  isCancelled: boolean;
  transferredBytes: number;
  lastProgressTime?: number;
}

export interface InboundTransfer {
  transferId: string;
  metadata: FileAttachmentMetadata;
  senderPeerId: string;
  finalPath: string;
  tempPath: string;
  writeStream: fs.WriteStream | null;
  hasher: crypto.Hash;
  receivedChunks: Set<number>;
  nextExpectedIndex: number;
  transferredBytes: number;
  isCancelled: boolean;
  isCompleted: boolean;
  lastProgressTime?: number;
}

export interface TransferProgressEvent {
  transferId: string;
  role: 'sender' | 'receiver';
  transferredBytes: number;
  totalBytes: number;
  percent: number;
  status: 'pending' | 'transferring' | 'completed' | 'cancelled' | 'failed';
  error?: string;
  localPath?: string;
}

export function sanitizeFileName(rawName: string): string {
  const base = path.basename(rawName).replace(/[\u0000-\u001f\u007f-\u009f/\\:*?"<>|]/g, '_').trim();
  return base || 'downloaded_file';
}

export function resolveUniqueFilePath(destinationDir: string, safeFileName: string): string {
  fs.mkdirSync(destinationDir, { recursive: true });

  let candidate = path.join(destinationDir, safeFileName);
  if (!fs.existsSync(candidate)) {
    return candidate;
  }

  const ext = path.extname(safeFileName);
  const nameWithoutExt = path.basename(safeFileName, ext);
  let counter = 1;

  while (fs.existsSync(candidate)) {
    candidate = path.join(destinationDir, `${nameWithoutExt} (${counter})${ext}`);
    counter++;
  }

  return candidate;
}

export class FileTransferManager extends EventEmitter {
  private outboundTransfers: Map<string, OutboundTransfer> = new Map();
  private inboundTransfers: Map<string, InboundTransfer> = new Map();
  private customDownloadsDir?: string;

  constructor(customDownloadsDir?: string) {
    super();
    this.customDownloadsDir = customDownloadsDir;
  }

  public getDownloadsDir(): string {
    if (this.customDownloadsDir) {
      return this.customDownloadsDir;
    }
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const electron = require('electron');
      const app = electron.app || electron.remote?.app;
      if (app && typeof app.getPath === 'function') {
        return app.getPath('downloads');
      }
    } catch {}
    return path.join(os.homedir(), 'Downloads');
  }

  public sanitizeFileName(rawName: string): string {
    return sanitizeFileName(rawName);
  }

  public resolveUniqueFilePath(destinationDir: string, safeFileName: string): string {
    return resolveUniqueFilePath(destinationDir, safeFileName);
  }

  /**
   * Prepares an outbound file for transfer by calculating SHA-256 and thumbnail.
   * Uses streaming so large files are not loaded entirely into memory.
   */
  public async prepareOutboundFile(filePath: string): Promise<FileAttachmentMetadata> {
    const stats = await fs.promises.stat(filePath);
    if (!stats.isFile()) {
      throw new Error('Target is not a regular file');
    }
    if (stats.size > MAX_FILE_SIZE) {
      throw new Error(`File size exceeds safe limit of ${MAX_FILE_SIZE / (1024 * 1024 * 1024)}GB`);
    }

    const fileName = path.basename(filePath);
    const mimeType = this.detectMimeType(filePath);

    // Calculate SHA-256 checksum via stream
    const sha256 = await this.computeFileSha256(filePath);

    // Generate thumbnail if image
    let thumbnail: string | undefined;
    if (mimeType.startsWith('image/')) {
      thumbnail = await this.generateImageThumbnail(filePath);
    }

    const totalChunks = Math.max(1, Math.ceil(stats.size / CHUNK_SIZE));
    const transferId = crypto.randomUUID();

    const metadata: FileAttachmentMetadata = {
      transferId,
      fileName,
      fileSize: stats.size,
      mimeType,
      sha256,
      thumbnail,
      totalChunks,
    };

    const validated = validateFileAttachmentMetadata(metadata);
    if (!validated) {
      throw new Error('Prepared metadata failed validation');
    }

    this.outboundTransfers.set(transferId, {
      transferId,
      filePath,
      metadata: validated,
      isStreaming: false,
      isCancelled: false,
      transferredBytes: 0,
    });

    return validated;
  }

  /**
   * Prepares a buffer (e.g. from camera capture or video recording) as an outbound file.
   */
  public async prepareOutboundBuffer(
    fileName: string,
    mimeType: string,
    buffer: Buffer
  ): Promise<{ metadata: FileAttachmentMetadata; tempPath: string }> {
    if (buffer.length > MAX_FILE_SIZE) {
      throw new Error('Media size exceeds limit');
    }

    const tempDir = path.join(os.tmpdir(), 'subnet-media');
    fs.mkdirSync(tempDir, { recursive: true });

    const safeName = this.sanitizeFileName(fileName);
    const tempPath = path.join(tempDir, `${crypto.randomUUID()}-${safeName}`);
    await fs.promises.writeFile(tempPath, buffer);

    const metadata = await this.prepareOutboundFile(tempPath);
    return { metadata, tempPath };
  }

  /**
   * Streams chunks of an outbound file to a connected peer with backpressure and cancellation support.
   */
  public async streamFileChunks(
    transferId: string,
    sendChunk: (chunk: FileChunkPayload) => Promise<boolean> | boolean,
    isConnectionAlive?: () => boolean
  ): Promise<void> {
    const transfer = this.outboundTransfers.get(transferId);
    if (!transfer) {
      throw new Error(`Transfer ${transferId} not found`);
    }
    if (transfer.isCancelled) {
      return;
    }

    transfer.isStreaming = true;
    transfer.transferredBytes = 0;
    transfer.lastProgressTime = 0;

    const stream = fs.createReadStream(transfer.filePath, { highWaterMark: CHUNK_SIZE });
    let chunkIndex = 0;

    try {
      for await (const rawChunk of stream) {
        if (transfer.isCancelled) {
          stream.destroy();
          break;
        }

        if (isConnectionAlive && !isConnectionAlive()) {
          stream.destroy();
          throw new Error('Peer connection closed during chunk streaming');
        }

        const buf = Buffer.isBuffer(rawChunk) ? rawChunk : Buffer.from(rawChunk);
        const data = buf.toString('base64');

        const payload: FileChunkPayload = {
          type: 'file_chunk',
          transferId,
          chunkIndex,
          totalChunks: transfer.metadata.totalChunks,
          data,
          timestamp: Date.now(),
        };

        const validatedChunk = validateFileChunk(payload);
        if (!validatedChunk) {
          stream.destroy();
          throw new Error(`Invalid chunk payload generated at index ${chunkIndex}`);
        }

        const sent = await sendChunk(validatedChunk);
        if (!sent) {
          stream.destroy();
          throw new Error('Socket closed or send buffer full during chunk transmission');
        }

        chunkIndex++;
        transfer.transferredBytes += buf.length;

        const now = Date.now();
        const percent = Math.min(
          100,
          Math.round((transfer.transferredBytes / transfer.metadata.fileSize) * 100)
        );

        // Throttle progress events to max once every 100ms or on completion to prevent IPC flooding
        if (percent >= 100 || now - (transfer.lastProgressTime || 0) >= 100) {
          transfer.lastProgressTime = now;
          this.emit('progress', {
            transferId,
            role: 'sender',
            transferredBytes: transfer.transferredBytes,
            totalBytes: transfer.metadata.fileSize,
            percent,
            status: percent >= 100 ? 'completed' : 'transferring',
            localPath: transfer.filePath,
          } as TransferProgressEvent);
        }

        // Yield to event loop to avoid socket starvation and allow message interleaving
        await new Promise((resolve) => setImmediate(resolve));
      }
    } catch (err: any) {
      if (!transfer.isCancelled) {
        this.emit('progress', {
          transferId,
          role: 'sender',
          transferredBytes: transfer.transferredBytes,
          totalBytes: transfer.metadata.fileSize,
          percent: 0,
          status: 'failed',
          error: err.message || 'Stream error',
        } as TransferProgressEvent);
      }
      throw err;
    } finally {
      transfer.isStreaming = false;
    }
  }

  /**
   * Initializes download of an inbound file attachment.
   * Creates a .part temporary file and prepares SHA-256 verification.
   */
  public startInboundDownload(
    metadata: FileAttachmentMetadata,
    senderPeerId: string,
    customDestinationDir?: string
  ): { tempPath: string; finalPath: string } {
    const validMeta = validateFileAttachmentMetadata(metadata);
    if (!validMeta) {
      throw new Error('Invalid file attachment metadata');
    }

    const destDir = customDestinationDir || this.getDownloadsDir();
    const safeFileName = this.sanitizeFileName(validMeta.fileName);
    const finalPath = this.resolveUniqueFilePath(destDir, safeFileName);
    const tempPath = `${finalPath}.${validMeta.transferId}.part`;

    // Ensure temp file is clean
    if (fs.existsSync(tempPath)) {
      try {
        fs.unlinkSync(tempPath);
      } catch {}
    }

    fs.writeFileSync(tempPath, Buffer.alloc(0));
    const writeStream = fs.createWriteStream(tempPath, { flags: 'r+', start: 0 });
    writeStream.on('error', () => {}); // Handled gracefully on cancel or chunk error
    const hasher = crypto.createHash('sha256');

    const inbound: InboundTransfer = {
      transferId: validMeta.transferId,
      metadata: validMeta,
      senderPeerId,
      finalPath,
      tempPath,
      writeStream,
      hasher,
      receivedChunks: new Set(),
      nextExpectedIndex: 0,
      transferredBytes: 0,
      isCancelled: false,
      isCompleted: false,
    };

    this.inboundTransfers.set(validMeta.transferId, inbound);

    this.emit('progress', {
      transferId: validMeta.transferId,
      role: 'receiver',
      transferredBytes: 0,
      totalBytes: validMeta.fileSize,
      percent: 0,
      status: 'pending',
      localPath: finalPath,
    } as TransferProgressEvent);

    return { tempPath, finalPath };
  }

  /**
   * Handles an incoming file chunk from a peer.
   * Performs chunk ordering checks, duplicate detection, and final SHA-256 verification.
   */
  public async handleIncomingChunk(
    chunk: FileChunkPayload
  ): Promise<{ completed: boolean; success: boolean; duplicate?: boolean; error?: string; finalPath?: string }> {
    const validatedChunk = validateFileChunk(chunk);
    if (!validatedChunk) {
      return { completed: false, success: false, error: 'Malformed chunk payload' };
    }

    const transfer = this.inboundTransfers.get(validatedChunk.transferId);
    if (!transfer || transfer.isCancelled) {
      return { completed: false, success: false, error: 'Transfer not found or cancelled' };
    }

    if (transfer.isCompleted) {
      return { completed: true, success: true, finalPath: transfer.finalPath };
    }

    // 1. Duplicate chunk handling
    if (
      validatedChunk.chunkIndex < transfer.nextExpectedIndex ||
      transfer.receivedChunks.has(validatedChunk.chunkIndex)
    ) {
      console.log(`[Subnet:Transfer] Duplicate chunk #${validatedChunk.chunkIndex} ignored for transfer ${validatedChunk.transferId}`);
      return { completed: false, success: true, duplicate: true };
    }

    // 2. Chunk ordering verification
    if (validatedChunk.chunkIndex !== transfer.nextExpectedIndex) {
      console.error(
        `[Subnet:Transfer] Out-of-order chunk received (got #${validatedChunk.chunkIndex}, expected #${transfer.nextExpectedIndex})`
      );
      return { completed: false, success: false, error: 'Out-of-order chunk received' };
    }

    // 3. Write chunk to .part stream with backpressure handling
    const buf = Buffer.from(validatedChunk.data, 'base64');
    if (!transfer.writeStream) {
      return { completed: false, success: false, error: 'Write stream closed' };
    }

    transfer.receivedChunks.add(validatedChunk.chunkIndex);
    transfer.nextExpectedIndex++;
    transfer.hasher.update(buf);
    transfer.transferredBytes += buf.length;

    const canWriteMore = transfer.writeStream.write(buf);
    if (!canWriteMore) {
      await new Promise<void>((resolve) => {
        transfer.writeStream?.once('drain', resolve);
      });
    }

    const now = Date.now();
    const percent = Math.min(
      100,
      Math.round((transfer.transferredBytes / transfer.metadata.fileSize) * 100)
    );

    // Throttle progress events to max once every 100ms or on completion to prevent IPC flooding
    if (percent >= 100 || now - (transfer.lastProgressTime || 0) >= 100) {
      transfer.lastProgressTime = now;
      this.emit('progress', {
        transferId: transfer.transferId,
        role: 'receiver',
        transferredBytes: transfer.transferredBytes,
        totalBytes: transfer.metadata.fileSize,
        percent,
        status: 'transferring',
        localPath: transfer.finalPath,
      } as TransferProgressEvent);
    }

    // 4. Check if final chunk received
    if (transfer.nextExpectedIndex >= transfer.metadata.totalChunks) {
      return new Promise((resolve) => {
        transfer.writeStream?.end(async () => {
          transfer.writeStream = null;

          const computedHash = transfer.hasher.digest('hex').toLowerCase();
          const expectedHash = transfer.metadata.sha256.toLowerCase();

          if (computedHash === expectedHash) {
            try {
              // Finalize atomic move from .part to destination
              await fs.promises.rename(transfer.tempPath, transfer.finalPath);
              transfer.isCompleted = true;

              this.emit('progress', {
                transferId: transfer.transferId,
                role: 'receiver',
                transferredBytes: transfer.metadata.fileSize,
                totalBytes: transfer.metadata.fileSize,
                percent: 100,
                status: 'completed',
                localPath: transfer.finalPath,
              } as TransferProgressEvent);

              resolve({
                completed: true,
                success: true,
                finalPath: transfer.finalPath,
              });
            } catch (err: any) {
              resolve({
                completed: true,
                success: false,
                error: `Failed to finalize file: ${err.message}`,
              });
            }
          } else {
            console.error(
              `[Subnet:Transfer] Checksum mismatch for ${transfer.transferId}: computed ${computedHash} !== expected ${expectedHash}`
            );
            // Delete corrupt .part file
            try {
              await fs.promises.unlink(transfer.tempPath);
            } catch {}

            this.emit('progress', {
              transferId: transfer.transferId,
              role: 'receiver',
              transferredBytes: transfer.transferredBytes,
              totalBytes: transfer.metadata.fileSize,
              percent: 0,
              status: 'failed',
              error: 'SHA-256 integrity verification failed',
            } as TransferProgressEvent);

            resolve({
              completed: true,
              success: false,
              error: 'SHA-256 checksum mismatch',
            });
          }
        });
      });
    }

    return { completed: false, success: true };
  }

  /**
   * Cancels an active inbound or outbound transfer and cleans up partial resources.
   */
  public cancelTransfer(transferId: string, reason?: string): void {
    const outbound = this.outboundTransfers.get(transferId);
    if (outbound) {
      outbound.isCancelled = true;
      this.emit('progress', {
        transferId,
        role: 'sender',
        transferredBytes: outbound.transferredBytes,
        totalBytes: outbound.metadata.fileSize,
        percent: 0,
        status: 'cancelled',
        error: reason || 'Transfer cancelled by user',
      } as TransferProgressEvent);
      this.outboundTransfers.delete(transferId);
    }

    const inbound = this.inboundTransfers.get(transferId);
    if (inbound) {
      inbound.isCancelled = true;
      if (inbound.writeStream) {
        try {
          inbound.writeStream.removeAllListeners();
          inbound.writeStream.on('error', () => {});
          inbound.writeStream.destroy();
        } catch {}
        inbound.writeStream = null;
      }
      if (fs.existsSync(inbound.tempPath)) {
        try {
          fs.unlinkSync(inbound.tempPath);
        } catch {}
      }
      this.emit('progress', {
        transferId,
        role: 'receiver',
        transferredBytes: inbound.transferredBytes,
        totalBytes: inbound.metadata.fileSize,
        percent: 0,
        status: 'cancelled',
        error: reason || 'Transfer cancelled by user',
      } as TransferProgressEvent);
      this.inboundTransfers.delete(transferId);
    }
  }

  /**
   * Cancels all active in-flight inbound and outbound transfers for a disconnected peer.
   */
  public cancelTransfersForPeer(peerId: string, reason?: string): void {
    for (const [id, outbound] of this.outboundTransfers.entries()) {
      if (outbound.recipientPeerId === peerId) {
        this.cancelTransfer(id, reason || 'Peer disconnected from network');
      }
    }
    for (const [id, inbound] of this.inboundTransfers.entries()) {
      if (inbound.senderPeerId === peerId) {
        this.cancelTransfer(id, reason || 'Peer disconnected from network');
      }
    }
  }

  public getInboundTransfer(transferId: string): InboundTransfer | undefined {
    return this.inboundTransfers.get(transferId);
  }

  public getOutboundTransfer(transferId: string): OutboundTransfer | undefined {
    return this.outboundTransfers.get(transferId);
  }

  private computeFileSha256(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha256');
      const stream = fs.createReadStream(filePath);
      stream.on('data', (data) => hash.update(data));
      stream.on('end', () => resolve(hash.digest('hex').toLowerCase()));
      stream.on('error', (err) => reject(err));
    });
  }

  private async generateImageThumbnail(filePath: string): Promise<string | undefined> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const electron = require('electron');
      const nativeImage = electron.nativeImage;
      if (!nativeImage) return undefined;

      const img = nativeImage.createFromPath(filePath);
      if (img.isEmpty()) return undefined;

      const resized = img.resize({ width: 120, height: 120, quality: 'better' });
      const jpeg = resized.toJPEG(75);
      const dataUrl = `data:image/jpeg;base64,${jpeg.toString('base64')}`;
      if (dataUrl.length <= 35000) {
        return dataUrl;
      }
    } catch {}
    return undefined;
  }

  private detectMimeType(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    switch (ext) {
      case '.jpg':
      case '.jpeg':
        return 'image/jpeg';
      case '.png':
        return 'image/png';
      case '.gif':
        return 'image/gif';
      case '.webp':
        return 'image/webp';
      case '.mp4':
        return 'video/mp4';
      case '.mov':
        return 'video/quicktime';
      case '.webm':
        return 'video/webm';
      case '.mkv':
        return 'video/x-matroska';
      case '.pdf':
        return 'application/pdf';
      case '.zip':
        return 'application/zip';
      case '.tar':
      case '.gz':
        return 'application/gzip';
      case '.json':
        return 'application/json';
      case '.txt':
      case '.md':
        return 'text/plain';
      default:
        return 'application/octet-stream';
    }
  }
}
