import dgram, { RemoteInfo, Socket } from 'dgram';
import type { Peer } from '../../src/types/subnet';
import { PROTOCOL_VERSION } from './protocol';

/**
 * LAN Messenger-compatible discovery defaults.
 *
 * Bonjour remains the primary discovery path. This UDP channel is a fallback
 * for networks that allow peer-to-peer traffic but do not forward mDNS.
 */
export const DISCOVERY_UDP_PORT = 50000;
export const DISCOVERY_MULTICAST_ADDRESS = '239.255.100.100';
export const DISCOVERY_ANNOUNCE_INTERVAL_MS = 3000;
export const DISCOVERY_PEER_TTL_MS = 12000;

const DISCOVERY_MESSAGE_TYPE = 'subnet_discovery';
const MAX_DISCOVERY_DATAGRAM_SIZE = 4096;

export interface DiscoveryAnnouncement {
  type: typeof DISCOVERY_MESSAGE_TYPE;
  version: string;
  peerId: string;
  name: string;
  port: number;
  filePort?: number;
  timestamp: number;
}

export interface UdpDiscoveryOptions {
  localPeerId: string;
  displayName: string;
  localIp: string;
  netmask?: string;
  localNetworks?: Array<{ address: string; netmask: string }>;
  port: number;
  filePort?: number;
  discoverable?: boolean;
  discoveryPort?: number;
  multicastAddress?: string;
  announceIntervalMs?: number;
  peerTtlMs?: number;
}

export function calculateBroadcastAddress(ipAddress: string, subnetMask: string): string | null {
  const ip = parseIpv4(ipAddress);
  const mask = parseIpv4(subnetMask);
  if (ip === null || mask === null) return null;

  const broadcast = (ip | (~mask >>> 0)) >>> 0;
  return [
    (broadcast >>> 24) & 0xff,
    (broadcast >>> 16) & 0xff,
    (broadcast >>> 8) & 0xff,
    broadcast & 0xff,
  ].join('.');
}

export function createDiscoveryAnnouncement(
  localPeerId: string,
  displayName: string,
  port: number,
  timestamp = Date.now(),
  filePort?: number
): DiscoveryAnnouncement {
  return {
    type: DISCOVERY_MESSAGE_TYPE,
    version: PROTOCOL_VERSION,
    peerId: localPeerId,
    name: displayName,
    port,
    ...(filePort ? { filePort } : {}),
    timestamp,
  };
}

/**
 * Parses an announcement and uses the UDP sender address as the peer address.
 * Discovery data is a connection hint only; PeerConnection still performs the
 * normal handshake before the peer is trusted or used for messaging.
 */
export function parseDiscoveryAnnouncement(
  data: Buffer | string,
  sourceAddress: string,
  localPeerId?: string
): Peer | null {
  if (!sourceAddress || sourceAddress === '0.0.0.0') return null;

  const raw = typeof data === 'string' ? data : data.toString('utf8');
  if (Buffer.byteLength(raw, 'utf8') > MAX_DISCOVERY_DATAGRAM_SIZE) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!isDiscoveryAnnouncement(parsed)) return null;
  if (localPeerId && parsed.peerId === localPeerId) return null;

  return {
    id: parsed.peerId,
    name: parsed.name,
    host: sourceAddress,
    port: parsed.port,
    filePort: parsed.filePort,
    lastSeen: Date.now(),
  };
}

function isDiscoveryAnnouncement(value: unknown): value is DiscoveryAnnouncement {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<DiscoveryAnnouncement>;

  return (
    candidate.type === DISCOVERY_MESSAGE_TYPE &&
    typeof candidate.version === 'string' &&
    candidate.version.length > 0 &&
    typeof candidate.peerId === 'string' &&
    candidate.peerId.trim().length > 0 &&
    candidate.peerId.length <= 128 &&
    typeof candidate.name === 'string' &&
    candidate.name.trim().length > 0 &&
    candidate.name.length <= 160 &&
    typeof candidate.port === 'number' &&
    Number.isInteger(candidate.port) &&
    candidate.port > 0 &&
    candidate.port <= 65535 &&
    (candidate.filePort === undefined || (
      typeof candidate.filePort === 'number' &&
      Number.isInteger(candidate.filePort) &&
      candidate.filePort > 0 &&
      candidate.filePort <= 65535
    )) &&
    typeof candidate.timestamp === 'number' &&
    Number.isFinite(candidate.timestamp)
  );
}

