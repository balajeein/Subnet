import { Bonjour, Service } from 'bonjour-service';
import { BONJOUR_SERVICE_TYPE, BONJOUR_ROOM_SERVICE_TYPE, PROTOCOL_VERSION } from './protocol';
import type { Peer, DiscoveredRoom } from '../../src/types/subnet';

export interface BonjourDiscoveryOptions {
  localPeerId: string;
  displayName: string;
  port: number;
}

export class BonjourDiscovery {
  private bonjour: Bonjour | null = null;
  private publishedService: Service | null = null;
  private publishedRoomServices: Map<string, Service> = new Map();
  private browser: ReturnType<Bonjour['find']> | null = null;
  private roomBrowser: ReturnType<Bonjour['find']> | null = null;
  private queryInterval: NodeJS.Timeout | null = null;
  private localPeerId: string;
  private displayName: string;
  private port: number;

  // Track service identity mappings for reliable goodbye / teardown handling
  private serviceFqdnToPeerId: Map<string, string> = new Map();
  private serviceNameToPeerId: Map<string, string> = new Map();

  // Track room identity mappings
  private roomFqdnToRoomId: Map<string, string> = new Map();
  private roomNameToRoomId: Map<string, string> = new Map();

  private onPeerDiscoveredCb?: (peer: Peer) => void;
  private onPeerLostCb?: (peerId: string) => void;
  private onRoomDiscoveredCb?: (room: DiscoveredRoom) => void;
  private onRoomLostCb?: (roomId: string) => void;

  constructor(options: BonjourDiscoveryOptions) {
    this.localPeerId = options.localPeerId;
    this.displayName = options.displayName;
    this.port = options.port;
  }

  /**
   * Initializes Bonjour service, advertises local instance, and starts browsing for peers and rooms.
   */
  public async start(
    onPeerDiscovered: (peer: Peer) => void,
    onPeerLost: (peerId: string) => void,
    onRoomDiscovered?: (room: DiscoveredRoom) => void,
    onRoomLost?: (roomId: string) => void
  ): Promise<void> {
    this.onPeerDiscoveredCb = onPeerDiscovered;
    this.onPeerLostCb = onPeerLost;
    this.onRoomDiscoveredCb = onRoomDiscovered;
    this.onRoomLostCb = onRoomLost;

    this.bonjour = new Bonjour();

    // Advertise local Subnet instance on the LAN
    const instanceName = `Subnet-${this.localPeerId.slice(0, 8)}`;
    console.log(
      `[Subnet:Discovery] Publishing service "${instanceName}" on port ${this.port} (type: _${BONJOUR_SERVICE_TYPE}._tcp, peerId: ${this.localPeerId.slice(0, 8)})`
    );

    this.publishedService = this.bonjour.publish({
      name: instanceName,
      type: BONJOUR_SERVICE_TYPE,
      protocol: 'tcp',
      port: this.port,
      txt: {
        id: this.localPeerId,
        name: this.displayName,
        v: PROTOCOL_VERSION,
      },
    });

    // Start browsing for other Subnet peers
    console.log(`[Subnet:Discovery] Starting mDNS browser for _${BONJOUR_SERVICE_TYPE}._tcp.local`);
    this.browser = this.bonjour.find({
      type: BONJOUR_SERVICE_TYPE,
      protocol: 'tcp',
    });

    this.browser.on('up', (service: Service) => {
      this.handleServiceUp(service, 'up');
    });

    this.browser.on('txt-update', (service: Service) => {
      this.handleServiceUp(service, 'txt-update');
    });

    this.browser.on('srv-update', (service: Service) => {
      this.handleServiceUp(service, 'srv-update');
    });

    this.browser.on('down', (service: Service) => {
      this.handleServiceDown(service);
    });

    // Start browsing for Anonymous Rooms on LAN
    console.log(`[Subnet:Discovery] Starting mDNS browser for _${BONJOUR_ROOM_SERVICE_TYPE}._tcp.local`);
    this.roomBrowser = this.bonjour.find({
      type: BONJOUR_ROOM_SERVICE_TYPE,
      protocol: 'tcp',
    });

    this.roomBrowser.on('up', (service: Service) => {
      this.handleRoomServiceUp(service, 'up');
    });

    this.roomBrowser.on('txt-update', (service: Service) => {
      this.handleRoomServiceUp(service, 'txt-update');
    });

    this.roomBrowser.on('srv-update', (service: Service) => {
      this.handleRoomServiceUp(service, 'srv-update');
    });

    this.roomBrowser.on('down', (service: Service) => {
      this.handleRoomServiceDown(service);
    });

    // Periodic mDNS query refresh (ensures symmetrical discovery across multiple instances)
    this.queryInterval = setInterval(() => {
      if (this.browser) {
        this.browser.update();
      }
      if (this.roomBrowser) {
        this.roomBrowser.update();
      }
    }, 3500);
  }

