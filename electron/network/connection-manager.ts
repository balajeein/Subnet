import { WebSocketServer, WebSocket } from 'ws';
import { EventEmitter } from 'events';
import os from 'os';
import crypto from 'crypto';
import { AddressInfo } from 'net';
import { BonjourDiscovery } from './bonjour-discovery';
import { PeerConnection } from './peer-connection';
import {
  isPeerIdTieWinner,
  MAX_MESSAGE_SIZE,
  MessagePayload,
  MessageAckPayload,
  InvitationPayload,
  InvitationResponsePayload,
  ConversationEndPayload,
  RoomInvitationPayload,
  RoomInvitationResponsePayload,
  RoomJoinPayload,
  RoomJoinResponsePayload,
  RoomMessagePayload,
  RoomLeavePayload,
  RoomMemberUpdatePayload,
  RoomClosePayload,
  validateNickname,
  ProfileAvatarMetadata,
  ProfileUpdatePayload,
  FileAttachmentMetadata,
  FileRequestPayload,
  FileChunkPayload,
  FileCompletePayload,
  FileCancelPayload,
} from './protocol';
import { ChatStore, StoredRoom, RoomMember, UserSettings } from '../store/chat-store';
import { FileTransferManager, TransferProgressEvent } from './transfer-manager';
import type {
  LocalProfile,
  NetworkStatus,
  Peer,
  Message,
  MessageAck,
  Invitation,
  InvitationResponse,
  ConversationSummary,
  RoomSummary,
  RoomMessage,
  RoomInvitation,
  DiscoveredRoom,
} from '../../src/types/subnet';

export class ConnectionManager extends EventEmitter {
  private localProfile: LocalProfile;
  private wss: WebSocketServer | null = null;
  private bonjour: BonjourDiscovery | null = null;
  private port = 0;
  private localIp = '127.0.0.1';
  private isRunning = false;

  // Persistence store
  private chatStore: ChatStore;

  // File Transfer Engine
  private transferManager: FileTransferManager;

  // Active chat peer in the UI (for unread count tracking)
  private currentlyActiveChatPeerId: string | null = null;

  // Active room in the UI (for unread count tracking)
  private currentlyActiveRoomId: string | null = null;

  // Discovered peers from Bonjour: peerId -> Peer
  private discoveredPeers: Map<string, Peer> = new Map();

  // Discovered anonymous rooms from Bonjour: roomId -> DiscoveredRoom
  private discoveredRooms: Map<string, DiscoveredRoom> = new Map();

  // Active verified connections: peerId -> PeerConnection
  private activeConnections: Map<string, PeerConnection> = new Map();

  // In-flight outbound connection attempts: peerId -> PeerConnection
  private pendingOutbound: Map<string, PeerConnection> = new Map();

  // Deduplication cache for incoming message IDs
  private receivedMessageIds: Set<string> = new Set();
  private readonly maxTrackedMessageIds = 1000;

  // Rate-limiting and duplicate suppression for invitations
  private processedInvitationIds: Set<string> = new Set();
  private processedEndEventIds: Set<string> = new Set();
  private lastInvitationTimeByPeer: Map<string, number> = new Map();
  private readonly invitationRateLimitMs = 2000;

  // Pending room join requests waiting for host confirmation
  private pendingRoomJoins: Map<
    string,
    { resolve: (val: { success: boolean; error?: string }) => void; timer: NodeJS.Timeout }
  > = new Map();

  // Closed room IDs for synchronization with reconnecting peers and offline devices
  private closedRoomIds: Set<string> = new Set();

  constructor(localProfile: LocalProfile, customChatStore?: ChatStore) {
    super();
    this.localProfile = localProfile;
    this.chatStore = customChatStore || new ChatStore();
    for (const id of this.chatStore.getClosedRoomIds()) {
      this.closedRoomIds.add(id);
    }

    this.transferManager = new FileTransferManager();
    this.transferManager.on('progress', (progress: TransferProgressEvent) => {
      this.handleTransferProgress(progress);
    });
  }

  public isPeerConnected(peerId: string): boolean {
    const conn = this.activeConnections.get(peerId);
    return conn !== undefined && conn.state === 'connected';
  }

  public getChatStore(): ChatStore {
    return this.chatStore;
  }

  public setActiveChatPeerId(peerId: string | null): void {
    this.currentlyActiveChatPeerId = peerId;
    if (peerId) {
      this.currentlyActiveRoomId = null;
      this.chatStore.markConversationRead(peerId);
      this.emit('conversations-updated', this.chatStore.getConversations());
    }
  }

  public setActiveRoomId(roomId: string | null): void {
    this.currentlyActiveRoomId = roomId;
    if (roomId) {
      this.currentlyActiveChatPeerId = null;
      this.chatStore.markRoomRead(roomId);
      this.emit('rooms-updated', this.chatStore.getRooms(this.localProfile.id));
    }
  }

  /**
   * Starts the local WebSocket server and Bonjour discovery engine.
   */
  public async start(): Promise<NetworkStatus> {
    if (this.isRunning) {
      return this.getNetworkStatus();
    }

    this.localIp = this.detectLocalIpAddress();

    // 1. Initialize WebSocket Server on an OS-assigned ephemeral port (port: 0)
    await this.startWebSocketServer();

    console.log(
      `[Subnet:Connection] WebSocket server listening on ${this.localIp}:${this.port} (instance: ${this.localProfile.name}, peerId: ${this.localProfile.id.slice(0, 8)})`
    );

    // 2. Initialize and start Bonjour mDNS discovery
    this.bonjour = new BonjourDiscovery({
      localPeerId: this.localProfile.id,
      displayName: this.localProfile.name,
      port: this.port,
      discoverable: this.chatStore.getSettings().peopleCanFindMe !== false,
    });

    await this.bonjour.start(
      (peer: Peer) => this.handlePeerDiscovered(peer),
      (peerId: string) => this.handlePeerLost(peerId),
      (room: DiscoveredRoom) => this.handleRoomDiscovered(room),
      (roomId: string) => this.handleRoomLost(roomId)
    );

    this.isRunning = true;
    this.emitStatusChanged();

    return this.getNetworkStatus();
  }