function parseIpv4(value: string): number | null {
  const parts = value.split('.');
  if (parts.length !== 4) return null;

  let result = 0;
  for (const part of parts) {
    if (!/^\d+$/.test(part)) return null;
    const octet = Number(part);
    if (octet < 0 || octet > 255) return null;
    result = ((result << 8) | octet) >>> 0;
  }
  return result >>> 0;
}

export class UdpDiscovery {
  private readonly options: UdpDiscoveryOptions & {
    discoverable: boolean;
    discoveryPort: number;
    multicastAddress: string;
    announceIntervalMs: number;
    peerTtlMs: number;
  };
  private socket: Socket | null = null;
  private announceTimer: NodeJS.Timeout | null = null;
  private expiryTimer: NodeJS.Timeout | null = null;
  private running = false;
  private lastError?: string;
  private readonly seenPeers = new Map<string, number>();
  private readonly multicastInterfaces = new Set<string>();
  private onPeerDiscoveredCb?: (peer: Peer) => void;
  private onPeerLostCb?: (peerId: string) => void;

  constructor(options: UdpDiscoveryOptions) {
    this.options = {
      ...options,
      discoverable: options.discoverable !== false,
      discoveryPort: options.discoveryPort ?? DISCOVERY_UDP_PORT,
      multicastAddress: options.multicastAddress ?? DISCOVERY_MULTICAST_ADDRESS,
      announceIntervalMs: options.announceIntervalMs ?? DISCOVERY_ANNOUNCE_INTERVAL_MS,
      peerTtlMs: options.peerTtlMs ?? DISCOVERY_PEER_TTL_MS,
    };
  }

  public async start(
    onPeerDiscovered: (peer: Peer) => void,
    onPeerLost: (peerId: string) => void
  ): Promise<void> {
    if (this.running) return;

    this.onPeerDiscoveredCb = onPeerDiscovered;
    this.onPeerLostCb = onPeerLost;
    this.socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    this.socket.on('message', (message, rinfo) => this.handleMessage(message, rinfo));
    this.socket.on('error', (error) => {
      this.lastError = error.message;
      console.warn(`[Subnet:UDP] Discovery socket error: ${error.message}`);
    });

    try {
      await this.bindSocket();
    } catch (error: any) {
      this.lastError = error?.message || String(error);
      console.warn(`[Subnet:UDP] Discovery unavailable: ${error?.message || error}`);
      this.closeSocket();
      return;
    }

    this.running = true;
    this.lastError = undefined;
    try {
      this.socket.setBroadcast(true);
      this.socket.setMulticastTTL(1);
      this.configureMulticastMembership();
      console.log(
        `[Subnet:UDP] Listening on ${this.options.discoveryPort}; multicast ${this.options.multicastAddress}; broadcasts ${this.getBroadcastAddresses().join(', ')}`
      );
    } catch (error: any) {
      this.lastError = error?.message || String(error);
      // Some managed networks reject multicast membership while still allowing
      // broadcast packets. Keep the socket alive and continue with broadcasts.
      console.warn(`[Subnet:UDP] Multicast setup unavailable: ${error?.message || error}`);
    }

    this.announce();
    this.announceTimer = setInterval(() => this.announce(), this.options.announceIntervalMs);
    this.expiryTimer = setInterval(() => this.expirePeers(), this.options.announceIntervalMs);
  }

  public async stop(): Promise<void> {
    if (this.announceTimer) clearInterval(this.announceTimer);
    if (this.expiryTimer) clearInterval(this.expiryTimer);
    this.announceTimer = null;
    this.expiryTimer = null;
    this.running = false;

    for (const peerId of this.seenPeers.keys()) {
      this.onPeerLostCb?.(peerId);
    }
    this.seenPeers.clear();
    this.closeSocket();
  }

  public setDiscoverable(discoverable: boolean): void {
    this.options.discoverable = discoverable;
    if (discoverable && this.running) {
      this.announce();
    }
  }

  /** Refreshes the interfaces used for multicast and subnet broadcast. */
  public setNetworks(networks: Array<{ address: string; netmask: string }>): void {
    this.options.localNetworks = normalizeNetworks(networks);
    const first = this.options.localNetworks[0];
    if (first) {
      this.options.localIp = first.address;
      this.options.netmask = first.netmask;
    } else {
      this.options.localIp = '127.0.0.1';
      this.options.netmask = '255.0.0.0';
    }

    if (this.running && this.socket) {
      try {
        this.configureMulticastMembership();
      } catch (error: any) {
        console.warn(`[Subnet:UDP] Multicast interface refresh unavailable: ${error?.message || error}`);
      }
    }
  }

