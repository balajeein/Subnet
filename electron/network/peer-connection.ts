import WebSocket from 'ws';
import { EventEmitter } from 'events';
import {
  HANDSHAKE_TIMEOUT_MS,
  HEARTBEAT_INTERVAL_MS,
  HEARTBEAT_TIMEOUT_MS,
  MAX_MESSAGE_SIZE,
  PROTOCOL_VERSION,
  parseAndValidateEnvelope,
  HandshakePayload,
  HandshakeAckPayload,
  ProfileAvatarMetadata,
  NetworkEnvelope,
} from './protocol';
import type { LocalProfile } from '../../src/types/subnet';

export type ConnectionRole = 'inbound' | 'outbound';
export type ConnectionState = 'connecting' | 'handshaking' | 'connected' | 'closed';

export interface RemotePeerInfo {
  peerId: string;
  name: string;
  version: string;
  avatar?: ProfileAvatarMetadata;
  filePort?: number;
}

export const MAX_SOCKET_BUFFERED_AMOUNT = 2 * 1024 * 1024; // 2MB bounded backpressure

export class PeerConnection extends EventEmitter {
  public readonly role: ConnectionRole;
  public state: ConnectionState = 'connecting';
  public remotePeer: RemotePeerInfo | null = null;

  private ws: WebSocket;
  private localProfile: LocalProfile;
  private localAvatar?: ProfileAvatarMetadata;
  private handshakeTimer: NodeJS.Timeout | null = null;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private heartbeatTimeoutTimer: NodeJS.Timeout | null = null;

  constructor(
    ws: WebSocket,
    role: ConnectionRole,
    localProfile: LocalProfile,
    localAvatar?: ProfileAvatarMetadata
  ) {
    super();
    this.ws = ws;
    this.role = role;
    this.localProfile = localProfile;
    this.localAvatar = localAvatar;

    this.setupSocketListeners();
    this.startHandshakeTimer();

    if (this.role === 'outbound' && this.ws.readyState === WebSocket.OPEN) {
      this.sendHandshake();
    }
  }

  private setupSocketListeners(): void {
    if (this.role === 'outbound') {
      this.ws.on('open', () => {
        console.log(`[Subnet:WS] Outbound socket opened. Sending initial handshake...`);
        this.sendHandshake();
      });
    }

    this.ws.on('message', (data: WebSocket.RawData) => {
      this.handleRawMessage(data);
    });

    this.ws.on('close', (code: number, reason: Buffer) => {
      const reasonStr = reason.toString('utf-8');
      console.log(`[Subnet:WS] Socket closed (role: ${this.role}, code: ${code}, reason: "${reasonStr}")`);
      this.cleanup();
      this.state = 'closed';
      this.emit('close', code, reasonStr);
    });

    this.ws.on('error', (err: Error) => {
      console.log(`[Subnet:WS] Socket error (role: ${this.role}): ${err.message}`);
      this.cleanup();
      this.state = 'closed';
      this.emit('error', err);
    });
  }

  private startHandshakeTimer(): void {
    this.handshakeTimer = setTimeout(() => {
      if (this.state !== 'connected') {
        console.log(`[Subnet:Handshake] Handshake timed out after ${HANDSHAKE_TIMEOUT_MS}ms (role: ${this.role})`);
        this.close(4008, 'Handshake timed out');
      }
    }, HANDSHAKE_TIMEOUT_MS);
  }

  private sendHandshake(): void {
    this.state = 'handshaking';
    const handshake: HandshakePayload = {
      type: 'handshake',
      peerId: this.localProfile.id,
      name: this.localProfile.name,
      avatar: this.localAvatar,
      version: PROTOCOL_VERSION,
      timestamp: Date.now(),
      filePort: this.localProfile.filePort,
    };
    this.sendEnvelope(handshake);
  }