  public publishAnonymousRoom(room: { id: string; name: string; capacity?: number; occupancy?: number }): void {
    if (!this.bonjour) return;
    const existing = this.publishedRoomServices.get(room.id);
    if (existing) {
      existing.txt = {
        ...existing.txt,
        cap: String(room.capacity || 0),
        occ: String(room.occupancy || 1),
      };
      return;
    }
    const instanceName = `SubnetRoom-${room.id.slice(0, 8)}`;
    console.log(
      `[Subnet:Discovery] Publishing anonymous room "${room.name}" (${room.id.slice(0, 8)}) on port ${this.port}`
    );
    const service = this.bonjour.publish({
      name: instanceName,
      type: BONJOUR_ROOM_SERVICE_TYPE,
      protocol: 'tcp',
      port: this.port,
      txt: {
        id: room.id,
        name: room.name,
        hostId: this.localPeerId,
        cap: String(room.capacity || 0),
        occ: String(room.occupancy || 1),
        v: PROTOCOL_VERSION,
      },
    });
    this.publishedRoomServices.set(room.id, service);
  }

  public async unpublishAnonymousRoom(roomId: string): Promise<void> {
    const service = this.publishedRoomServices.get(roomId);
    if (!service) return;
    this.publishedRoomServices.delete(roomId);
    return new Promise<void>((resolve) => {
      service.stop(() => resolve());
    });
  }

  private handleRoomServiceUp(service: Service, eventSource: string): void {
    const txt = service.txt || {};
    const roomId = typeof txt.id === 'string' ? txt.id.trim() : null;
    const roomName = typeof txt.name === 'string' ? txt.name.trim() : null;
    const hostId = typeof txt.hostId === 'string' ? txt.hostId.trim() : null;

    if (!roomId || !roomName || !hostId) {
      return;
    }

    // Ignore self-published room
    if (hostId === this.localPeerId) {
      return;
    }

    if (service.fqdn) this.roomFqdnToRoomId.set(service.fqdn, roomId);
    if (service.name) this.roomNameToRoomId.set(service.name, roomId);

    const capacity = parseInt(txt.cap || '0', 10) || undefined;
    const occupancy = parseInt(txt.occ || '1', 10) || 1;
    const hostAddress = this.selectBestIp(service);

    const discovered: DiscoveredRoom = {
      id: roomId,
      name: roomName,
      hostId,
      hostAddress,
      hostPort: service.port,
      capacity,
      occupancy,
      isJoinable: !capacity || occupancy < capacity,
      lastSeen: Date.now(),
    };

    console.log(
      `[Subnet:Discovery] Discovered anonymous room "${roomName}" (${roomId.slice(0, 8)}) hosted by ${hostId.slice(0, 8)} at ${hostAddress}:${service.port}`
    );

    if (this.onRoomDiscoveredCb) {
      this.onRoomDiscoveredCb(discovered);
    }
  }

  private handleRoomServiceDown(service: Service): void {
    let roomId: string | null = null;
    if (service.txt && typeof service.txt.id === 'string' && service.txt.id.trim()) {
      roomId = service.txt.id.trim();
    } else if (service.fqdn && this.roomFqdnToRoomId.has(service.fqdn)) {
      roomId = this.roomFqdnToRoomId.get(service.fqdn)!;
    } else if (service.name && this.roomNameToRoomId.has(service.name)) {
      roomId = this.roomNameToRoomId.get(service.name)!;
    }

    if (!roomId) return;

    if (service.fqdn) this.roomFqdnToRoomId.delete(service.fqdn);
    if (service.name) this.roomNameToRoomId.delete(service.name);

    console.log(`[Subnet:Discovery] Room service down: ${roomId.slice(0, 8)}`);

    if (this.onRoomLostCb) {
      this.onRoomLostCb(roomId);
    }
  }