  public getBroadcastAddresses(): string[] {
    const addresses = new Set<string>(['255.255.255.255']);
    const networks = this.getLocalNetworks();
    for (const network of networks) {
      const subnetBroadcast = calculateBroadcastAddress(network.address, network.netmask);
      if (subnetBroadcast) addresses.add(subnetBroadcast);
    }
    return Array.from(addresses);
  }

  public isRunning(): boolean {
    return this.running;
  }

  public getLastError(): string | undefined {
    return this.lastError;
  }

  private getLocalNetworks(): Array<{ address: string; netmask: string }> {
    const configured = normalizeNetworks(this.options.localNetworks || []);
    if (configured.length > 0) return configured;
    if (this.options.localIp && this.options.localIp !== '127.0.0.1' && this.options.netmask) {
      return [{ address: this.options.localIp, netmask: this.options.netmask }];
    }
    return [];
  }

  private configureMulticastMembership(): void {
    if (!this.socket) return;

    const interfaces = this.getLocalNetworks()
      .map((network) => network.address)
      .filter((address) => address !== '127.0.0.1');

    for (const address of this.multicastInterfaces) {
      if (interfaces.includes(address)) continue;
      try {
        this.socket.dropMembership(this.options.multicastAddress, address);
      } catch {
        // The interface may already have disappeared during a Wi-Fi change.
      }
      this.multicastInterfaces.delete(address);
    }

    if (interfaces.length === 0) {
      if (this.multicastInterfaces.size === 0) {
        this.socket.addMembership(this.options.multicastAddress);
        this.multicastInterfaces.add('default');
      }
      return;
    }

    if (this.multicastInterfaces.has('default')) {
      try {
        this.socket.dropMembership(this.options.multicastAddress);
      } catch {
        // Best effort cleanup.
      }
      this.multicastInterfaces.delete('default');
    }

    for (const address of interfaces) {
      if (this.multicastInterfaces.has(address)) continue;
      try {
        this.socket.addMembership(this.options.multicastAddress, address);
        this.multicastInterfaces.add(address);
      } catch (error: any) {
        console.warn(`[Subnet:UDP] Could not join multicast on ${address}: ${error?.message || error}`);
      }
    }
  }

  private bindSocket(): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = this.socket;
      if (!socket) {
        reject(new Error('Discovery socket was not created'));
        return;
      }

      const onListening = () => {
        socket.off('error', onError);
        resolve();
      };
      const onError = (error: Error) => {
        socket.off('listening', onListening);
        reject(error);
      };

      socket.once('listening', onListening);
      socket.once('error', onError);
      socket.bind(this.options.discoveryPort, '0.0.0.0');
    });
  }

  private announce(): void {
    if (!this.running || !this.options.discoverable || !this.socket) return;

    const announcement = createDiscoveryAnnouncement(
      this.options.localPeerId,
      this.options.displayName,
      this.options.port,
      Date.now(),
      this.options.filePort
    );
    const payload = Buffer.from(JSON.stringify(announcement), 'utf8');
    const targets = [this.options.multicastAddress, ...this.getBroadcastAddresses()];

    for (const address of new Set(targets)) {
      this.socket.send(payload, this.options.discoveryPort, address, (error) => {
        if (error) {
          console.warn(`[Subnet:UDP] Announcement to ${address} failed: ${error.message}`);
        }
      });
    }
  }

  private handleMessage(message: Buffer, rinfo: RemoteInfo): void {
    if (!this.running) return;

    const peer = parseDiscoveryAnnouncement(message, rinfo.address, this.options.localPeerId);
    if (!peer) return;

    this.seenPeers.set(peer.id, Date.now());
    this.onPeerDiscoveredCb?.(peer);
  }

  private expirePeers(): void {
    const now = Date.now();
    for (const [peerId, lastSeen] of this.seenPeers.entries()) {
      if (now - lastSeen <= this.options.peerTtlMs) continue;
      this.seenPeers.delete(peerId);
      this.onPeerLostCb?.(peerId);
    }
  }

  private closeSocket(): void {
    const socket = this.socket;
    this.socket = null;
    if (!socket) return;

    try {
      socket.close();
    } catch {
      // The socket may already be closed after a bind error.
    }
    this.multicastInterfaces.clear();
  }
}

function normalizeNetworks(
  networks: Array<{ address: string; netmask: string }>
): Array<{ address: string; netmask: string }> {
  const unique = new Map<string, { address: string; netmask: string }>();
  for (const network of networks) {
    if (!network?.address || !network?.netmask || network.address === '127.0.0.1') continue;
    const key = `${network.address}/${network.netmask}`;
    unique.set(key, { address: network.address, netmask: network.netmask });
  }
  return Array.from(unique.values());
}
