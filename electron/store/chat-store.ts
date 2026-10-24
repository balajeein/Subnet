import fs from 'fs';
import path from 'path';
import type { Message, Invitation, ConversationSummary, ProfileAvatarMetadata, FileAttachmentMetadata } from '../../src/types/subnet';

export interface StoredConversation {
  peerId: string;
  peerName: string;
  peerAvatar?: ProfileAvatarMetadata;
  status: 'none' | 'pending_outgoing' | 'pending_incoming' | 'accepted' | 'declined';
  lastMessage?: string;
  lastTimestamp: number;
  unreadCount: number;
  pendingInvitation?: Invitation;
  messages: Message[];
}

export interface RoomMember {
  id: string;
  nickname: string;
  avatar?: ProfileAvatarMetadata;
  isHost?: boolean;
}

export interface RoomMessage {
  id: string;
  roomId: string;
  senderId: string;
  senderNickname: string;
  senderAvatar?: ProfileAvatarMetadata;
  text: string;
  attachment?: FileAttachmentMetadata;
  localAttachmentPath?: string;
  transferStatus?: 'idle' | 'transferring' | 'downloaded' | 'failed' | 'cancelled';
  timestamp: number;
}

export interface StoredRoom {
  id: string;
  name: string;
  type: 'private' | 'anonymous';
  hostId: string;
  myNickname: string;
  capacity?: number;
  members: RoomMember[];
  status: 'joined' | 'invited' | 'declined' | 'closed';
  lastMessage?: string;
  lastTimestamp: number;
  unreadCount: number;
  messages: RoomMessage[];
}

export interface RoomSummary {
  id: string;
  name: string;
  type: 'private' | 'anonymous';
  hostId: string;
  isHost: boolean;
  myNickname: string;
  capacity?: number;
  memberCount: number;
  members: RoomMember[];
  status: 'joined' | 'invited' | 'declined' | 'closed';
  lastMessage?: string;
  lastTimestamp: number;
  unreadCount: number;
}

export interface UserSettings {
  avatarType: 'default' | 'preset' | 'custom';
  avatarValue: string;
  defaultAnonymousNickname?: string;
  theme: 'system' | 'dark' | 'light';
  notificationsEnabled: boolean;
  soundEnabled: boolean;
  shareAvatarWithPeers?: boolean;
}

export const DEFAULT_USER_SETTINGS: UserSettings = {
  avatarType: 'default',
  avatarValue: '',
  defaultAnonymousNickname: '',
  theme: 'system',
  notificationsEnabled: true,
  soundEnabled: true,
  shareAvatarWithPeers: true,
};

export interface ChatStoreData {
  version: number;
  conversations: Record<string, StoredConversation>;
  rooms: Record<string, StoredRoom>;
  closedRoomIds?: string[];
  cachedPeerAvatars?: Record<string, ProfileAvatarMetadata>;
  settings?: UserSettings;
}

export class ChatStore {
  private storagePath: string;
  private data: ChatStoreData = {
    version: 1,
    conversations: {},
    rooms: {},
    closedRoomIds: [],
    cachedPeerAvatars: {},
    settings: { ...DEFAULT_USER_SETTINGS },
  };

  constructor(customStoragePath?: string) {
    if (customStoragePath) {
      this.storagePath = customStoragePath;
    } else {
      let defaultPath: string | null = null;
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const electron = require('electron');
        const app = electron.app || electron.remote?.app;
        if (app && typeof app.getPath === 'function') {
          defaultPath = path.join(app.getPath('userData'), 'subnet-history.json');
        }
      } catch {
        // Non-electron environment (e.g. CLI or unit test)
      }
      this.storagePath = defaultPath || path.join(process.cwd(), '.subnet-history.json');
    }