  private handleServiceUp(service: Service, eventSource: string): void {
    console.log(
      `[Subnet:Discovery] Event "${eventSource}" for service "${service.name}" (port: ${service.port}, addresses: ${JSON.stringify(service.addresses || [])}, txt: ${JSON.stringify(service.txt || {})})`
    );

    const peer = this.extractPeerFromService(service);
    if (!peer) {
      console.log(`[Subnet:Discovery] Skipped service "${service.name}": unable to extract peer ID`);
      return;
    }

    // Filter out our own advertised instance
    if (peer.id === this.localPeerId) {
      console.log(`[Subnet:Discovery] Self-filtering: ignored local instance "${service.name}" (${peer.id.slice(0, 8)})`);
      return;
    }

    // Store mapping for graceful departure handling
    if (service.fqdn) {
      this.serviceFqdnToPeerId.set(service.fqdn, peer.id);
    }
    if (service.name) {
      this.serviceNameToPeerId.set(service.name, peer.id);
    }

    console.log(
      `[Subnet:Discovery] -> Verified peer: "${peer.name}" (${peer.id.slice(0, 8)}) at ${peer.host}:${peer.port}`
    );

    if (this.onPeerDiscoveredCb) {
      this.onPeerDiscoveredCb(peer);
    }
  }

  private handleServiceDown(service: Service): void {
    const peerId = this.resolvePeerIdForDownService(service);
    console.log(`[Subnet:Discovery] Service down: "${service.name}" (resolved peerId: ${peerId ? peerId.slice(0, 8) : 'unknown'})`);

    if (!peerId || peerId === this.localPeerId) {
      return;
    }

    // Clean up mapping
    if (service.fqdn) this.serviceFqdnToPeerId.delete(service.fqdn);
    if (service.name) this.serviceNameToPeerId.delete(service.name);

    if (this.onPeerLostCb) {
      this.onPeerLostCb(peerId);
    }
  }

  private resolvePeerIdForDownService(service: Service): string | null {
    // 1. Direct TXT id if present in goodbye packet
    if (service.txt && typeof service.txt.id === 'string' && service.txt.id.trim()) {
      return service.txt.id.trim();
    }
    // 2. FQDN cache lookup
    if (service.fqdn && this.serviceFqdnToPeerId.has(service.fqdn)) {
      return this.serviceFqdnToPeerId.get(service.fqdn)!;
    }
    // 3. Service name cache lookup
    if (service.name && this.serviceNameToPeerId.has(service.name)) {
      return this.serviceNameToPeerId.get(service.name)!;
    }
    return null;
  }

  /**
   * Extracts clean Peer object from Bonjour Service record.
   */
  public extractPeerFromService(service: Service): Peer | null {
    const txt = service.txt || {};
    const id = typeof txt.id === 'string' ? txt.id.trim() : null;
    const name = typeof txt.name === 'string' && txt.name.trim().length > 0
      ? txt.name.trim()
      : service.name;

    if (!id) {
      return null;
    }

    const host = this.selectBestIp(service);

    return {
      id,
      name,
      host,
      port: service.port,
      lastSeen: Date.now(),
    };
  }

  /**
   * Selects the best routable IPv4 address from service record.
   */
  private selectBestIp(service: Service): string {
    const addresses = service.addresses || [];

    // Filter for IPv4 addresses
    const ipv4s = addresses.filter((addr) => {
      return (
        typeof addr === 'string' &&
        addr.includes('.') &&
        !addr.startsWith('127.')
      );
    });

    // Prefer non-link-local (not 169.254.x.x)
    const routable = ipv4s.find((addr) => !addr.startsWith('169.254.'));
    if (routable) return routable;
    if (ipv4s.length > 0) return ipv4s[0];

    // Fallback to referer or hostname
    if (service.referer?.address) {
      return service.referer.address;
    }
    return service.host || '127.0.0.1';
  }

  /**
   * Cleanly unpublishes service and destroys the Bonjour instance.
   */
  public async stop(): Promise<void> {
    if (this.queryInterval) {
      clearInterval(this.queryInterval);
      this.queryInterval = null;
    }

    if (this.browser) {
      this.browser.stop();
      this.browser = null;
    }

    if (this.roomBrowser) {
      this.roomBrowser.stop();
      this.roomBrowser = null;
    }

    for (const [roomId, service] of this.publishedRoomServices.entries()) {
      await new Promise<void>((resolve) => {
        service.stop(() => resolve());
      });
    }
    this.publishedRoomServices.clear();

    if (this.publishedService) {
      await new Promise<void>((resolve) => {
        if (this.publishedService) {
          this.publishedService.stop(() => resolve());
        } else {
          resolve();
        }
      });
      this.publishedService = null;
    }

    if (this.bonjour) {
      this.bonjour.destroy();
      this.bonjour = null;
    }

    this.serviceFqdnToPeerId.clear();
    this.serviceNameToPeerId.clear();
    this.roomFqdnToRoomId.clear();
    this.roomNameToRoomId.clear();
  }
}