  private startWebSocketServer(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.wss = new WebSocketServer({
          port: 0, // OS selects free ephemeral port
          maxPayload: MAX_MESSAGE_SIZE,
        });

        this.wss.on('listening', () => {
          const addr = this.wss?.address() as AddressInfo;
          this.port = addr.port;
          resolve();
        });

        this.wss.on('connection', (socket: WebSocket) => {
          this.handleInboundSocket(socket);
        });

        this.wss.on('error', (err) => {
          console.error(`[Subnet:Connection] WebSocket server error:`, err);
          reject(err);
        });
      } catch (err) {
        reject(err);
      }
    });
  }

  private handleInboundSocket(socket: WebSocket): void {
    console.log(`[Subnet:Connection] Incoming connection received on local port ${this.port}`);
    const settings = this.chatStore.getSettings();
    const localAvatar: ProfileAvatarMetadata | undefined =
      settings.shareAvatarWithPeers !== false && settings.avatarType !== 'default'
        ? { avatarType: settings.avatarType, avatarValue: settings.avatarValue }
        : undefined;
    const conn = new PeerConnection(socket, 'inbound', this.localProfile, localAvatar);

    conn.on('connected', (remotePeer) => {
      if (!remotePeer) return;
      const remotePeerId = remotePeer.peerId;

      console.log(
        `[Subnet:Connection] Inbound connection handshake completed with peer "${remotePeer.name}" (${remotePeerId.slice(0, 8)})`
      );

      // Duplicate connection check & tie-breaking
      const existingActive = this.activeConnections.get(remotePeerId);
      const existingPending = this.pendingOutbound.get(remotePeerId);

      if (existingActive || existingPending) {
        const isLocalWinner = isPeerIdTieWinner(this.localProfile.id, remotePeerId);

        if (isLocalWinner) {
          if (existingPending && existingPending.state !== 'closed') {
            console.log(
              `[Subnet:TieBreaker] Local won tie-break (${this.localProfile.id.slice(0, 8)} < ${remotePeerId.slice(0, 8)}). Closing redundant inbound socket and preserving outbound.`
            );
            conn.close(1000, 'duplicate_tie_break');
            return;
          } else if (existingActive && existingActive.state === 'connected') {
            console.log(
              `[Subnet:TieBreaker] Local already has connected socket with ${remotePeerId.slice(0, 8)}. Closing redundant inbound socket.`
            );
            conn.close(1000, 'duplicate_tie_break');
            return;
          }
        } else {
          console.log(
            `[Subnet:TieBreaker] Remote won tie-break (${remotePeerId.slice(0, 8)} < ${this.localProfile.id.slice(0, 8)}). Dropping outbound socket and accepting inbound.`
          );
          if (existingActive) {
            existingActive.close(1000, 'duplicate_tie_break');
          }
          if (existingPending) {
            existingPending.close(1000, 'duplicate_tie_break');
            this.pendingOutbound.delete(remotePeerId);
          }
        }
      }

      this.activeConnections.set(remotePeerId, conn);

      // Cache peer avatar and display name
      const peerInfo = remotePeer || conn.remotePeer;
      if (peerInfo) {
        let peer = this.discoveredPeers.get(remotePeerId);
        if (peer) {
          if (peerInfo.name) peer.name = peerInfo.name;
          if (peerInfo.avatar) peer.avatar = peerInfo.avatar;
        } else {
          peer = {
            id: remotePeerId,
            name: peerInfo.name,
            avatar: peerInfo.avatar,
          };
          this.discoveredPeers.set(remotePeerId, peer);
        }
        this.chatStore.updatePeerProfile(remotePeerId, peerInfo.name, peerInfo.avatar);
        this.emit('peer-updated', peer);
        this.emit('peers-discovered', Array.from(this.discoveredPeers.values()));
        this.emit('conversations-updated', this.chatStore.getConversations());
        this.emit('rooms-updated', this.chatStore.getRooms(this.localProfile.id));
      }

      this.attachConnectionListeners(remotePeerId, conn);
      this.syncClosedRoomsToPeer(conn);
      this.emit('peer-connected', remotePeerId);
    });

    conn.on('close', () => {
      if (conn.remotePeer?.peerId) {
        const closedPeerId = conn.remotePeer.peerId;
        if (this.activeConnections.get(closedPeerId) === conn) {
          this.activeConnections.delete(closedPeerId);
          this.emit('peer-disconnected', closedPeerId);
          this.checkHostOfflineForRooms(closedPeerId);
          this.transferManager.cancelTransfersForPeer(closedPeerId, 'Peer disconnected from network');
        }
      }
    });
  }

  /**
   * Connects outbound to a discovered peer if not already connected.
   */
  public async connectToPeer(peerId: string): Promise<PeerConnection | null> {
    const existing = this.activeConnections.get(peerId);
    if (existing && existing.state === 'connected') {
      return existing;
    }

    const pending = this.pendingOutbound.get(peerId);
    if (pending && pending.state !== 'closed') {
      return pending;
    }

    const peer = this.discoveredPeers.get(peerId);
    if (!peer || !peer.host || !peer.port) {
      console.log(`[Subnet:Connection] Cannot connect to peer ${peerId.slice(0, 8)}: missing host/port`);
      return null;
    }

    return this.connectToAddress(peerId, peer.host, peer.port, peer.name);
  }

  public async connectToAddress(
    peerId: string,
    host: string,
    port: number,
    displayName?: string
  ): Promise<PeerConnection | null> {
    const existing = this.activeConnections.get(peerId);
    if (existing && existing.state === 'connected') {
      return existing;
    }

    const pending = this.pendingOutbound.get(peerId);
    if (pending && pending.state !== 'closed') {
      return pending;
    }

    const targetUrl = `ws://${host}:${port}`;
    console.log(
      `[Subnet:Connection] Initiating outbound WebSocket connection to ${targetUrl} (target: "${displayName || peerId.slice(0, 8)}")`
    );

    try {
      const socket = new WebSocket(targetUrl, {
        maxPayload: MAX_MESSAGE_SIZE,
      });

      const settings = this.chatStore.getSettings();
      const localAvatar: ProfileAvatarMetadata | undefined =
        settings.shareAvatarWithPeers !== false && settings.avatarType !== 'default'
          ? { avatarType: settings.avatarType, avatarValue: settings.avatarValue }
          : undefined;
      const conn = new PeerConnection(socket, 'outbound', this.localProfile, localAvatar);
      this.pendingOutbound.set(peerId, conn);

      conn.on('connected', (remotePeer) => {
        this.pendingOutbound.delete(peerId);

        const currentActive = this.activeConnections.get(peerId);
        if (currentActive && currentActive !== conn) {
          const isLocalWinner = isPeerIdTieWinner(this.localProfile.id, peerId);
          if (!isLocalWinner) {
            console.log(
              `[Subnet:TieBreaker] Outbound connected, but remote won tie-break. Closing outbound socket.`
            );
            conn.close(1000, 'duplicate_tie_break');
            return;
          } else {
            console.log(
              `[Subnet:TieBreaker] Outbound connected and local won tie-break. Replacing inbound with canonical outbound.`
            );
            currentActive.close(1000, 'duplicate_tie_break');
          }
        }

        this.activeConnections.set(peerId, conn);

        // Cache peer avatar and display name
        const peerInfo = remotePeer || conn.remotePeer;
        if (peerInfo) {
          let peer = this.discoveredPeers.get(peerId);
          if (peer) {
            if (peerInfo.name) peer.name = peerInfo.name;
            if (peerInfo.avatar) peer.avatar = peerInfo.avatar;
          } else {
            peer = {
              id: peerId,
              name: peerInfo.name || displayName || 'Nearby Peer',
              avatar: peerInfo.avatar,
            };
            this.discoveredPeers.set(peerId, peer);
          }
          this.chatStore.updatePeerProfile(peerId, peerInfo.name, peerInfo.avatar);
          this.emit('peer-updated', peer);
          this.emit('peers-discovered', Array.from(this.discoveredPeers.values()));
          this.emit('conversations-updated', this.chatStore.getConversations());
          this.emit('rooms-updated', this.chatStore.getRooms(this.localProfile.id));
        }

        this.attachConnectionListeners(peerId, conn);
        this.syncClosedRoomsToPeer(conn);
        console.log(
          `[Subnet:Connection] Outbound connection verified and active for target "${displayName || peerId.slice(0, 8)}"`
        );
        this.emit('peer-connected', peerId);
      });

      conn.on('close', () => {
        this.pendingOutbound.delete(peerId);
        if (this.activeConnections.get(peerId) === conn) {
          this.activeConnections.delete(peerId);
          this.emit('peer-disconnected', peerId);
          this.checkHostOfflineForRooms(peerId);
        }
      });

      conn.on('error', (err) => {
        console.log(
          `[Subnet:Connection] Outbound socket error for target "${displayName || peerId.slice(0, 8)}": ${err.message}`
        );
        this.pendingOutbound.delete(peerId);
      });

      return conn;
    } catch (err: any) {
      console.error(`[Subnet:Connection] Failed to instantiate WebSocket client:`, err.message);
      return null;
    }
  }

  /**
   * Helper to ensure an active connected socket to a peer or room host exists.
   */
  private async ensureActiveConnection(peerId: string): Promise<PeerConnection | null> {
    let conn = this.activeConnections.get(peerId);
    if (!conn || conn.state !== 'connected') {
      const peer = this.discoveredPeers.get(peerId);
      if (peer && peer.host && peer.port) {
        conn = (await this.connectToPeer(peerId)) ?? undefined;
      } else {
        const room = Array.from(this.discoveredRooms.values()).find((r) => r.hostId === peerId);
        if (room && room.hostAddress && room.hostPort) {
          conn = (await this.connectToAddress(peerId, room.hostAddress, room.hostPort, room.name)) ?? undefined;
        }
      }

      if (conn && conn.state !== 'connected') {
        await new Promise<void>((resolve) => {
          const timeout = setTimeout(resolve, 2500);
          conn!.once('connected', () => {
            clearTimeout(timeout);
            resolve();
          });
          conn!.once('close', () => {
            clearTimeout(timeout);
            resolve();
          });
        });
      }
    }
    const active = this.activeConnections.get(peerId);
    return active && active.state === 'connected' ? active : null;
  }

  private checkHostOfflineForRooms(peerId: string): void {
    const rooms = this.chatStore.getRooms(this.localProfile.id);
    let updatedRooms = false;
    for (const r of rooms) {
      if (r.hostId === peerId && r.status === 'joined') {
        this.chatStore.setRoomStatus(r.id, 'closed');
        console.log(
          `[Subnet:Room] Host ${peerId.slice(0, 8)} offline. Marked room "${r.name}" (${r.id.slice(0, 8)}) closed.`
        );
        updatedRooms = true;
      }
    }
    if (updatedRooms) {
      this.emit('rooms-updated', this.chatStore.getRooms(this.localProfile.id));
    }
  }

  /**
   * Sends a direct text message or creates an invitation if conversation is not yet accepted.
   */
  public async sendMessage(
    recipientId: string,
    text: string,
    attachment?: FileAttachmentMetadata,
    localAttachmentPath?: string
  ): Promise<{ success: boolean; messageId?: string; error?: string; isInvitation?: boolean }> {
    if (!recipientId || typeof recipientId !== 'string' || !recipientId.trim()) {
      return { success: false, error: 'Recipient ID must be a non-empty string' };
    }
    const hasText = Boolean(text && typeof text === 'string' && text.trim());
    if (!hasText && !attachment) {
      return { success: false, error: 'Message text cannot be empty' };
    }
    if (text && text.length > 5000) {
      return { success: false, error: 'Message exceeds maximum length of 5000 characters' };
    }

    const trimmedRecipient = recipientId.trim();
    const trimmedText = hasText ? text.trim() : '';

    const currentConn = this.activeConnections.get(trimmedRecipient);
    const peer = this.discoveredPeers.get(trimmedRecipient);
    if (!peer && (!currentConn || currentConn.state !== 'connected')) {
      return { success: false, error: 'User is not discovered or offline on local network' };
    }
    const peerDisplayName = peer?.name || currentConn?.remotePeer?.name || 'Nearby Peer';

    const activeConn = await this.ensureActiveConnection(trimmedRecipient);
    if (!activeConn) {
      return { success: false, error: 'Failed to establish connection to user on LAN' };
    }

    let conv = this.chatStore.getConversation(trimmedRecipient);

    // Auto-accept pending direct invitation if the user explicitly initiates a reply/message
    const pendingInv = conv?.pendingInvitation;

    if (pendingInv && conv?.status === 'pending_incoming') {
      console.log(
        `[Subnet:Message] Auto-accepting pending invitation ${pendingInv.id.slice(0, 8)} from ${trimmedRecipient.slice(0, 8)} upon reply`
      );
      const acceptRes = await this.respondToInvitation(pendingInv.id, true);
      if (!acceptRes.success) {
        return { success: false, error: acceptRes.error || 'Failed to auto-accept pending invitation' };
      }
      conv = this.chatStore.getConversation(trimmedRecipient);
    }

    const isAccepted = conv && conv.status === 'accepted';

    if (!isAccepted) {
      if (conv?.status === 'pending_outgoing' && conv.pendingInvitation) {
      return { success: false, error: 'A chat invitation is already pending for this user' };
      }

      const invitationId = crypto.randomUUID();
      const invitationText = trimmedText || (attachment ? `Sent a file: ${attachment.fileName}` : 'Chat invitation');
      const invitation: Invitation = {
        id: invitationId,
        senderId: this.localProfile.id,
        senderName: this.localProfile.name,
        recipientId: trimmedRecipient,
        text: invitationText,
        timestamp: Date.now(),
        status: 'pending',
      };

      const envelope: InvitationPayload = {
        type: 'invitation',
        id: invitation.id,
        senderId: invitation.senderId,
        senderName: invitation.senderName,
        recipientId: invitation.recipientId,
        text: invitation.text,
        timestamp: invitation.timestamp,
      };

      const sent = activeConn.sendEnvelope(envelope);
      if (!sent) {
        return { success: false, error: 'Socket error: failed to transmit invitation' };
      }

      this.chatStore.createOutgoingInvitation(trimmedRecipient, peerDisplayName, invitation);
      this.emit('conversations-updated', this.chatStore.getConversations());

      console.log(
        `[Subnet:Invitation] Sent chat invitation ${invitationId.slice(0, 8)} to peer "${peerDisplayName}" (${trimmedRecipient.slice(0, 8)})`
      );

      return { success: true, messageId: invitationId, isInvitation: true };
    }

    const messageId = crypto.randomUUID();
    const envelope: MessagePayload = {
      type: 'message',
      id: messageId,
      senderId: this.localProfile.id,
      recipientId: trimmedRecipient,
      text: trimmedText,
      attachment,
      timestamp: Date.now(),
    };

    const sent = activeConn.sendEnvelope(envelope);
    if (!sent) {
      return { success: false, error: 'Socket error: failed to transmit message packet' };
    }

    const message: Message = {
      id: messageId,
      senderId: this.localProfile.id,
      recipientId: trimmedRecipient,
      text: trimmedText,
      attachment,
      localAttachmentPath,
      transferStatus: attachment ? 'downloaded' : undefined,
      timestamp: envelope.timestamp,
      status: 'sending',
    };

    this.chatStore.addMessage(trimmedRecipient, message, false, peerDisplayName);
    this.emit('conversations-updated', this.chatStore.getConversations());

    console.log(
      `[Subnet:Message] Dispatched message ${messageId.slice(0, 8)} to peer "${peerDisplayName}" (${trimmedRecipient.slice(0, 8)})`
    );

    return { success: true, messageId };
  }

  /**
   * Responds to an incoming chat invitation (Accept or Decline).
   */
  public async respondToInvitation(
    invitationId: string,
    accepted: boolean
  ): Promise<{ success: boolean; error?: string }> {
    if (!invitationId || typeof invitationId !== 'string') {
      return { success: false, error: 'Invalid invitation ID' };
    }

    const found = this.chatStore.findPendingInvitationById(invitationId);
    if (!found) {
      return { success: false, error: 'Invitation not found or already processed' };
    }

    const { peerId, invitation } = found;

    this.chatStore.resolveInvitation(peerId, accepted);

    const activeConn = await this.ensureActiveConnection(peerId);
    if (activeConn) {
      const responseEnvelope: InvitationResponsePayload = {
        type: 'invitation_response',
        invitationId: invitation.id,
        senderId: this.localProfile.id,
        senderName: this.localProfile.name,
        recipientId: peerId,
        accepted,
        timestamp: Date.now(),
      };
      activeConn.sendEnvelope(responseEnvelope);
    }

    if (accepted) {
      const deliveredMsg = this.chatStore.getMessages(peerId).find((m) => m.id === invitation.id);
      if (deliveredMsg) {
        this.emit('message-received', deliveredMsg);
      }
    }

    this.emit('conversations-updated', this.chatStore.getConversations());

    console.log(
      `[Subnet:Invitation] Responded to invitation ${invitationId.slice(0, 8)} from ${peerId.slice(0, 8)}: ${accepted ? 'ACCEPTED' : 'DECLINED'}`
    );

    return { success: true };
  }

  // ==========================================
  // ROOM CREATION & MESSAGING LOGIC
  // ==========================================

  public async createPrivateRoom(
    name: string,
    invitedPeerIds: string[]
  ): Promise<{ success: boolean; roomId?: string; error?: string }> {
    if (!name || typeof name !== 'string' || !name.trim()) {
      return { success: false, error: 'Room name cannot be empty' };
    }
    if (!Array.isArray(invitedPeerIds) || invitedPeerIds.length === 0) {
      return { success: false, error: 'At least one participant must be selected' };
    }

    const roomId = crypto.randomUUID();
    const roomName = name.trim().slice(0, 80);

    const room: StoredRoom = {
      id: roomId,
      name: roomName,
      type: 'private',
      hostId: this.localProfile.id,
      myNickname: this.localProfile.name,
      members: [
        { id: this.localProfile.id, nickname: this.localProfile.name, isHost: true },
      ],
      status: 'joined',
      lastMessage: 'Room created',
      lastTimestamp: Date.now(),
      unreadCount: 0,
      messages: [],
    };

    this.chatStore.saveRoom(room);

    // Send room invitations to all selected peers
    for (const peerId of invitedPeerIds) {
      this.ensureActiveConnection(peerId).then((conn) => {
        if (conn) {
          conn.sendEnvelope({
            type: 'room_invitation',
            id: crypto.randomUUID(),
            roomId,
            roomName,
            roomType: 'private',
            hostId: this.localProfile.id,
            hostName: this.localProfile.name,
            invitedPeerId: peerId,
            timestamp: Date.now(),
          });
        }
      });
    }

    this.emit('rooms-updated', this.chatStore.getRooms(this.localProfile.id));
    console.log(`[Subnet:Room] Created private room "${roomName}" (${roomId.slice(0, 8)})`);
    return { success: true, roomId };
  }

  public async inviteToPrivateRoom(
    roomId: string,
    peerId: string
  ): Promise<{ success: boolean; error?: string }> {
    const trimmedRoomId = typeof roomId === 'string' ? roomId.trim() : '';
    const trimmedPeerId = typeof peerId === 'string' ? peerId.trim() : '';

    if (!trimmedRoomId || !trimmedPeerId) {
      return { success: false, error: 'Room and user are required' };
    }
    if (trimmedPeerId === this.localProfile.id) {
      return { success: false, error: 'You cannot add yourself to the room' };
    }

    const room = this.chatStore.getRoom(trimmedRoomId);
    if (!room) {
      return { success: false, error: 'Room does not exist' };
    }
    if (room.type !== 'private' || room.hostId !== this.localProfile.id) {
      return { success: false, error: 'Only the private room host can add users' };
    }
    if (room.status === 'closed' || this.closedRoomIds.has(room.id) || this.chatStore.isRoomClosed(room.id)) {
      return { success: false, error: 'Room is closed' };
    }
    if (room.members.some((member) => member.id === trimmedPeerId)) {
      return { success: false, error: 'User is already in this room' };
    }

    const connection = await this.ensureActiveConnection(trimmedPeerId);
    if (!connection) {
      return { success: false, error: 'User is no longer available nearby' };
    }

    connection.sendEnvelope({
      type: 'room_invitation',
      id: crypto.randomUUID(),
      roomId: room.id,
      roomName: room.name,
      roomType: 'private',
      hostId: this.localProfile.id,
      hostName: this.localProfile.name,
      invitedPeerId: trimmedPeerId,
      timestamp: Date.now(),
    });

    console.log(
      `[Subnet:Room] Invited user ${trimmedPeerId.slice(0, 8)} to private room ${room.id.slice(0, 8)}`
    );
    return { success: true };
  }

  public async createAnonymousRoom(
    name: string,
    capacity?: number,
    nickname?: string
  ): Promise<{ success: boolean; roomId?: string; error?: string }> {
    if (!name || typeof name !== 'string' || !name.trim()) {
      return { success: false, error: 'Room name cannot be empty' };
    }

    let validCap: number | undefined;
    if (typeof capacity === 'number' && capacity > 0) {
      validCap = Math.max(2, capacity);
    }

    const chosenNick = validateNickname(nickname);
    if (!chosenNick) {
      throw new Error('A valid nickname (3-15 characters) is required to create an anonymous room');
    }
    const roomId = crypto.randomUUID();
    const roomName = name.trim().slice(0, 80);

    const room: StoredRoom = {
      id: roomId,
      name: roomName,
      type: 'anonymous',
      hostId: this.localProfile.id,
      myNickname: chosenNick,
      capacity: validCap,
      members: [
        { id: this.localProfile.id, nickname: chosenNick, isHost: true },
      ],
      status: 'joined',
      lastMessage: 'Room created',
      lastTimestamp: Date.now(),
      unreadCount: 0,
      messages: [],
    };

    this.chatStore.saveRoom(room);

    if (this.bonjour) {
      this.bonjour.publishAnonymousRoom({
        id: roomId,
        name: roomName,
        capacity: validCap,
        occupancy: 1,
      });
    }

    this.emit('rooms-updated', this.chatStore.getRooms(this.localProfile.id));
    console.log(
      `[Subnet:Room] Created anonymous room "${roomName}" (${roomId.slice(0, 8)}) with nickname "${chosenNick}"`
    );
    return { success: true, roomId };
  }

  public getRooms(): RoomSummary[] {
    return this.chatStore.getRooms(this.localProfile.id);
  }

  public getRoomMessages(roomId: string): RoomMessage[] {
    return this.chatStore.getRoomMessages(roomId);
  }

  public async sendRoomMessage(
    roomId: string,
    text: string,
    attachment?: FileAttachmentMetadata,
    localAttachmentPath?: string
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    if (!roomId || typeof roomId !== 'string' || !roomId.trim()) {
      return { success: false, error: 'Invalid room ID' };
    }
    const hasText = Boolean(text && typeof text === 'string' && text.trim());
    if (!hasText && !attachment) {
      return { success: false, error: 'Message text cannot be empty' };
    }
    if (text && text.length > 5000) {
      return { success: false, error: 'Message exceeds maximum length of 5000 characters' };
    }

    if (this.closedRoomIds.has(roomId.trim()) || this.chatStore.isRoomClosed(roomId.trim())) {
      return { success: false, error: 'Room has been closed by host' };
    }

    const room = this.chatStore.getRoom(roomId.trim());
    if (!room) {
      return { success: false, error: 'Room does not exist' };
    }

    if (room.status === 'closed' || this.closedRoomIds.has(room.id) || this.chatStore.isRoomClosed(room.id)) {
      return { success: false, error: 'Room host is offline or room is closed' };
    }

    // Auto-accept room invitation if user participates by sending a message
    if (room.status === 'invited') {
      console.log(
        `[Subnet:Room] Auto-accepting room invitation for ${room.id.slice(0, 8)} upon participation`
      );
      const acceptRes = await this.respondToRoomInvitation(room.id, true);
      if (!acceptRes.success) {
        return {
          success: false,
          error: acceptRes.error || 'Failed to auto-accept room invitation before sending',
        };
      }
    }

    const isPrivate = room.type === 'private';
    const localSettings = this.chatStore.getSettings();
    const senderAvatar: ProfileAvatarMetadata | undefined =
      isPrivate && localSettings.shareAvatarWithPeers !== false && localSettings.avatarType !== 'default'
        ? { avatarType: localSettings.avatarType, avatarValue: localSettings.avatarValue }
        : undefined;

    const messageId = crypto.randomUUID();
    const message: RoomMessage = {
      id: messageId,
      roomId: room.id,
      senderId: this.localProfile.id,
      senderNickname: room.myNickname,
      senderAvatar,
      text: hasText ? text.trim().slice(0, 5000) : '',
      attachment,
      localAttachmentPath,
      transferStatus: attachment ? 'downloaded' : undefined,
      timestamp: Date.now(),
    };

    const envelope: RoomMessagePayload = {
      type: 'room_message',
      id: message.id,
      roomId: message.roomId,
      senderId: message.senderId,
      senderNickname: message.senderNickname,
      senderAvatar,
      text: message.text,
      attachment,
      timestamp: message.timestamp,
    };

    this.chatStore.addRoomMessage(room.id, message, false);

    // If local user is host, relay to all other members in room without duplicates
    if (room.hostId === this.localProfile.id) {
      const sentPeerIds = new Set<string>();
      for (const m of room.members) {
        if (m.id !== this.localProfile.id && !sentPeerIds.has(m.id)) {
          sentPeerIds.add(m.id);
          this.ensureActiveConnection(m.id).then((mConn) => {
            if (mConn) mConn.sendEnvelope(envelope);
          }).catch((err) => {
            console.log(`[Subnet:Room] Notice: could not send room message to peer ${m.id.slice(0, 8)}: ${err.message}`);
          });
        }
      }
    } else {
      // Member sends message directly to host
      const hostConn = await this.ensureActiveConnection(room.hostId);
      if (!hostConn) {
        return { success: false, error: 'Cannot connect to room host on LAN' };
      }
      hostConn.sendEnvelope(envelope);
    }

    this.emit('room-message-received', message);
    this.emit('rooms-updated', this.chatStore.getRooms(this.localProfile.id));

    return { success: true, messageId };
  }

  public async respondToRoomInvitation(
    roomId: string,
    accepted: boolean
  ): Promise<{ success: boolean; error?: string }> {
    if (!roomId || typeof roomId !== 'string') {
      return { success: false, error: 'Invalid room ID' };
    }

    if (this.closedRoomIds.has(roomId.trim()) || this.chatStore.isRoomClosed(roomId.trim())) {
      return { success: false, error: 'Room is closed' };
    }

    const room = this.chatStore.getRoom(roomId.trim());
    if (!room) {
      return { success: false, error: 'Room not found' };
    }

    if (accepted) {
      room.status = 'joined';
      this.chatStore.saveRoom(room);

      const conn = await this.ensureActiveConnection(room.hostId);
      if (conn) {
        conn.sendEnvelope({
          type: 'room_invitation_response',
          invitationId: crypto.randomUUID(),
          roomId: room.id,
          hostId: room.hostId,
          peerId: this.localProfile.id,
          peerName: this.localProfile.name,
          accepted: true,
          timestamp: Date.now(),
        });
      }
    } else {
      room.status = 'declined';
      this.chatStore.saveRoom(room);

      const conn = await this.ensureActiveConnection(room.hostId);
      if (conn) {
        conn.sendEnvelope({
          type: 'room_invitation_response',
          invitationId: crypto.randomUUID(),
          roomId: room.id,
          hostId: room.hostId,
          peerId: this.localProfile.id,
          peerName: this.localProfile.name,
          accepted: false,
          timestamp: Date.now(),
        });
      }
    }

    this.emit('rooms-updated', this.chatStore.getRooms(this.localProfile.id));
    return { success: true };
  }

  public async joinAnonymousRoom(
    roomId: string,
    nickname: string
  ): Promise<{ success: boolean; error?: string }> {
    if (!roomId || typeof roomId !== 'string') {
      return { success: false, error: 'Invalid room ID' };
    }

    if (this.closedRoomIds.has(roomId.trim()) || this.chatStore.isRoomClosed(roomId.trim())) {
      return { success: false, error: 'Room is closed' };
    }

    const validatedNick = validateNickname(nickname);
    if (!validatedNick) {
      return {
        success: false,
        error: 'Nickname must be 3-15 characters (letters, numbers, spaces, dashes, underscores)',
      };
    }

    const discovered = this.discoveredRooms.get(roomId);
    if (!discovered) {
      return { success: false, error: 'Room is no longer available on local network' };
    }

    if (!discovered.isJoinable) {
      return { success: false, error: 'Room is currently at full capacity' };
    }

    let conn = await this.ensureActiveConnection(discovered.hostId);
    if (!conn) {
      conn = (await this.connectToAddress(
        discovered.hostId,
        discovered.hostAddress,
        discovered.hostPort,
        discovered.name
      )) ?? null;
      if (conn && conn.state !== 'connected') {
        await new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, 2500);
          conn!.once('connected', () => {
            clearTimeout(timer);
            resolve();
          });
          conn!.once('close', () => {
            clearTimeout(timer);
            resolve();
          });
        });
      }
    }

    if (!conn || conn.state !== 'connected') {
      return { success: false, error: 'Could not connect to room host on LAN' };
    }

    // Save initial room locally with status pending until host acknowledges
    const room: StoredRoom = {
      id: discovered.id,
      name: discovered.name,
      type: 'anonymous',
      hostId: discovered.hostId,
      myNickname: validatedNick,
      capacity: discovered.capacity,
      members: [
        { id: discovered.hostId, nickname: 'Host', isHost: true },
        { id: this.localProfile.id, nickname: validatedNick },
      ],
      status: 'joined',
      lastMessage: 'Joined anonymous room',
      lastTimestamp: Date.now(),
      unreadCount: 0,
      messages: [],
    };
    this.chatStore.saveRoom(room);

    // Send room_join and wait for confirmation
    return new Promise<{ success: boolean; error?: string }>((resolve) => {
      const timer = setTimeout(() => {
        this.pendingRoomJoins.delete(roomId);
        resolve({ success: false, error: 'Connection timed out waiting for room host response' });
      }, 5000);

      this.pendingRoomJoins.set(roomId, { resolve, timer });

      conn!.sendEnvelope({
        type: 'room_join',
        roomId: discovered.id,
        peerId: this.localProfile.id,
        nickname: validatedNick,
        timestamp: Date.now(),
      });
    });
  }

  public async leaveRoom(roomId: string): Promise<{ success: boolean; error?: string }> {
    const room = this.chatStore.getRoom(roomId);
    if (!room) {
      if (this.closedRoomIds.has(roomId) || this.chatStore.isRoomClosed(roomId)) {
        return { success: true };
      }
      return { success: false, error: 'Room not found' };
    }

    if (room.hostId === this.localProfile.id) {
      // Host closes the room: terminate room for everyone
      this.closedRoomIds.add(roomId);
      this.chatStore.markRoomClosed(roomId);

      if (room.type === 'anonymous' && this.bonjour) {
        await this.bonjour.unpublishAnonymousRoom(roomId);
      }

      // Broadcast room_closed event to all room members
      const closeEnvelope: RoomClosePayload = {
        type: 'room_closed',
        roomId,
        hostId: this.localProfile.id,
        reason: 'Room closed by host',
        timestamp: Date.now(),
      };

      for (const m of room.members) {
        if (m.id !== this.localProfile.id) {
          const mConn = this.activeConnections.get(m.id);
          if (mConn) {
            mConn.sendEnvelope(closeEnvelope);
          }
        }
      }

      // Delete room & local history on host
      this.chatStore.deleteRoom(roomId);
      if (this.currentlyActiveRoomId === roomId) {
        this.currentlyActiveRoomId = null;
      }
      this.emit('room-closed', { roomId, reason: 'Room closed by host' });
    } else {
      // Non-host leaving room: affects only this member
      const hostConn = this.activeConnections.get(room.hostId);
      if (hostConn) {
        hostConn.sendEnvelope({
          type: 'room_leave',
          roomId,
          peerId: this.localProfile.id,
          nickname: room.myNickname,
          timestamp: Date.now(),
        });
      }
      this.chatStore.deleteRoom(roomId);
      if (this.currentlyActiveRoomId === roomId) {
        this.currentlyActiveRoomId = null;
      }
    }

    this.emit('rooms-updated', this.chatStore.getRooms(this.localProfile.id));
    return { success: true };
  }

  public async closeRoom(roomId: string): Promise<{ success: boolean; error?: string }> {
    return this.leaveRoom(roomId);
  }

  public deleteRoom(roomId: string): { success: boolean; error?: string } {
    const room = this.chatStore.getRoom(roomId);
    if (room && room.hostId === this.localProfile.id) {
      // If host deletes the room, trigger room closure
      this.leaveRoom(roomId).catch((err) => {
        console.error(`[Subnet:Room] Error closing room on deleteRoom:`, err);
      });
      return { success: true };
    }

    const deleted = this.chatStore.deleteRoom(roomId);
    if (deleted) {
      if (this.currentlyActiveRoomId === roomId) {
        this.currentlyActiveRoomId = null;
      }
      this.emit('rooms-updated', this.chatStore.getRooms(this.localProfile.id));
    }
    return { success: deleted };
  }

  private handleRoomClosedByHost(roomId: string, hostId: string, reason?: string): void {
    if (!roomId || typeof roomId !== 'string') return;

    const room = this.chatStore.getRoom(roomId);
    if (room && room.hostId !== hostId) {
      console.warn(
        `[Subnet:Room] Security drop: unauthorized room closure from ${hostId.slice(0, 8)} for room ${roomId.slice(0, 8)} hosted by ${room.hostId.slice(0, 8)}`
      );
      return;
    }

    // Idempotently record closure
    this.closedRoomIds.add(roomId);
    this.chatStore.markRoomClosed(roomId);

    // Cancel pending room joins
    const pending = this.pendingRoomJoins.get(roomId);
    if (pending) {
      clearTimeout(pending.timer);
      this.pendingRoomJoins.delete(roomId);
      pending.resolve({ success: false, error: reason || 'Room was closed by host' });
    }

    // Remove from discovered rooms list
    if (this.discoveredRooms.has(roomId)) {
      this.discoveredRooms.delete(roomId);
      this.emit('discovered-rooms-updated', this.getDiscoveredAnonymousRooms());
    }

    // Reset active room if this was the open room
    if (this.currentlyActiveRoomId === roomId) {
      this.currentlyActiveRoomId = null;
    }

    // Delete room and messages from local store
    const wasDeleted = this.chatStore.deleteRoom(roomId);

    if (wasDeleted || room) {
      this.emit('room-closed', { roomId, reason: reason || 'Room closed by host' });
      this.emit('rooms-updated', this.chatStore.getRooms(this.localProfile.id));
    }
  }

  private syncClosedRoomsToPeer(conn: PeerConnection): void {
    if (this.closedRoomIds.size === 0) return;
    for (const closedRoomId of this.closedRoomIds) {
      conn.sendEnvelope({
        type: 'room_closed',
        roomId: closedRoomId,
        hostId: this.localProfile.id,
        reason: 'Room closed by host',
        timestamp: Date.now(),
      });
    }
  }

  public markRoomRead(roomId: string): void {
    this.currentlyActiveRoomId = roomId;
    this.chatStore.markRoomRead(roomId);
    this.emit('rooms-updated', this.chatStore.getRooms(this.localProfile.id));
  }

  public getDiscoveredAnonymousRooms(): DiscoveredRoom[] {
    const now = Date.now();
    const valid: DiscoveredRoom[] = [];
    for (const room of this.discoveredRooms.values()) {
      if (now - room.lastSeen < 30000) {
        valid.push(room);
      }
    }
    return valid;
  }

  private handleRoomDiscovered(room: DiscoveredRoom): void {
    this.discoveredRooms.set(room.id, room);
    this.emit('discovered-rooms-updated', this.getDiscoveredAnonymousRooms());
  }

  private handleRoomLost(roomId: string): void {
    this.discoveredRooms.delete(roomId);
    this.emit('discovered-rooms-updated', this.getDiscoveredAnonymousRooms());
  }

  private attachConnectionListeners(peerId: string, conn: PeerConnection): void {
    conn.on('message', (envelope) => {
      // 1. Handle regular chat messages
      if (envelope.type === 'message') {
        if (envelope.recipientId !== this.localProfile.id) {
          console.log(
            `[Subnet:Message] Security drop: message ${envelope.id.slice(0, 8)} intended for ${envelope.recipientId.slice(0, 8)}, not local profile`
          );
          return;
        }

        const conv = this.chatStore.getConversation(envelope.senderId);
        if (!conv || conv.status !== 'accepted') {
          console.log(
            `[Subnet:Message] Security drop: message ${envelope.id.slice(0, 8)} dropped because conversation with ${envelope.senderId.slice(0, 8)} is not in accepted state`
          );
          return;
        }

        if (this.receivedMessageIds.has(envelope.id)) {
          console.log(
            `[Subnet:Message] Duplicate message ${envelope.id.slice(0, 8)} ignored. Resending acknowledgement...`
          );
          conn.sendEnvelope({
            type: 'ack',
            messageId: envelope.id,
            senderId: this.localProfile.id,
            recipientId: envelope.senderId,
            timestamp: Date.now(),
          });
          return;
        }

        this.trackReceivedMessageId(envelope.id);

        console.log(
          `[Subnet:Message] Received message ${envelope.id.slice(0, 8)} from ${envelope.senderId.slice(0, 8)}: "${envelope.text.slice(0, 30)}"`
        );

        conn.sendEnvelope({
          type: 'ack',
          messageId: envelope.id,
          senderId: this.localProfile.id,
          recipientId: envelope.senderId,
          timestamp: Date.now(),
        });

        const isUnread = this.currentlyActiveChatPeerId !== envelope.senderId;
        const peerName = this.discoveredPeers.get(envelope.senderId)?.name || 'Nearby Peer';

        const message: Message = {
          id: envelope.id,
          senderId: envelope.senderId,
          recipientId: envelope.recipientId,
          text: envelope.text,
          attachment: envelope.attachment,
          transferStatus: envelope.attachment ? 'idle' : undefined,
          timestamp: envelope.timestamp,
          status: 'delivered',
        };

        this.chatStore.addMessage(envelope.senderId, message, isUnread, peerName);
        this.emit('message-received', message);
        this.emit('conversations-updated', this.chatStore.getConversations());
      }

      // 2. Handle message acknowledgements
      else if (envelope.type === 'ack') {
        if (envelope.recipientId !== this.localProfile.id) {
          return;
        }

        this.chatStore.updateMessageStatus(envelope.senderId, envelope.messageId, 'delivered');

        const ack: MessageAck = {
          messageId: envelope.messageId,
          senderId: envelope.senderId,
          recipientId: envelope.recipientId,
          timestamp: envelope.timestamp,
        };

        this.emit('message-ack', ack);
        this.emit('conversations-updated', this.chatStore.getConversations());
      }

      // 3. Handle incoming chat invitations
      else if (envelope.type === 'invitation') {
        if (envelope.recipientId !== this.localProfile.id) {
          console.log(
            `[Subnet:Invitation] Security drop: invitation intended for ${envelope.recipientId.slice(0, 8)}`
          );
          return;
        }

        if (this.processedInvitationIds.has(envelope.id)) {
          return;
        }

        const lastTime = this.lastInvitationTimeByPeer.get(envelope.senderId) || 0;
        const now = Date.now();
        if (now - lastTime < this.invitationRateLimitMs) {
          return;
        }
        this.lastInvitationTimeByPeer.set(envelope.senderId, now);

        const existingConv = this.chatStore.getConversation(envelope.senderId);
        if (existingConv && existingConv.status === 'pending_incoming') {
          return;
        }

        this.processedInvitationIds.add(envelope.id);
        this.trackReceivedMessageId(envelope.id);

        const invitation: Invitation = {
          id: envelope.id,
          senderId: envelope.senderId,
          senderName: envelope.senderName,
          recipientId: envelope.recipientId,
          text: envelope.text,
          timestamp: envelope.timestamp,
          status: 'pending',
        };

        this.chatStore.recordIncomingInvitation(invitation);
        this.emit('invitation-received', invitation);
        this.emit('conversations-updated', this.chatStore.getConversations());
      }

      // 4. Handle incoming invitation responses
      else if (envelope.type === 'invitation_response') {
        if (envelope.recipientId !== this.localProfile.id) {
          return;
        }

        this.chatStore.resolveInvitation(envelope.senderId, envelope.accepted);

        const response: InvitationResponse = {
          invitationId: envelope.invitationId,
          senderId: envelope.senderId,
          senderName: envelope.senderName,
          recipientId: envelope.recipientId,
          accepted: envelope.accepted,
          timestamp: envelope.timestamp,
        };

        this.emit('invitation-response', response);
        this.emit('conversations-updated', this.chatStore.getConversations());
      }

      // 4a. Handle profile metadata updates
      else if (envelope.type === 'profile_update') {
        this.handleRemoteProfileUpdate(envelope);
      }

      // 4b. Handle conversation ended by peer
      else if (envelope.type === 'conversation_end') {
        if (envelope.recipientId !== this.localProfile.id) {
          console.log(
            `[Subnet:Conversation] Security drop: conversation_end intended for ${envelope.recipientId.slice(0, 8)}`
          );
          return;
        }

        if (this.processedEndEventIds.has(envelope.id)) {
          return;
        }
        this.processedEndEventIds.add(envelope.id);

        console.log(
          `[Subnet:Conversation] Received conversation_end from peer ${envelope.senderId.slice(0, 8)}`
        );
        this.deleteConversation(envelope.senderId);
        this.emit('conversation-ended', { peerId: envelope.senderId });
      }

      // 5. Handle incoming private room invitations
      else if (envelope.type === 'room_invitation') {
        if (envelope.invitedPeerId !== this.localProfile.id) {
          return;
        }

        if (this.processedInvitationIds.has(envelope.id)) {
          return;
        }
        this.processedInvitationIds.add(envelope.id);

        const existingRoom = this.chatStore.getRoom(envelope.roomId);
        if (!existingRoom) {
          const newRoom: StoredRoom = {
            id: envelope.roomId,
            name: envelope.roomName,
            type: 'private',
            hostId: envelope.hostId,
            myNickname: this.localProfile.name,
            members: [
              { id: envelope.hostId, nickname: envelope.hostName, isHost: true },
              { id: this.localProfile.id, nickname: this.localProfile.name },
            ],
            status: 'invited',
            lastMessage: `Invited by ${envelope.hostName}`,
            lastTimestamp: envelope.timestamp,
            unreadCount: 1,
            messages: [],
          };
          this.chatStore.saveRoom(newRoom);

          const roomInv: RoomInvitation = {
            id: envelope.id,
            roomId: envelope.roomId,
            roomName: envelope.roomName,
            roomType: 'private',
            hostId: envelope.hostId,
            hostName: envelope.hostName,
            invitedPeerId: envelope.invitedPeerId,
            timestamp: envelope.timestamp,
          };

          this.emit('room-invitation-received', roomInv);
          this.emit('rooms-updated', this.chatStore.getRooms(this.localProfile.id));
        }
      }

      // 6. Handle private room invitation response (Host side)
      else if (envelope.type === 'room_invitation_response') {
        if (this.closedRoomIds.has(envelope.roomId) || this.chatStore.isRoomClosed(envelope.roomId)) {
          conn.sendEnvelope({
            type: 'room_closed',
            roomId: envelope.roomId,
            hostId: this.localProfile.id,
            reason: 'Room has been closed by host',
            timestamp: Date.now(),
          });
          return;
        }

        if (envelope.hostId !== this.localProfile.id) {
          return;
        }

        const room = this.chatStore.getRoom(envelope.roomId);
        if (!room) return;

        if (envelope.accepted) {
          const already = room.members.some((m) => m.id === envelope.peerId);
          if (!already) {
            room.members.push({ id: envelope.peerId, nickname: envelope.peerName });
            this.chatStore.saveRoom(room);

            const updateEnvelope: RoomMemberUpdatePayload = {
              type: 'room_member_update',
              roomId: room.id,
              members: room.members,
              timestamp: Date.now(),
            };

            for (const m of room.members) {
              if (m.id !== this.localProfile.id) {
                const mConn = this.activeConnections.get(m.id);
                if (mConn) mConn.sendEnvelope(updateEnvelope);
              }
            }
            this.emit('rooms-updated', this.chatStore.getRooms(this.localProfile.id));
          }
        }
      }

      // 7. Handle anonymous room join request (Host side)
      else if (envelope.type === 'room_join') {
        if (this.closedRoomIds.has(envelope.roomId) || this.chatStore.isRoomClosed(envelope.roomId)) {
          conn.sendEnvelope({
            type: 'room_closed',
            roomId: envelope.roomId,
            hostId: this.localProfile.id,
            reason: 'Room has been closed by host',
            timestamp: Date.now(),
          });
          return;
        }

        const room = this.chatStore.getRoom(envelope.roomId);
        if (!room || room.type !== 'anonymous') {
          conn.sendEnvelope({
            type: 'room_join_response',
            roomId: envelope.roomId,
            roomName: 'Unknown',
            roomType: 'anonymous',
            success: false,
            error: 'Room not found or not an anonymous room',
            timestamp: Date.now(),
          });
          return;
        }

        if (room.status === 'closed') {
          conn.sendEnvelope({
            type: 'room_join_response',
            roomId: envelope.roomId,
            roomName: room.name,
            roomType: 'anonymous',
            success: false,
            error: 'Room is closed',
            timestamp: Date.now(),
          });
          return;
        }

        if (room.capacity && room.members.length >= room.capacity) {
          conn.sendEnvelope({
            type: 'room_join_response',
            roomId: envelope.roomId,
            roomName: room.name,
            roomType: 'anonymous',
            success: false,
            error: 'Room is at maximum capacity',
            timestamp: Date.now(),
          });
          return;
        }

        const validatedNick = validateNickname(envelope.nickname);
        if (!validatedNick) {
          conn.sendEnvelope({
            type: 'room_join_response',
            roomId: envelope.roomId,
            roomName: room.name,
            roomType: 'anonymous',
            success: false,
            error: 'Nickname must be 3-15 alphanumeric characters, spaces, dashes, or underscores',
            timestamp: Date.now(),
          });
          return;
        }

        // Prevent nickname collisions with other members in the same room
        const collision = room.members.some(
          (m) => m.id !== envelope.peerId && m.nickname.toLowerCase() === validatedNick.toLowerCase()
        );
        if (collision) {
          conn.sendEnvelope({
            type: 'room_join_response',
            roomId: envelope.roomId,
            roomName: room.name,
            roomType: 'anonymous',
            success: false,
            error: `Nickname "${validatedNick}" is already taken in this room. Please choose a different name.`,
            timestamp: Date.now(),
          });
          return;
        }

        // Add or update participant in room (prevents duplicate participant entries on reconnect)
        const existingIdx = room.members.findIndex((m) => m.id === envelope.peerId);
        if (existingIdx >= 0) {
          room.members[existingIdx].nickname = validatedNick;
        } else {
          room.members.push({ id: envelope.peerId, nickname: validatedNick });
        }
        this.chatStore.saveRoom(room);

        // Update Bonjour advertisement with current dynamic occupancy
        if (this.bonjour) {
          this.bonjour.publishAnonymousRoom({
            id: room.id,
            name: room.name,
            capacity: room.capacity,
            occupancy: room.members.length,
          });
        }

        conn.sendEnvelope({
          type: 'room_join_response',
          roomId: room.id,
          roomName: room.name,
          roomType: 'anonymous',
          success: true,
          members: room.members,
          timestamp: Date.now(),
        });

        // Broadcast member update to other participants without duplicates
        const updateEnvelope: RoomMemberUpdatePayload = {
          type: 'room_member_update',
          roomId: room.id,
          members: room.members,
          timestamp: Date.now(),
        };
        const notifiedPeerIds = new Set<string>();
        for (const m of room.members) {
          if (m.id !== this.localProfile.id && m.id !== envelope.peerId && !notifiedPeerIds.has(m.id)) {
            notifiedPeerIds.add(m.id);
            const mConn = this.activeConnections.get(m.id);
            if (mConn) mConn.sendEnvelope(updateEnvelope);
          }
        }

        this.emit('rooms-updated', this.chatStore.getRooms(this.localProfile.id));
      }

      // 8. Handle anonymous room join response (Joining member side)
      else if (envelope.type === 'room_join_response') {
        const pending = this.pendingRoomJoins.get(envelope.roomId);
        if (pending) {
          clearTimeout(pending.timer);
          this.pendingRoomJoins.delete(envelope.roomId);
          if (envelope.success && envelope.members) {
            const room = this.chatStore.getRoom(envelope.roomId);
            if (room) {
              room.status = 'joined';
              room.members = envelope.members;
              this.chatStore.saveRoom(room);
              this.emit('rooms-updated', this.chatStore.getRooms(this.localProfile.id));
            }
            pending.resolve({ success: true });
          } else {
            pending.resolve({ success: false, error: envelope.error || 'Failed to join room' });
          }
        }
      }

      // 9. Handle group room messages
      else if (envelope.type === 'room_message') {
        if (this.closedRoomIds.has(envelope.roomId) || this.chatStore.isRoomClosed(envelope.roomId)) {
          console.log(
            `[Subnet:Room] Security drop: message for closed room ${envelope.roomId.slice(0, 8)}`
          );
          conn.sendEnvelope({
            type: 'room_closed',
            roomId: envelope.roomId,
            hostId: this.localProfile.id,
            reason: 'Room has been closed by host',
            timestamp: Date.now(),
          });
          return;
        }

        const room = this.chatStore.getRoom(envelope.roomId);
        if (!room) {
          console.log(`[Subnet:Room] Security drop: message for unknown room ${envelope.roomId.slice(0, 8)}`);
          return;
        }

        // Security check: validate that sender is a registered member of this room
        const member = room.members.find((m) => m.id === envelope.senderId);
        if (!member) {
          console.log(
            `[Subnet:Room] Security drop: message from unauthorized non-member ${envelope.senderId.slice(0, 8)}`
          );
          return;
        }

        // Deduplication check
        if (this.receivedMessageIds.has(envelope.id)) {
          return;
        }
        this.trackReceivedMessageId(envelope.id);

        const isUnread = this.currentlyActiveRoomId !== room.id;
        const senderAvatar =
          room.type === 'private'
            ? envelope.senderAvatar || member.avatar || this.chatStore.getPeerAvatar(envelope.senderId)
            : undefined;

        const message: RoomMessage = {
          id: envelope.id,
          roomId: envelope.roomId,
          senderId: envelope.senderId,
          senderNickname: envelope.senderNickname,
          senderAvatar,
          text: envelope.text,
          attachment: envelope.attachment,
          transferStatus: envelope.attachment ? 'idle' : undefined,
          timestamp: envelope.timestamp,
        };

        this.chatStore.addRoomMessage(room.id, message, isUnread);

        // If local user is host, relay to other members without duplicate transmissions
        if (room.hostId === this.localProfile.id) {
          const sentPeerIds = new Set<string>();
          for (const m of room.members) {
            if (m.id !== this.localProfile.id && m.id !== envelope.senderId && !sentPeerIds.has(m.id)) {
              sentPeerIds.add(m.id);
              const mConn = this.activeConnections.get(m.id);
              if (mConn) mConn.sendEnvelope(envelope);
            }
          }
        }

        this.emit('room-message-received', message);
        this.emit('rooms-updated', this.chatStore.getRooms(this.localProfile.id));
      }

      // 10. Handle room member update broadcasts
      else if (envelope.type === 'room_member_update') {
        const room = this.chatStore.getRoom(envelope.roomId);
        if (room) {
          this.chatStore.updateRoomMembers(envelope.roomId, envelope.members);
          this.emit('rooms-updated', this.chatStore.getRooms(this.localProfile.id));
        }
      }

      // 11. Handle member leaving room
      else if (envelope.type === 'room_leave') {
        const room = this.chatStore.getRoom(envelope.roomId);
        if (room && room.hostId === this.localProfile.id) {
          room.members = room.members.filter((m) => m.id !== envelope.peerId);
          this.chatStore.saveRoom(room);

          if (room.type === 'anonymous' && this.bonjour) {
            this.bonjour.publishAnonymousRoom({
              id: room.id,
              name: room.name,
              capacity: room.capacity,
              occupancy: room.members.length,
            });
          }

          const updateEnvelope: RoomMemberUpdatePayload = {
            type: 'room_member_update',
            roomId: room.id,
            members: room.members,
            timestamp: Date.now(),
          };
          const notifiedPeerIds = new Set<string>();
          for (const m of room.members) {
            if (m.id !== this.localProfile.id && !notifiedPeerIds.has(m.id)) {
              notifiedPeerIds.add(m.id);
              const mConn = this.activeConnections.get(m.id);
              if (mConn) mConn.sendEnvelope(updateEnvelope);
            }
          }
          this.emit('rooms-updated', this.chatStore.getRooms(this.localProfile.id));
        }
      }

      // 12. Handle host closing room
      else if (envelope.type === 'room_close' || envelope.type === 'room_closed') {
        this.handleRoomClosedByHost(envelope.roomId, envelope.hostId, envelope.reason);
      }

      // 13. File transfer request from peer (peer wants to download from local user)
      else if (envelope.type === 'file_request') {
        this.handleRemoteFileRequest(conn, envelope);
      }

      // 14. File chunk from peer (sender sending chunk to local user)
      else if (envelope.type === 'file_chunk') {
        this.handleRemoteFileChunk(conn, envelope);
      }

      // 15. File cancel from peer
      else if (envelope.type === 'file_cancel') {
        console.log(`[Subnet:Transfer] Remote peer cancelled transfer ${envelope.transferId}`);
        this.transferManager.cancelTransfer(envelope.transferId, envelope.reason);
      }

      // 16. File complete from peer
      else if (envelope.type === 'file_complete') {
        console.log(`[Subnet:Transfer] Peer confirmed completion for transfer ${envelope.transferId}`);
        this.handleRemoteFileComplete(conn, envelope);
      }
    });
  }

  private trackReceivedMessageId(messageId: string): void {
    if (this.receivedMessageIds.size >= this.maxTrackedMessageIds) {
      const first = this.receivedMessageIds.values().next().value;
      if (first) this.receivedMessageIds.delete(first);
    }
    this.receivedMessageIds.add(messageId);
  }

  private handlePeerDiscovered(peer: Peer): void {
    const isNew = !this.discoveredPeers.has(peer.id);
    const existing = this.discoveredPeers.get(peer.id);
    const cachedAvatar = this.chatStore.getPeerAvatar(peer.id);

    const mergedPeer: Peer = {
      ...existing,
      ...peer,
      avatar: existing?.avatar || peer.avatar || cachedAvatar,
      lastSeen: Date.now(),
    };

    this.discoveredPeers.set(peer.id, mergedPeer);
    this.chatStore.updatePeerName(peer.id, peer.name);
    if (mergedPeer.avatar) {
      this.chatStore.updatePeerProfile(peer.id, peer.name, mergedPeer.avatar);
    }

    console.log(
      `[Subnet:Peer] ${isNew ? 'Added new' : 'Updated'} peer: "${peer.name}" (${peer.id.slice(0, 8)}) [total discovered: ${this.discoveredPeers.size}]`
    );

    if (isNew) {
      this.connectToPeer(peer.id).catch((err) => {
        console.log(`[Subnet:Connection] Initial connection attempt error: ${err.message}`);
      });
    }

    this.emit('peer-discovered', mergedPeer);
    this.emitStatusChanged();
  }

  private handlePeerLost(peerId: string): void {
    const existing = this.discoveredPeers.get(peerId);
    console.log(
      `[Subnet:Peer] Peer lost from LAN: "${existing?.name || 'unknown'}" (${peerId.slice(0, 8)})`
    );

    this.discoveredPeers.delete(peerId);

    const active = this.activeConnections.get(peerId);
    if (active) {
      active.close(1000, 'Peer disappeared from local network');
      this.activeConnections.delete(peerId);
    }

    const pending = this.pendingOutbound.get(peerId);
    if (pending) {
      pending.close(1000, 'Peer disappeared from local network');
      this.pendingOutbound.delete(peerId);
    }

    this.checkHostOfflineForRooms(peerId);

    this.emit('peer-lost', peerId);
    this.emitStatusChanged();
  }

  private emitStatusChanged(): void {
    this.emit('status-changed', this.getNetworkStatus());
  }

  public getNetworkStatus(): NetworkStatus {
    return {
      isRunning: this.isRunning,
      port: this.port || undefined,
      peerCount: this.discoveredPeers.size,
      localIp: this.localIp,
    };
  }

  public getDiscoveredPeers(): Peer[] {
    return Array.from(this.discoveredPeers.values());
  }

  public getConversations(): ConversationSummary[] {
    return this.chatStore.getConversations();
  }

  public getConversationMessages(peerId: string): Message[] {
    return this.chatStore.getMessages(peerId);
  }

  public markConversationRead(peerId: string): void {
    this.chatStore.markConversationRead(peerId);
    this.emit('conversations-updated', this.chatStore.getConversations());
  }

  public deleteConversation(peerId: string): boolean {
    if (!peerId || typeof peerId !== 'string') return false;
    const trimmed = peerId.trim();
    const deleted = this.chatStore.deleteConversation(trimmed);
    if (deleted) {
      if (this.currentlyActiveChatPeerId === trimmed) {
        this.currentlyActiveChatPeerId = null;
      }
      this.emit('conversations-updated', this.chatStore.getConversations());
      console.log(`[Subnet:Conversation] Locally deleted conversation with peer ${trimmed.slice(0, 8)}`);
    }
    return deleted;
  }

  public getSettings(): UserSettings {
    return this.chatStore.getSettings();
  }

  public updateSettings(partial: Partial<UserSettings>): UserSettings {
    const updated = this.chatStore.updateSettings(partial);
    if (partial.peopleCanFindMe !== undefined) {
      void this.bonjour?.setDiscoverable(updated.peopleCanFindMe !== false);
    }
    if (partial.avatarType !== undefined || partial.avatarValue !== undefined || partial.shareAvatarWithPeers !== undefined) {
      const avatarToBroadcast: ProfileAvatarMetadata =
        updated.shareAvatarWithPeers !== false && updated.avatarType !== 'default'
          ? { avatarType: updated.avatarType, avatarValue: updated.avatarValue }
          : { avatarType: 'default', avatarValue: '' };
      this.broadcastProfileUpdate(avatarToBroadcast);
    }
    return updated;
  }

  public broadcastProfileUpdate(avatar: ProfileAvatarMetadata): void {
    const payload: ProfileUpdatePayload = {
      type: 'profile_update',
      peerId: this.localProfile.id,
      name: this.localProfile.name,
      avatar,
      timestamp: Date.now(),
    };

    for (const [peerId, conn] of this.activeConnections.entries()) {
      if (conn.state === 'connected') {
        try {
          conn.sendEnvelope(payload);
        } catch (err: any) {
          console.log(`[Subnet:Profile] Failed to send profile update to ${peerId.slice(0, 8)}: ${err.message}`);
        }
      }
    }
  }

  private handleRemoteProfileUpdate(payload: ProfileUpdatePayload): void {
    const peerId = payload.peerId;
    if (!peerId || peerId === this.localProfile.id) return;

    let peer = this.discoveredPeers.get(peerId);
    if (peer) {
      if (payload.name) peer.name = payload.name;
      peer.avatar = payload.avatar;
    } else {
      peer = {
        id: peerId,
        name: payload.name || 'Nearby Peer',
        avatar: payload.avatar,
      };
      this.discoveredPeers.set(peerId, peer);
    }

    this.chatStore.updatePeerProfile(peerId, payload.name, payload.avatar);
    this.emit('peer-updated', peer);
    this.emit('peers-discovered', Array.from(this.discoveredPeers.values()));
    this.emit('conversations-updated', this.chatStore.getConversations());
    this.emit('rooms-updated', this.chatStore.getRooms(this.localProfile.id));
  }

  public async endConversation(
    peerId: string
  ): Promise<{ success: boolean; remoteConfirmed: boolean; error?: string }> {
    if (!peerId || typeof peerId !== 'string') {
      return { success: false, remoteConfirmed: false, error: 'Invalid user ID' };
    }
    const trimmed = peerId.trim();

    // Check if peer is reachable on local network
    const activeConn = await this.ensureActiveConnection(trimmed);
    if (!activeConn || activeConn.state !== 'connected') {
      return {
        success: false,
        remoteConfirmed: false,
        error:
          'Cannot reach peer on local network. The remote history could not be deleted while the peer is offline.',
      };
    }

    const endPayload: ConversationEndPayload = {
      type: 'conversation_end',
      id: crypto.randomUUID(),
      senderId: this.localProfile.id,
      recipientId: trimmed,
      timestamp: Date.now(),
    };

    const sent = activeConn.sendEnvelope(endPayload);
    if (!sent) {
      return {
        success: false,
        remoteConfirmed: false,
        error: 'Socket error: failed to transmit conversation-ending event to user.',
      };
    }

    this.processedEndEventIds.add(endPayload.id);

    // Delete conversation from local store
    this.deleteConversation(trimmed);

    console.log(
      `[Subnet:Conversation] Ended conversation with peer ${trimmed.slice(0, 8)} on both devices`
    );
    return { success: true, remoteConfirmed: true };
  }

  public async stop(): Promise<void> {
    console.log(`[Subnet:Connection] Stopping networking core...`);
    this.isRunning = false;

    for (const [roomId, pending] of this.pendingRoomJoins.entries()) {
      clearTimeout(pending.timer);
      pending.resolve({ success: false, error: 'Subnet shutting down' });
    }
    this.pendingRoomJoins.clear();

    for (const [peerId, conn] of this.activeConnections.entries()) {
      conn.close(1001, 'Subnet shutting down');
    }
    this.activeConnections.clear();

    for (const [peerId, conn] of this.pendingOutbound.entries()) {
      conn.close(1001, 'Subnet shutting down');
    }
    this.pendingOutbound.clear();

    if (this.bonjour) {
      await this.bonjour.stop();
      this.bonjour = null;
    }

    if (this.wss) {
      await new Promise<void>((resolve) => {
        this.wss?.close(() => resolve());
      });
      this.wss = null;
    }

    this.discoveredPeers.clear();
    this.discoveredRooms.clear();
    this.emitStatusChanged();
  }

  public getTransferManager(): FileTransferManager {
    return this.transferManager;
  }

  private handleTransferProgress(progress: TransferProgressEvent): void {
    this.emit('transfer-progress', progress);
  }

  private async handleRemoteFileRequest(conn: PeerConnection, envelope: FileRequestPayload): Promise<void> {
    const outbound = this.transferManager.getOutboundTransfer(envelope.transferId);
    if (!outbound) {
      console.warn(`[Subnet:Transfer] Received request for unknown transfer: ${envelope.transferId}`);
      conn.sendEnvelope({
        type: 'file_cancel',
        transferId: envelope.transferId,
        senderId: this.localProfile.id,
        recipientId: envelope.senderId,
        reason: 'File no longer available',
        timestamp: Date.now(),
      });
      return;
    }

    try {
      await this.transferManager.streamFileChunks(
        envelope.transferId,
        async (chunk) => {
          if (conn.isBackpressured()) {
            const drained = await conn.waitForDrain(15000);
            if (!drained) {
              return false;
            }
          }
          return conn.sendEnvelope(chunk);
        },
        () => conn.state === 'connected'
      );
    } catch (err: any) {
      console.error(`[Subnet:Transfer] Error streaming file ${envelope.transferId}:`, err);
      conn.sendEnvelope({
        type: 'file_cancel',
        transferId: envelope.transferId,
        senderId: this.localProfile.id,
        recipientId: envelope.senderId,
        reason: err.message || 'Stream transmission failed',
        timestamp: Date.now(),
      });
    }
  }

  private async handleRemoteFileChunk(conn: PeerConnection, envelope: FileChunkPayload): Promise<void> {
    const res = await this.transferManager.handleIncomingChunk(envelope);
    if (res.completed && res.success && res.finalPath) {
      conn.sendEnvelope({
        type: 'file_complete',
        transferId: envelope.transferId,
        senderId: this.localProfile.id,
        recipientId: conn.remotePeer?.peerId || '',
        timestamp: Date.now(),
      });

      const found = this.chatStore.findMessageByTransferId(envelope.transferId);
      if (found) {
        if (found.peerId) {
          this.chatStore.updateMessageAttachment(found.peerId, found.message.id, {
            localAttachmentPath: res.finalPath,
            transferStatus: 'downloaded',
          });
          this.emit('conversations-updated', this.chatStore.getConversations());
        } else if (found.roomId) {
          this.chatStore.updateRoomMessageAttachment(found.roomId, found.message.id, {
            localAttachmentPath: res.finalPath,
            transferStatus: 'downloaded',
          });
          this.emit('rooms-updated', this.chatStore.getRooms(this.localProfile.id));
        }
      }
    } else if (res.completed && !res.success) {
      conn.sendEnvelope({
        type: 'file_cancel',
        transferId: envelope.transferId,
        senderId: this.localProfile.id,
        recipientId: conn.remotePeer?.peerId || '',
        reason: res.error || 'Checksum verification failed',
        timestamp: Date.now(),
      });
    }
  }

  private handleRemoteFileComplete(conn: PeerConnection, envelope: FileCompletePayload): void {
    const found = this.chatStore.findMessageByTransferId(envelope.transferId);
    if (found) {
      if (found.peerId) {
        this.chatStore.updateMessageAttachment(found.peerId, found.message.id, {
          transferStatus: 'downloaded',
        });
        this.emit('conversations-updated', this.chatStore.getConversations());
      } else if (found.roomId) {
        this.chatStore.updateRoomMessageAttachment(found.roomId, found.message.id, {
          transferStatus: 'downloaded',
        });
        this.emit('rooms-updated', this.chatStore.getRooms(this.localProfile.id));
      }
    }
  }

  public async downloadAttachment(
    transferId: string,
    targetPeerId: string,
    customDestination?: string
  ): Promise<{ success: boolean; error?: string }> {
    const found = this.chatStore.findMessageByTransferId(transferId);
    if (!found || !found.message.attachment) {
      return { success: false, error: 'Attachment metadata not found' };
    }

    try {
      this.transferManager.startInboundDownload(
        found.message.attachment,
        targetPeerId,
        customDestination
      );
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to prepare download' };
    }

    const conn = await this.ensureActiveConnection(targetPeerId);
    if (!conn) {
      this.transferManager.cancelTransfer(transferId, 'Peer is offline');
      return { success: false, error: 'Target user is currently unreachable on local network' };
    }

    const req: FileRequestPayload = {
      type: 'file_request',
      transferId,
      senderId: this.localProfile.id,
      recipientId: targetPeerId,
      timestamp: Date.now(),
    };

    const sent = conn.sendEnvelope(req);
    if (!sent) {
      this.transferManager.cancelTransfer(transferId, 'Failed to send request');
      return { success: false, error: 'Failed to transmit file request packet' };
    }

    if (found.peerId) {
      this.chatStore.updateMessageAttachment(found.peerId, found.message.id, {
        transferStatus: 'transferring',
      });
      this.emit('conversations-updated', this.chatStore.getConversations());
    } else if (found.roomId) {
      this.chatStore.updateRoomMessageAttachment(found.roomId, found.message.id, {
        transferStatus: 'transferring',
      });
      this.emit('rooms-updated', this.chatStore.getRooms(this.localProfile.id));
    }

    return { success: true };
  }

  public cancelTransfer(transferId: string): { success: boolean } {
    this.transferManager.cancelTransfer(transferId, 'Cancelled by user');

    const found = this.chatStore.findMessageByTransferId(transferId);
    if (found) {
      if (found.peerId) {
        this.chatStore.updateMessageAttachment(found.peerId, found.message.id, {
          transferStatus: 'cancelled',
        });
        const conn = this.activeConnections.get(found.peerId);
        if (conn) {
          conn.sendEnvelope({
            type: 'file_cancel',
            transferId,
            senderId: this.localProfile.id,
            recipientId: found.peerId,
            reason: 'Cancelled by user',
            timestamp: Date.now(),
          });
        }
        this.emit('conversations-updated', this.chatStore.getConversations());
      } else if (found.roomId) {
        this.chatStore.updateRoomMessageAttachment(found.roomId, found.message.id, {
          transferStatus: 'cancelled',
        });
        this.emit('rooms-updated', this.chatStore.getRooms(this.localProfile.id));
      }
    }

    return { success: true };
  }

  public async sendAttachmentMessage(
    recipientId: string,
    filePath: string,
    text?: string
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      const metadata = await this.transferManager.prepareOutboundFile(filePath);
      return this.sendMessage(recipientId, text || '', metadata, filePath);
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to prepare attachment' };
    }
  }

  public async sendMediaAttachment(
    recipientId: string,
    fileName: string,
    mimeType: string,
    buffer: Buffer,
    text?: string
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      const { metadata, tempPath } = await this.transferManager.prepareOutboundBuffer(
        fileName,
        mimeType,
        buffer
      );
      return this.sendMessage(recipientId, text || '', metadata, tempPath);
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to prepare media attachment' };
    }
  }

  public async sendRoomAttachmentMessage(
    roomId: string,
    filePath: string,
    text?: string
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      const metadata = await this.transferManager.prepareOutboundFile(filePath);
      return this.sendRoomMessage(roomId, text || '', metadata, filePath);
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to prepare room attachment' };
    }
  }

  public async sendRoomMediaAttachment(
    roomId: string,
    fileName: string,
    mimeType: string,
    buffer: Buffer,
    text?: string
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      const { metadata, tempPath } = await this.transferManager.prepareOutboundBuffer(
        fileName,
        mimeType,
        buffer
      );
      return this.sendRoomMessage(roomId, text || '', metadata, tempPath);
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to prepare room media attachment' };
    }
  }

  private detectLocalIpAddress(): string {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
      const netList = interfaces[name];
      if (!netList) continue;
      for (const net of netList) {
        if (net.family === 'IPv4' && !net.internal) {
          return net.address;
        }
      }
    }
    return '127.0.0.1';
  }
}