    this.load();
  }

  public getStoragePath(): string {
    return this.storagePath;
  }

  /**
   * Loads persisted conversation data from disk.
   * If the file is corrupted, renames it with a timestamp suffix and starts fresh.
   */
  public load(): void {
    if (!fs.existsSync(this.storagePath)) {
      this.data = { version: 1, conversations: {}, rooms: {} };
      return;
    }

    try {
      const raw = fs.readFileSync(this.storagePath, 'utf-8');
      const parsed = JSON.parse(raw);

      if (
        !parsed ||
        typeof parsed !== 'object' ||
        typeof parsed.conversations !== 'object' ||
        parsed.conversations === null
      ) {
        throw new Error('Invalid JSON structure for chat history');
      }

      this.data = {
        version: typeof parsed.version === 'number' ? parsed.version : 1,
        conversations: parsed.conversations,
        rooms: parsed.rooms && typeof parsed.rooms === 'object' ? parsed.rooms : {},
        closedRoomIds: Array.isArray(parsed.closedRoomIds) ? parsed.closedRoomIds : [],
        cachedPeerAvatars: parsed.cachedPeerAvatars && typeof parsed.cachedPeerAvatars === 'object' ? parsed.cachedPeerAvatars : {},
        settings: parsed.settings && typeof parsed.settings === 'object' ? parsed.settings : undefined,
      };
    } catch (err: any) {
      console.warn(
        `[Subnet:Store] Corrupted history file detected (${this.storagePath}): ${err.message}. Backing up and resetting.`
      );
      try {
        const corruptedPath = `${this.storagePath}.corrupted.${Date.now()}`;
        fs.renameSync(this.storagePath, corruptedPath);
      } catch (backupErr) {
        console.error(`[Subnet:Store] Failed to backup corrupted file:`, backupErr);
      }
      this.data = { version: 1, conversations: {}, rooms: {}, closedRoomIds: [], cachedPeerAvatars: {} };
      this.save();
    }
  }

  /**
   * Atomically writes data to disk using a unique temporary file + atomic rename.
   */
  public save(): void {
    try {
      const dir = path.dirname(this.storagePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      const tmpPath = `${this.storagePath}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}.tmp`;
      const json = JSON.stringify(this.data, null, 2);

      fs.writeFileSync(tmpPath, json, 'utf-8');
      fs.renameSync(tmpPath, this.storagePath);
    } catch (err: any) {
      console.error(`[Subnet:Store] Failed to save chat history: ${err.message}`);
    }
  }

  public getConversations(): ConversationSummary[] {
    const list: ConversationSummary[] = Object.values(this.data.conversations).map((c) => ({
      peerId: c.peerId,
      peerName: c.peerName,
      peerAvatar: c.peerAvatar || this.data.cachedPeerAvatars?.[c.peerId],
      status: c.status,
      lastMessage: c.lastMessage,
      lastTimestamp: c.lastTimestamp,
      unreadCount: c.unreadCount || 0,
      pendingInvitation: c.pendingInvitation,
    }));

    // Sort by latest activity first
    list.sort((a, b) => b.lastTimestamp - a.lastTimestamp);
    return list;
  }

  public getConversation(peerId: string): StoredConversation | null {
    return this.data.conversations[peerId] || null;
  }

  public getMessages(peerId: string): Message[] {
    const conv = this.data.conversations[peerId];
    return conv ? [...conv.messages] : [];
  }

  public getPendingIncomingInvitations(): Invitation[] {
    const list: Invitation[] = [];
    for (const conv of Object.values(this.data.conversations)) {
      if (conv.status === 'pending_incoming' && conv.pendingInvitation) {
        list.push(conv.pendingInvitation);
      }
    }
    return list;
  }

  public findPendingInvitationById(invitationId: string): { peerId: string; invitation: Invitation } | null {
    for (const conv of Object.values(this.data.conversations)) {
      if (conv.pendingInvitation && conv.pendingInvitation.id === invitationId) {
        return { peerId: conv.peerId, invitation: conv.pendingInvitation };
      }
    }
    return null;
  }

  public createOutgoingInvitation(
    peerId: string,
    peerName: string,
    invitation: Invitation
  ): void {
    let conv = this.data.conversations[peerId];
    if (!conv) {
      conv = {
        peerId,
        peerName,
        status: 'pending_outgoing',
        lastMessage: invitation.text,
        lastTimestamp: invitation.timestamp,
        unreadCount: 0,
        messages: [],
      };
      this.data.conversations[peerId] = conv;
    }

    conv.peerName = peerName || conv.peerName;
    conv.status = 'pending_outgoing';
    conv.pendingInvitation = invitation;
    conv.lastMessage = invitation.text;
    conv.lastTimestamp = invitation.timestamp;

    // Record the initial message as pending outgoing
    const existingMsgIndex = conv.messages.findIndex((m) => m.id === invitation.id);
    const msg: Message = {
      id: invitation.id,
      senderId: invitation.senderId,
      recipientId: invitation.recipientId,
      text: invitation.text,
      timestamp: invitation.timestamp,
      status: 'sending',
    };

    if (existingMsgIndex >= 0) {
      conv.messages[existingMsgIndex] = msg;
    } else {
      conv.messages.push(msg);
    }

    this.save();
  }

  public recordIncomingInvitation(invitation: Invitation): void {
    let conv = this.data.conversations[invitation.senderId];
    if (!conv) {
      conv = {
        peerId: invitation.senderId,
        peerName: invitation.senderName,
        status: 'pending_incoming',
        lastMessage: invitation.text,
        lastTimestamp: invitation.timestamp,
        unreadCount: 1,
        messages: [],
      };
      this.data.conversations[invitation.senderId] = conv;
    } else {
      conv.peerName = invitation.senderName || conv.peerName;
      conv.status = 'pending_incoming';
      conv.unreadCount = (conv.unreadCount || 0) + 1;
      conv.lastMessage = invitation.text;
      conv.lastTimestamp = invitation.timestamp;
    }

    conv.pendingInvitation = invitation;
    this.save();
  }

  public resolveInvitation(peerId: string, accepted: boolean): Invitation | null {
    const conv = this.data.conversations[peerId];
    if (!conv || !conv.pendingInvitation) {
      return null;
    }

    const invitation = { ...conv.pendingInvitation };
    invitation.status = accepted ? 'accepted' : 'declined';

    if (accepted) {
      conv.status = 'accepted';
      conv.pendingInvitation = undefined;

      // Deliver the initial message into the conversation if not present
      const alreadyHasMessage = conv.messages.some((m) => m.id === invitation.id);
      if (!alreadyHasMessage) {
        conv.messages.push({
          id: invitation.id,
          senderId: invitation.senderId,
          recipientId: invitation.recipientId,
          text: invitation.text,
          timestamp: invitation.timestamp,
          status: 'delivered',
        });
      } else {
        // If it was already there (outgoing side), update its status to delivered
        const msg = conv.messages.find((m) => m.id === invitation.id);
        if (msg) {
          msg.status = 'delivered';
        }
      }

      // Preserve strict message chronological ordering (initial message first)
      conv.messages.sort((a, b) => a.timestamp - b.timestamp);

      if (conv.messages.length > 0) {
        const latestMsg = conv.messages[conv.messages.length - 1];
        conv.lastMessage = latestMsg.text;
        conv.lastTimestamp = latestMsg.timestamp;
      }
    } else {
      conv.status = 'declined';
      conv.pendingInvitation = undefined;
      // Mark outgoing message as failed if sender
      const msg = conv.messages.find((m) => m.id === invitation.id);
      if (msg) {
        msg.status = 'failed';
      }
    }

    this.save();
    return invitation;
  }

  public addMessage(peerId: string, message: Message, isUnread: boolean, fallbackPeerName?: string): void {
    let conv = this.data.conversations[peerId];
    if (!conv) {
      conv = {
        peerId,
        peerName: fallbackPeerName || 'Unknown Device',
        status: 'accepted',
        lastMessage: message.text,
        lastTimestamp: message.timestamp,
        unreadCount: 0,
        messages: [],
      };
      this.data.conversations[peerId] = conv;
    }

    // Deduplication check
    const existingIndex = conv.messages.findIndex((m) => m.id === message.id);
    if (existingIndex >= 0) {
      // Update existing message if status updated
      conv.messages[existingIndex] = {
        ...conv.messages[existingIndex],
        ...message,
      };
      conv.messages.sort((a, b) => a.timestamp - b.timestamp);
      this.save();
      return;
    }

    conv.messages.push(message);
    conv.messages.sort((a, b) => a.timestamp - b.timestamp);
    if (conv.messages.length > 0) {
      const latestMsg = conv.messages[conv.messages.length - 1];
      conv.lastMessage = latestMsg.text || (latestMsg.attachment ? `📎 ${latestMsg.attachment.fileName}` : '');
      conv.lastTimestamp = latestMsg.timestamp;
    }
    if (isUnread) {
      conv.unreadCount = (conv.unreadCount || 0) + 1;
    }

    this.save();
  }

  public updateMessageStatus(
    peerId: string,
    messageId: string,
    status: 'sending' | 'delivered' | 'failed'
  ): boolean {
    const conv = this.data.conversations[peerId];
    if (!conv) return false;

    const msg = conv.messages.find((m) => m.id === messageId);
    if (!msg) return false;

    msg.status = status;
    this.save();
    return true;
  }

  public markConversationRead(peerId: string): void {
    const conv = this.data.conversations[peerId];
    if (conv && conv.unreadCount > 0) {
      conv.unreadCount = 0;
      this.save();
    }
  }

  public updatePeerName(peerId: string, peerName: string): void {
    const conv = this.data.conversations[peerId];
    if (conv && peerName && conv.peerName !== peerName) {
      conv.peerName = peerName;
      this.save();
    }
  }

  public getPeerAvatar(peerId: string): ProfileAvatarMetadata | undefined {
    return this.data.cachedPeerAvatars?.[peerId] || this.data.conversations[peerId]?.peerAvatar;
  }

  public updatePeerProfile(peerId: string, name?: string, avatar?: ProfileAvatarMetadata): void {
    if (!this.data.cachedPeerAvatars) {
      this.data.cachedPeerAvatars = {};
    }
    if (avatar) {
      this.data.cachedPeerAvatars[peerId] = avatar;
    }

    const conv = this.data.conversations[peerId];
    if (conv) {
      if (name) conv.peerName = name;
      if (avatar) conv.peerAvatar = avatar;
    }

    // Update avatar in any private rooms where this peer is a member
    for (const room of Object.values(this.data.rooms)) {
      if (room.type === 'private' && room.members) {
        for (const m of room.members) {
          if (m.id === peerId) {
            if (name) m.nickname = name;
            if (avatar) m.avatar = avatar;
          }
        }
      }
    }

    this.save();
  }

  public isConversationAccepted(peerId: string): boolean {
    const conv = this.data.conversations[peerId];
    return !!conv && conv.status === 'accepted';
  }

  public deleteConversation(peerId: string): boolean {
    if (!this.data.conversations[peerId]) {
      return false;
    }
    delete this.data.conversations[peerId];
    this.save();
    return true;
  }

  // --- Room Persistence Methods ---

  public getRooms(localPeerId: string): RoomSummary[] {
    const list: RoomSummary[] = Object.values(this.data.rooms).map((r) => ({
      id: r.id,
      name: r.name,
      type: r.type,
      hostId: r.hostId,
      isHost: r.hostId === localPeerId,
      myNickname: r.myNickname,
      capacity: r.capacity,
      memberCount: r.members?.length || 0,
      members: r.members || [],
      status: r.status,
      lastMessage: r.lastMessage,
      lastTimestamp: r.lastTimestamp,
      unreadCount: r.unreadCount || 0,
    }));

    list.sort((a, b) => b.lastTimestamp - a.lastTimestamp);
    return list;
  }

  public getRoom(roomId: string): StoredRoom | null {
    return this.data.rooms[roomId] || null;
  }

  public getRoomMessages(roomId: string): RoomMessage[] {
    const r = this.data.rooms[roomId];
    return r ? [...r.messages] : [];
  }

  public saveRoom(room: StoredRoom): void {
    this.data.rooms[room.id] = room;
    this.save();
  }

  public addRoomMessage(roomId: string, message: RoomMessage, isUnread: boolean): boolean {
    const room = this.data.rooms[roomId];
    if (!room) return false;

    // Deduplication check
    const existingIndex = room.messages.findIndex((m) => m.id === message.id);
    if (existingIndex >= 0) {
      return false;
    }

    room.messages.push(message);
    const previewText = message.text || (message.attachment ? `📎 ${message.attachment.fileName}` : '');
    room.lastMessage = `${message.senderNickname}: ${previewText}`;
    room.lastTimestamp = message.timestamp;
    if (isUnread) {
      room.unreadCount = (room.unreadCount || 0) + 1;
    }

    this.save();
    return true;
  }

  public updateMessageAttachment(
    peerId: string,
    messageId: string,
    updates: {
      localAttachmentPath?: string;
      transferStatus?: 'idle' | 'transferring' | 'downloaded' | 'failed' | 'cancelled';
    }
  ): boolean {
    const conv = this.data.conversations[peerId];
    if (!conv) return false;
    const msg = conv.messages.find((m) => m.id === messageId || m.attachment?.transferId === messageId);
    if (!msg) return false;
    if (updates.localAttachmentPath !== undefined) {
      msg.localAttachmentPath = updates.localAttachmentPath;
    }
    if (updates.transferStatus !== undefined) {
      msg.transferStatus = updates.transferStatus;
    }
    this.save();
    return true;
  }

  public updateRoomMessageAttachment(
    roomId: string,
    messageId: string,
    updates: {
      localAttachmentPath?: string;
      transferStatus?: 'idle' | 'transferring' | 'downloaded' | 'failed' | 'cancelled';
    }
  ): boolean {
    const room = this.data.rooms[roomId];
    if (!room) return false;
    const msg = room.messages.find((m) => m.id === messageId || m.attachment?.transferId === messageId);
    if (!msg) return false;
    if (updates.localAttachmentPath !== undefined) {
      msg.localAttachmentPath = updates.localAttachmentPath;
    }
    if (updates.transferStatus !== undefined) {
      msg.transferStatus = updates.transferStatus;
    }
    this.save();
    return true;
  }

  public findMessageByTransferId(transferId: string): { peerId?: string; roomId?: string; message: Message | RoomMessage } | null {
    for (const conv of Object.values(this.data.conversations)) {
      const msg = conv.messages.find((m) => m.attachment?.transferId === transferId);
      if (msg) return { peerId: conv.peerId, message: msg };
    }
    for (const room of Object.values(this.data.rooms)) {
      const msg = room.messages.find((m) => m.attachment?.transferId === transferId);
      if (msg) return { roomId: room.id, message: msg };
    }
    return null;
  }

  public updateRoomMembers(roomId: string, members: RoomMember[]): void {
    const room = this.data.rooms[roomId];
    if (!room) return;
    room.members = members;
    this.save();
  }

  public setRoomStatus(roomId: string, status: StoredRoom['status']): void {
    const room = this.data.rooms[roomId];
    if (!room) return;
    room.status = status;
    this.save();
  }

  public markRoomRead(roomId: string): void {
    const room = this.data.rooms[roomId];
    if (room && room.unreadCount > 0) {
      room.unreadCount = 0;
      this.save();
    }
  }

  public deleteRoom(roomId: string): boolean {
    if (!this.data.rooms[roomId]) return false;
    delete this.data.rooms[roomId];
    this.save();
    return true;
  }

  public markRoomClosed(roomId: string): void {
    if (!this.data.closedRoomIds) {
      this.data.closedRoomIds = [];
    }
    if (!this.data.closedRoomIds.includes(roomId)) {
      this.data.closedRoomIds.push(roomId);
      if (this.data.closedRoomIds.length > 200) {
        this.data.closedRoomIds.shift();
      }
      this.save();
    }
  }

  public isRoomClosed(roomId: string): boolean {
    return Array.isArray(this.data.closedRoomIds) && this.data.closedRoomIds.includes(roomId);
  }

  public getClosedRoomIds(): string[] {
    return this.data.closedRoomIds ? [...this.data.closedRoomIds] : [];
  }

  // --- User Settings Methods ---

  public getSettings(): UserSettings {
    return {
      ...DEFAULT_USER_SETTINGS,
      ...(this.data.settings || {}),
    };
  }

  public updateSettings(partial: Partial<UserSettings>): UserSettings {
    const current = this.getSettings();
    const updated: UserSettings = {
      ...current,
      ...partial,
    };
    this.data.settings = updated;
    this.save();
    return updated;
  }
}