  private handleRawMessage(rawData: WebSocket.RawData): void {
    // Enforce message buffer size limit
    if (Buffer.isBuffer(rawData) && rawData.length > MAX_MESSAGE_SIZE) {
      console.log(`[Subnet:WS] Message rejected: exceeded size limit (${rawData.length} > ${MAX_MESSAGE_SIZE} bytes)`);
      this.close(1009, 'Message payload exceeded size limit');
      return;
    }

    const envelope = parseAndValidateEnvelope(rawData as string | Buffer);
    if (!envelope) {
      console.log(`[Subnet:WS] Discarded invalid or malformed envelope`);
      return;
    }

    // Heartbeat handling
    if (envelope.type === 'ping') {
      this.sendEnvelope({ type: 'pong', timestamp: Date.now() });
      return;
    }

    if (envelope.type === 'pong') {
      if (this.heartbeatTimeoutTimer) {
        clearTimeout(this.heartbeatTimeoutTimer);
        this.heartbeatTimeoutTimer = null;
      }
      return;
    }

    // Handshake processing
    if (this.state !== 'connected') {
      if (this.role === 'inbound' && envelope.type === 'handshake') {
        this.remotePeer = {
          peerId: envelope.peerId,
          name: envelope.name,
          version: envelope.version,
          avatar: envelope.avatar,
          filePort: envelope.filePort,
        };

        console.log(`[Subnet:Handshake] Inbound handshake received from "${envelope.name}" (${envelope.peerId.slice(0, 8)}). Sending handshake_ack...`);

        // Send handshake acknowledgement
        const ack: HandshakeAckPayload = {
          type: 'handshake_ack',
          peerId: this.localProfile.id,
          name: this.localProfile.name,
          avatar: this.localAvatar,
          version: PROTOCOL_VERSION,
          timestamp: Date.now(),
          filePort: this.localProfile.filePort,
        };
        this.sendEnvelope(ack);

        this.completeHandshake();
        return;
      }

      if (this.role === 'outbound' && envelope.type === 'handshake_ack') {
        this.remotePeer = {
          peerId: envelope.peerId,
          name: envelope.name,
          version: envelope.version,
          avatar: envelope.avatar,
          filePort: envelope.filePort,
        };

        console.log(`[Subnet:Handshake] Outbound handshake acknowledged by "${envelope.name}" (${envelope.peerId.slice(0, 8)}).`);
        this.completeHandshake();
        return;
      }

      // Any other message before handshake is completed is invalid
      console.log(`[Subnet:Handshake] Unexpected message type "${envelope.type}" before handshake completed. Terminating.`);
      this.close(4003, 'Unexpected message before handshake completed');
      return;
    }

    // Normal message delivery
    this.emit('message', envelope);
  }

  private completeHandshake(): void {
    if (this.handshakeTimer) {
      clearTimeout(this.handshakeTimer);
      this.handshakeTimer = null;
    }

    this.state = 'connected';
    console.log(`[Subnet:Handshake] ✓ Mutual handshake verified with "${this.remotePeer?.name}" (${this.remotePeer?.peerId.slice(0, 8)}) [role: ${this.role}]`);
    this.startHeartbeat();
    this.emit('connected', this.remotePeer);
  }

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      if (this.state === 'connected' && this.ws.readyState === WebSocket.OPEN) {
        this.sendEnvelope({ type: 'ping', timestamp: Date.now() });

        this.heartbeatTimeoutTimer = setTimeout(() => {
          console.log(`[Subnet:WS] Heartbeat timeout. Closing dead socket.`);
          this.close(4000, 'Heartbeat timeout');
        }, HEARTBEAT_TIMEOUT_MS);
      }
    }, HEARTBEAT_INTERVAL_MS);
  }

  public sendEnvelope(envelope: NetworkEnvelope): boolean {
    if (this.ws.readyState !== WebSocket.OPEN) {
      return false;
    }

    // Backpressure safeguard: bounded buffering against stalled or slow peers
    if (this.ws.bufferedAmount > MAX_SOCKET_BUFFERED_AMOUNT) {
      console.warn(
        `[Subnet:WS] High backpressure (${this.ws.bufferedAmount} bytes buffered) for peer "${this.remotePeer?.name || 'unknown'}". Dropping frame to prevent unbounded buffering.`
      );
      return false;
    }

    try {
      const serialized = JSON.stringify(envelope);
      this.ws.send(serialized);
      return true;
    } catch {
      return false;
    }
  }

  public isBackpressured(): boolean {
    return (
      this.ws.readyState !== WebSocket.OPEN ||
      this.ws.bufferedAmount >= MAX_SOCKET_BUFFERED_AMOUNT
    );
  }

  public async waitForDrain(maxWaitMs = 15000): Promise<boolean> {
    if (this.ws.readyState !== WebSocket.OPEN) return false;
    if (this.ws.bufferedAmount < MAX_SOCKET_BUFFERED_AMOUNT / 2) return true;

    return new Promise<boolean>((resolve) => {
      let settled = false;
      const timeout = setTimeout(() => {
        if (!settled) {
          settled = true;
          cleanup();
          resolve(this.ws.readyState === WebSocket.OPEN && this.ws.bufferedAmount < MAX_SOCKET_BUFFERED_AMOUNT);
        }
      }, maxWaitMs);

      const interval = setInterval(() => {
        if (this.ws.readyState !== WebSocket.OPEN) {
          if (!settled) {
            settled = true;
            cleanup();
            resolve(false);
          }
        } else if (this.ws.bufferedAmount < MAX_SOCKET_BUFFERED_AMOUNT / 4) {
          if (!settled) {
            settled = true;
            cleanup();
            resolve(true);
          }
        }
      }, 10);

      const cleanup = () => {
        clearTimeout(timeout);
        clearInterval(interval);
      };
    });
  }

  public close(code = 1000, reason = 'Normal closure'): void {
    this.cleanup();
    this.state = 'closed';
    try {
      this.ws.close(code, reason);
    } catch {
      // Ignore if already terminating
    }
  }

  private cleanup(): void {
    if (this.handshakeTimer) {
      clearTimeout(this.handshakeTimer);
      this.handshakeTimer = null;
    }
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    if (this.heartbeatTimeoutTimer) {
      clearTimeout(this.heartbeatTimeoutTimer);
      this.heartbeatTimeoutTimer = null;
    }
  }
}
