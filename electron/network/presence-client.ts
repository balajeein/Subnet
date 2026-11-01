import { EventEmitter } from 'events';
import crypto from 'crypto';
import { WebSocket } from 'ws';
import type { Peer, ProfileAvatarMetadata } from '../../src/types/subnet';

const PRESENCE_PROTOCOL_VERSION = 1;
const HEARTBEAT_INTERVAL_MS = 15_000;
const RECONNECT_BASE_DELAY_MS = 2_000;
const RECONNECT_MAX_DELAY_MS = 60_000;
const MAX_NAME_LENGTH = 160;
const MAX_AVATAR_VALUE_LENGTH = 160_000;

export type PresenceStatus = 'disabled' | 'connecting' | 'connected' | 'offline';

interface PresenceClientOptions {
  serverUrl: string;
  peerId: string;
  displayName: string;
  avatar?: ProfileAvatarMetadata;
  host: string;
  port: number;
  filePort?: number;
  scopeToken: string;
  discoverable: boolean;
}

interface PresenceRecord {
  peerId: string;
  name: string;
  avatar?: ProfileAvatarMetadata;
  host?: string;
  port?: number;
  filePort?: number;
  scopeToken?: string;
  updatedAt: number;
}

type PresenceServerMessage =
  | { type: 'presence_snapshot'; peers: PresenceRecord[] }
  | { type: 'presence_upsert'; peer: PresenceRecord }
  | { type: 'presence_remove'; peerId: string }
  | { type: 'presence_error'; message: string };

/**
 * Client for the optional, ephemeral radar presence service.
 *
 * This client carries discovery metadata only. Chat messages, attachments,
 * room data, and local history never pass through the presence service.
 */
export class PresenceClient extends EventEmitter {
  private options: PresenceClientOptions;
  private socket: WebSocket | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private reconnectAttempt = 0;
  private shouldRun = false;
  private status: PresenceStatus = 'disabled';
  private readonly peerIds = new Set<string>();

  constructor(options: PresenceClientOptions) {
    super();
    this.options = { ...options };
  }

  public getStatus(): PresenceStatus {
    return this.status;
  }

  public getServerUrl(): string {
    return this.options.serverUrl;
  }

  public async start(): Promise<void> {
    this.shouldRun = true;
    if (!this.options.serverUrl || !this.options.discoverable) {
      this.clearPeers();
      this.setStatus('disabled');
      return;
    }
    this.connect();
  }

  public async stop(): Promise<void> {
    this.shouldRun = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.stopHeartbeat();
    this.clearPeers();
    const socket = this.socket;
    this.socket = null;
    if (socket && socket.readyState === WebSocket.OPEN) {
      try {
        socket.send(JSON.stringify({ type: 'presence_leave', peerId: this.options.peerId }));
      } catch {
        // The close below is still sufficient when the socket is already failing.
      }
    }
    if (socket && socket.readyState !== WebSocket.CLOSED) {
      socket.close(1000, 'Subnet shutting down');
    }
    this.setStatus('disabled');
  }

