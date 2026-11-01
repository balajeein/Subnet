import { Bonjour, Service } from 'bonjour-service';
import { BONJOUR_PRESENCE_SERVICE_TYPE } from './protocol';

export type PresenceServerFoundCallback = (serverUrl: string) => void;
export type PresenceServerLostCallback = () => void;

/**
 * Finds an ephemeral presence server advertised on the local network.
 *
 * This removes the need to type a server IP for local testing. A configured
 * ws:// or wss:// URL still takes precedence for campus or hosted deployments,
 * because mDNS is commonly blocked across VLANs and routed networks.
 */
export class PresenceServerDiscovery {
  private bonjour: Bonjour | null = null;
  private browser: ReturnType<Bonjour['find']> | null = null;
  private readonly servers = new Map<string, string>();
  private selectedKey: string | null = null;
  private selectedUrl: string | null = null;
  private onFound?: PresenceServerFoundCallback;
  private onLost?: PresenceServerLostCallback;

  public async start(
    onFound: PresenceServerFoundCallback,
    onLost: PresenceServerLostCallback
  ): Promise<void> {
    if (this.browser) return;
    this.onFound = onFound;
    this.onLost = onLost;
    this.bonjour = new Bonjour({}, (error: unknown) => {
      const networkError = error as NodeJS.ErrnoException;
      if (['EHOSTUNREACH', 'ENETUNREACH', 'ENETDOWN', 'EADDRNOTAVAIL'].includes(networkError.code || '')) {
        return;
      }
      console.warn('[Subnet:Presence] Bonjour server discovery error:', networkError.message || networkError);
    });

    this.browser = this.bonjour.find({
      type: BONJOUR_PRESENCE_SERVICE_TYPE,
      protocol: 'tcp',
    });
    this.browser.on('up', (service: Service) => this.handleServiceUp(service));
    this.browser.on('srv-update', (service: Service) => this.handleServiceUp(service));
    this.browser.on('down', (service: Service) => this.handleServiceDown(service));
  }

  public async stop(): Promise<void> {
    const browser = this.browser;
    this.browser = null;
    if (browser) browser.stop();
    this.bonjour?.destroy();
    this.bonjour = null;
    this.servers.clear();
    this.selectedKey = null;
    this.selectedUrl = null;
    this.onFound = undefined;
    this.onLost = undefined;
  }

  private handleServiceUp(service: Service): void {
    const url = this.getServiceUrl(service);
    if (!url) return;
    const key = service.fqdn || service.name || url;
    this.servers.set(key, url);
    this.selectServer();
  }

  private handleServiceDown(service: Service): void {
    const key = service.fqdn || service.name;
    if (key) this.servers.delete(key);
    this.selectServer();
  }

  private selectServer(): void {
    const next = [...this.servers.entries()].sort(([a], [b]) => a.localeCompare(b))[0];
    const nextKey = next?.[0] || null;
    const nextUrl = next?.[1] || null;
    if (nextKey === this.selectedKey && nextUrl === this.selectedUrl) return;

    const hadServer = Boolean(this.selectedUrl);
    this.selectedKey = nextKey;
    this.selectedUrl = nextUrl;
    if (nextUrl) {
      this.onFound?.(nextUrl);
    } else if (hadServer) {
      this.onLost?.();
    }
  }

  private getServiceUrl(service: Service): string | null {
    if (!Number.isInteger(service.port) || service.port < 1 || service.port > 65535) return null;
    const address = (service.addresses || []).find(
      (candidate) => /^\d{1,3}(?:\.\d{1,3}){3}$/.test(candidate) && candidate !== '0.0.0.0'
    ) || service.host;
    if (!address || address === '0.0.0.0') return null;
    return `ws://${address}:${service.port}`;
  }
}