  public updateEndpoint(options: Partial<Pick<PresenceClientOptions, 'displayName' | 'avatar' | 'host' | 'port' | 'filePort' | 'scopeToken' | 'discoverable'>>): void {
    this.options = { ...this.options, ...options };
    if (!this.options.discoverable) {
      this.send({ type: 'presence_leave', peerId: this.options.peerId });
      this.clearPeers();
      this.setStatus(this.options.serverUrl ? 'offline' : 'disabled');
      return;
    }
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.sendRegistration();
    } else if (this.shouldRun && this.options.serverUrl && !this.reconnectTimer) {
      this.connect();
    }
  }

  public async reconfigure(serverUrl: string): Promise<void> {
    const normalized = serverUrl.trim();
    if (normalized === this.options.serverUrl) return;
    await this.stop();
    this.options.serverUrl = normalized;
    await this.start();
  }

  private connect(): void {
    if (!this.shouldRun || !this.options.serverUrl || !this.options.discoverable) return;
    if (this.socket && (this.socket.readyState === WebSocket.CONNECTING || this.socket.readyState === WebSocket.OPEN)) {
      return;
    }

    let url: URL;
    try {
      url = new URL(this.options.serverUrl);
      if (url.protocol !== 'ws:' && url.protocol !== 'wss:') {
        throw new Error('Presence URL must use ws:// or wss://');
      }
    } catch (error) {
      console.warn(`[Subnet:Presence] Invalid server URL: ${this.options.serverUrl}`, error);
      this.setStatus('offline');
      return;
    }

    this.setStatus('connecting');
    const socket = new WebSocket(url.toString(), { maxPayload: 256 * 1024 });
    this.socket = socket;

    socket.once('open', () => {
      if (this.socket !== socket) return;
      this.reconnectAttempt = 0;
      this.setStatus('connected');
      this.sendRegistration();
      this.startHeartbeat();
    });

    socket.on('message', (data) => {
      if (this.socket !== socket) return;
      this.handleServerMessage(data.toString());
    });

    socket.once('error', (error) => {
      console.warn(`[Subnet:Presence] Presence connection error: ${(error as Error).message}`);
    });

    socket.once('close', () => {
      if (this.socket !== socket) return;
      this.socket = null;
      this.stopHeartbeat();
      this.clearPeers();
      if (this.shouldRun && this.options.serverUrl && this.options.discoverable) {
        this.setStatus('offline');
        this.scheduleReconnect();
      } else {
        this.setStatus(this.options.serverUrl ? 'offline' : 'disabled');
      }
    });
  }

  private sendRegistration(): void {
    this.send({
      type: 'presence_register',
      protocolVersion: PRESENCE_PROTOCOL_VERSION,
      peerId: this.options.peerId,
      name: this.options.displayName.slice(0, MAX_NAME_LENGTH),
      avatar: sanitizeAvatar(this.options.avatar),
      host: isUsableHost(this.options.host) ? this.options.host : undefined,
      port: validPort(this.options.port) ? this.options.port : undefined,
      filePort: validPort(this.options.filePort) ? this.options.filePort : undefined,
      scopeToken: this.options.scopeToken,
      timestamp: Date.now(),
    });
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      this.send({
        type: 'presence_heartbeat',
        peerId: this.options.peerId,
        name: this.options.displayName.slice(0, MAX_NAME_LENGTH),
        avatar: sanitizeAvatar(this.options.avatar),
        host: isUsableHost(this.options.host) ? this.options.host : undefined,
        port: validPort(this.options.port) ? this.options.port : undefined,
        filePort: validPort(this.options.filePort) ? this.options.filePort : undefined,
        scopeToken: this.options.scopeToken,
        timestamp: Date.now(),
      });
    }, HEARTBEAT_INTERVAL_MS);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer || !this.shouldRun) return;
    const delay = Math.min(
      RECONNECT_MAX_DELAY_MS,
      RECONNECT_BASE_DELAY_MS * 2 ** Math.min(this.reconnectAttempt, 5)
    );
    this.reconnectAttempt += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  private send(payload: Record<string, unknown>): void {
    if (this.socket?.readyState !== WebSocket.OPEN) return;
    try {
      this.socket.send(JSON.stringify(payload));
    } catch (error) {
      console.warn('[Subnet:Presence] Failed to send presence payload', error);
    }
  }

  private handleServerMessage(raw: string): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return;
    }
    if (!parsed || typeof parsed !== 'object') return;
    const message = parsed as PresenceServerMessage;

    if (message.type === 'presence_snapshot' && Array.isArray(message.peers)) {
      const nextIds = new Set<string>();
      for (const record of message.peers) {
        const peer = this.toPeer(record);
        if (!peer) continue;
        nextIds.add(peer.id);
        this.peerIds.add(peer.id);
        this.emit('peer-discovered', peer);
      }
      for (const peerId of this.peerIds) {
        if (!nextIds.has(peerId)) {
          this.peerIds.delete(peerId);
          this.emit('peer-lost', peerId);
        }
      }
      return;
    }

    if (message.type === 'presence_upsert') {
      const peer = this.toPeer(message.peer);
      if (!peer) return;
      this.peerIds.add(peer.id);
      this.emit('peer-discovered', peer);
      return;
    }

    if (message.type === 'presence_remove' && typeof message.peerId === 'string') {
      if (this.peerIds.delete(message.peerId)) {
        this.emit('peer-lost', message.peerId);
      }
    }
  }

  private toPeer(record: PresenceRecord): Peer | null {
    if (!record || typeof record.peerId !== 'string' || !record.peerId || record.peerId === this.options.peerId) {
      return null;
    }
    if (typeof record.name !== 'string' || !record.name.trim()) return null;
    const peer: Peer = {
      id: record.peerId,
      name: record.name.slice(0, MAX_NAME_LENGTH),
      avatar: sanitizeAvatar(record.avatar),
      lastSeen: typeof record.updatedAt === 'number' ? record.updatedAt : Date.now(),
      presenceReachable: Boolean(record.host && validPort(record.port)),
    };
    if (record.host && validPort(record.port)) {
      peer.host = record.host;
      peer.port = record.port;
      if (validPort(record.filePort)) peer.filePort = record.filePort;
    }
    return peer;
  }

  private setStatus(status: PresenceStatus): void {
    if (this.status === status) return;
    this.status = status;
    this.emit('status-changed', status);
  }

  private clearPeers(): void {
    for (const peerId of this.peerIds) {
      this.emit('peer-lost', peerId);
    }
    this.peerIds.clear();
  }
}

function validPort(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1024 && value <= 65534;
}

function isUsableHost(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value !== '127.0.0.1' && value !== '0.0.0.0';
}

function sanitizeAvatar(avatar: ProfileAvatarMetadata | undefined): ProfileAvatarMetadata | undefined {
  if (!avatar || !['default', 'preset', 'custom'].includes(avatar.avatarType)) return undefined;
  if (typeof avatar.avatarValue !== 'string') return undefined;
  if (avatar.avatarValue.length > MAX_AVATAR_VALUE_LENGTH) return undefined;
  return { avatarType: avatar.avatarType, avatarValue: avatar.avatarValue };
}

export function createPresenceScopeToken(networks: Array<{ address: string; netmask: string }>): string {
  const normalized = networks
    // Compare the subnet network address, not the device address. For example,
    // 10.7.13.223/19 and 10.7.19.253/19 are the same local network even though
    // the host portions differ.
    .map((network) => `${normalizeIpv4Network(network.address, network.netmask)}/${network.netmask}`)
    .sort()
    .join('|');
  return crypto.createHash('sha256').update(normalized || 'no-network').digest('hex').slice(0, 32);
}

function normalizeIpv4Network(address: string, netmask: string): string {
  const ip = parseIpv4(address);
  const mask = parseIpv4(netmask);
  if (ip === null || mask === null) return address;
  const network = (ip & mask) >>> 0;
  return [
    (network >>> 24) & 255,
    (network >>> 16) & 255,
    (network >>> 8) & 255,
    network & 255,
  ].join('.');
}

function parseIpv4(value: string): number | null {
  const octets = value.split('.');
  if (octets.length !== 4) return null;
  const parsed = octets.map((octet) => Number(octet));
  if (parsed.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) return null;
  return (((parsed[0] * 256 + parsed[1]) * 256 + parsed[2]) * 256 + parsed[3]) >>> 0;
}
