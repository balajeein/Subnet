import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';
import type {
  SubnetAPI,
  Peer,
  Message,
  MessageAck,
  Invitation,
  InvitationResponse,
  ConversationSummary,
  LocalProfile,
  NetworkStatus,
  UserSettings,
} from '../src/types/subnet';

const subnetBridge: SubnetAPI = {
  getProfile: (): Promise<LocalProfile> => {
    return ipcRenderer.invoke('subnet:get-profile');
  },

  getNetworkStatus: (): Promise<NetworkStatus> => {
    return ipcRenderer.invoke('subnet:get-network-status');
  },

  getPeers: (): Promise<Peer[]> => {
    return ipcRenderer.invoke('subnet:get-peers');
  },

  getConversations: (): Promise<ConversationSummary[]> => {
    return ipcRenderer.invoke('subnet:get-conversations');
  },

  getConversationMessages: (peerId: string): Promise<Message[]> => {
    if (typeof peerId !== 'string' || !peerId.trim()) {
      return Promise.resolve([]);
    }
    return ipcRenderer.invoke('subnet:get-conversation-messages', peerId.trim());
  },

  respondToInvitation: (
    invitationId: string,
    accepted: boolean
  ): Promise<{ success: boolean; error?: string }> => {
    if (typeof invitationId !== 'string' || !invitationId.trim()) {
      return Promise.resolve({ success: false, error: 'Invalid invitation ID' });
    }
    return ipcRenderer.invoke('subnet:respond-to-invitation', {
      invitationId: invitationId.trim(),
      accepted: Boolean(accepted),
    });
  },

  markConversationRead: (peerId: string): Promise<void> => {
    if (typeof peerId !== 'string' || !peerId.trim()) {
      return Promise.resolve();
    }
    return ipcRenderer.invoke('subnet:mark-conversation-read', peerId.trim());
  },

  deleteConversation: (peerId: string): Promise<{ success: boolean; error?: string }> => {
    if (typeof peerId !== 'string' || !peerId.trim()) {
      return Promise.resolve({ success: false, error: 'Invalid user ID' });
    }
    return ipcRenderer.invoke('subnet:delete-conversation', peerId.trim());
  },

  endConversation: (
    peerId: string
  ): Promise<{ success: boolean; remoteConfirmed: boolean; error?: string }> => {
    if (typeof peerId !== 'string' || !peerId.trim()) {
      return Promise.resolve({
        success: false,
        remoteConfirmed: false,
        error: 'Invalid user ID',
      });
    }
    return ipcRenderer.invoke('subnet:end-conversation', peerId.trim());
  },

  sendMessage: (
    recipientId: string,
    text: string
  ): Promise<{ success: boolean; messageId?: string; error?: string; isInvitation?: boolean }> => {
    if (typeof recipientId !== 'string' || !recipientId.trim()) {
      return Promise.resolve({ success: false, error: 'Invalid recipient ID' });
    }
    if (typeof text !== 'string' || !text.trim()) {
      return Promise.resolve({ success: false, error: 'Message cannot be empty' });
    }
    return ipcRenderer.invoke('subnet:send-message', {
      recipientId: recipientId.trim(),
      text: text.trim().slice(0, 5000),
    });
  },

  getSettings: (): Promise<UserSettings> => {
    return ipcRenderer.invoke('subnet:get-settings');
  },

  updateSettings: (settings: Partial<UserSettings>): Promise<UserSettings> => {
    return ipcRenderer.invoke('subnet:update-settings', settings);
  },

  copyText: (text: string): Promise<{ success: boolean; error?: string }> => {
    if (typeof text !== 'string' || !text) {
      return Promise.resolve({ success: false, error: 'Clipboard text is empty' });
    }
    return ipcRenderer.invoke('subnet:copy-text', text.slice(0, 10000));
  },

  selectAvatarFile: (): Promise<{ success: boolean; dataUrl?: string; error?: string }> => {
    return ipcRenderer.invoke('subnet:select-avatar-file');
  },

  getSystemAvatar: (): Promise<{ success: boolean; dataUrl?: string; error?: string }> => {
    return ipcRenderer.invoke('subnet:get-system-avatar');
  },

  selectAttachmentFile: (mode?: 'all' | 'media') => {
    return ipcRenderer.invoke('subnet:select-attachment-file', mode || 'all');
  },

  selectAttachmentFiles: (mode?: 'all' | 'media') => {
    return ipcRenderer.invoke('subnet:select-attachment-file', mode || 'all');
  },

  checkMediaPermissions: (type: 'camera' | 'microphone') => {
    return ipcRenderer.invoke('subnet:check-media-permissions', type);
  },

  requestMediaPermissions: (types: Array<'camera' | 'microphone'>) => {
    return ipcRenderer.invoke('subnet:request-media-permissions', types);
  },

  sendAttachment: (
    targetId: string,
    targetType: 'direct' | 'room',
    filePath: string,
    text?: string
  ) => {
    return ipcRenderer.invoke('subnet:send-attachment', {
      targetId,
      targetType,
      filePath,
      text,
    });
  },

  sendMediaAttachment: (
    targetId: string,
    targetType: 'direct' | 'room',
    media: {
      fileName: string;
      mimeType: string;
      base64Data: string;
    },
    text?: string
  ) => {
    return ipcRenderer.invoke('subnet:send-media-attachment', {
      targetId,
      targetType,
      media,
      text,
    });
  },

  downloadAttachment: (
    transferId: string,
    targetPeerId: string,
    customDestination?: string
  ) => {
    return ipcRenderer.invoke('subnet:download-attachment', {
      transferId,
      targetPeerId,
      customDestination,
    });
  },

  cancelTransfer: (transferId: string) => {
    return ipcRenderer.invoke('subnet:cancel-transfer', transferId);
  },

  showItemInFolder: (filePath: string) => {
    return ipcRenderer.invoke('subnet:show-item-in-folder', filePath);
  },

  openFile: (filePath: string) => {
    return ipcRenderer.invoke('subnet:open-file', filePath);
  },

  saveFileAs: (sourcePath: string, defaultName?: string) => {
    return ipcRenderer.invoke('subnet:save-file-as', { sourcePath, defaultName });
  },

  isElectron: true,

  onTransferProgress: (callback: (progress: any) => void): (() => void) => {
    const listener = (_event: IpcRendererEvent, progress: any) => callback(progress);
    ipcRenderer.on('subnet:transfer-progress', listener);
    return () => {
      ipcRenderer.removeListener('subnet:transfer-progress', listener);
    };
  },

  onPeerDiscovered: (callback: (peer: Peer) => void): (() => void) => {
    const listener = (_event: IpcRendererEvent, peer: Peer) => callback(peer);
    ipcRenderer.on('subnet:peer-discovered', listener);
    return () => {
      ipcRenderer.removeListener('subnet:peer-discovered', listener);
    };
  },

  onPeerUpdated: (callback: (peer: Peer) => void): (() => void) => {
    const listener = (_event: IpcRendererEvent, peer: Peer) => callback(peer);
    ipcRenderer.on('subnet:peer-updated', listener);
    return () => {
      ipcRenderer.removeListener('subnet:peer-updated', listener);
    };
  },

  onPeerLost: (callback: (peerId: string) => void): (() => void) => {
    const listener = (_event: IpcRendererEvent, peerId: string) => callback(peerId);
    ipcRenderer.on('subnet:peer-lost', listener);
    return () => {
      ipcRenderer.removeListener('subnet:peer-lost', listener);
    };
  },

  onStatusChanged: (callback: (status: NetworkStatus) => void): (() => void) => {
    const listener = (_event: IpcRendererEvent, status: NetworkStatus) => callback(status);
    ipcRenderer.on('subnet:status-changed', listener);
    return () => {
      ipcRenderer.removeListener('subnet:status-changed', listener);
    };
  },

  onMessageReceived: (callback: (message: Message) => void): (() => void) => {
    const listener = (_event: IpcRendererEvent, message: Message) => callback(message);
    ipcRenderer.on('subnet:message-received', listener);
    return () => {
      ipcRenderer.removeListener('subnet:message-received', listener);
    };
  },

  onMessageAck: (callback: (ack: MessageAck) => void): (() => void) => {
    const listener = (_event: IpcRendererEvent, ack: MessageAck) => callback(ack);
    ipcRenderer.on('subnet:message-ack', listener);
    return () => {
      ipcRenderer.removeListener('subnet:message-ack', listener);
    };
  },

  onInvitationReceived: (callback: (invitation: Invitation) => void): (() => void) => {
    const listener = (_event: IpcRendererEvent, invitation: Invitation) => callback(invitation);
    ipcRenderer.on('subnet:invitation-received', listener);
    return () => {
      ipcRenderer.removeListener('subnet:invitation-received', listener);
    };
  },

  onInvitationResponse: (callback: (response: InvitationResponse) => void): (() => void) => {
    const listener = (_event: IpcRendererEvent, response: InvitationResponse) => callback(response);
    ipcRenderer.on('subnet:invitation-response', listener);
    return () => {
      ipcRenderer.removeListener('subnet:invitation-response', listener);
    };
  },

  onConversationEnded: (callback: (data: { peerId: string }) => void): (() => void) => {
    const listener = (_event: IpcRendererEvent, data: { peerId: string }) => callback(data);
    ipcRenderer.on('subnet:conversation-ended', listener);
    return () => {
      ipcRenderer.removeListener('subnet:conversation-ended', listener);
    };
  },

  onConversationsUpdated: (callback: (conversations: ConversationSummary[]) => void): (() => void) => {
    const listener = (_event: IpcRendererEvent, list: ConversationSummary[]) => callback(list);
    ipcRenderer.on('subnet:conversations-updated', listener);
    return () => {
      ipcRenderer.removeListener('subnet:conversations-updated', listener);
    };
  },

  createPrivateRoom: (
    name: string,
    invitedPeerIds: string[]
  ): Promise<{ success: boolean; roomId?: string; error?: string }> => {
    return ipcRenderer.invoke('subnet:create-private-room', {
      name: (name || '').trim().slice(0, 80),
      invitedPeerIds: Array.isArray(invitedPeerIds) ? invitedPeerIds : [],
    });
  },

  inviteToPrivateRoom: (
    roomId: string,
    peerId: string
  ): Promise<{ success: boolean; error?: string }> => {
    if (typeof roomId !== 'string' || !roomId.trim() || typeof peerId !== 'string' || !peerId.trim()) {
      return Promise.resolve({ success: false, error: 'Invalid room or user ID' });
    }
    return ipcRenderer.invoke('subnet:invite-to-private-room', {
      roomId: roomId.trim(),
      peerId: peerId.trim(),
    });
  },

  createAnonymousRoom: (
    name: string,
    capacity?: number,
    nickname?: string
  ): Promise<{ success: boolean; roomId?: string; error?: string }> => {
    return ipcRenderer.invoke('subnet:create-anonymous-room', {
      name: (name || '').trim().slice(0, 80),
      capacity: typeof capacity === 'number' ? capacity : undefined,
      nickname: typeof nickname === 'string' ? nickname.trim() : undefined,
    });
  },

  getRooms: (): Promise<any[]> => {
    return ipcRenderer.invoke('subnet:get-rooms');
  },

  getRoomMessages: (roomId: string): Promise<any[]> => {
    if (typeof roomId !== 'string' || !roomId.trim()) return Promise.resolve([]);
    return ipcRenderer.invoke('subnet:get-room-messages', roomId.trim());
  },

  sendRoomMessage: (
    roomId: string,
    text: string
  ): Promise<{ success: boolean; messageId?: string; error?: string }> => {
    if (typeof roomId !== 'string' || !roomId.trim()) {
      return Promise.resolve({ success: false, error: 'Invalid room ID' });
    }
    if (typeof text !== 'string' || !text.trim()) {
      return Promise.resolve({ success: false, error: 'Message cannot be empty' });
    }
    return ipcRenderer.invoke('subnet:send-room-message', {
      roomId: roomId.trim(),
      text: text.trim().slice(0, 5000),
    });
  },

  respondToRoomInvitation: (
    roomId: string,
    accepted: boolean
  ): Promise<{ success: boolean; error?: string }> => {
    if (typeof roomId !== 'string' || !roomId.trim()) {
      return Promise.resolve({ success: false, error: 'Invalid room ID' });
    }
    return ipcRenderer.invoke('subnet:respond-to-room-invitation', {
      roomId: roomId.trim(),
      accepted: Boolean(accepted),
    });
  },

  joinAnonymousRoom: (
    roomId: string,
    nickname: string
  ): Promise<{ success: boolean; error?: string }> => {
    if (typeof roomId !== 'string' || !roomId.trim()) {
      return Promise.resolve({ success: false, error: 'Invalid room ID' });
    }
    if (typeof nickname !== 'string' || !nickname.trim()) {
      return Promise.resolve({ success: false, error: 'Nickname cannot be empty' });
    }
    return ipcRenderer.invoke('subnet:join-anonymous-room', {
      roomId: roomId.trim(),
      nickname: nickname.trim(),
    });
  },

  leaveRoom: (roomId: string): Promise<{ success: boolean; error?: string }> => {
    if (typeof roomId !== 'string' || !roomId.trim()) {
      return Promise.resolve({ success: false, error: 'Invalid room ID' });
    }
    return ipcRenderer.invoke('subnet:leave-room', roomId.trim());
  },

  closeRoom: (roomId: string): Promise<{ success: boolean; error?: string }> => {
    if (typeof roomId !== 'string' || !roomId.trim()) {
      return Promise.resolve({ success: false, error: 'Invalid room ID' });
    }
    return ipcRenderer.invoke('subnet:close-room', roomId.trim());
  },

  deleteRoom: (roomId: string): Promise<{ success: boolean; error?: string }> => {
    if (typeof roomId !== 'string' || !roomId.trim()) {
      return Promise.resolve({ success: false, error: 'Invalid room ID' });
    }
    return ipcRenderer.invoke('subnet:delete-room', roomId.trim());
  },

  markRoomRead: (roomId: string): Promise<void> => {
    if (typeof roomId !== 'string' || !roomId.trim()) {
      return Promise.resolve();
    }
    return ipcRenderer.invoke('subnet:mark-room-read', roomId.trim());
  },

  getDiscoveredAnonymousRooms: (): Promise<any[]> => {
    return ipcRenderer.invoke('subnet:get-discovered-anonymous-rooms');
  },

  onRoomsUpdated: (callback: (rooms: any[]) => void): (() => void) => {
    const listener = (_event: IpcRendererEvent, rooms: any[]) => callback(rooms);
    ipcRenderer.on('subnet:rooms-updated', listener);
    return () => {
      ipcRenderer.removeListener('subnet:rooms-updated', listener);
    };
  },

  onRoomClosed: (callback: (data: { roomId: string; reason?: string }) => void): (() => void) => {
    const listener = (_event: IpcRendererEvent, data: { roomId: string; reason?: string }) => callback(data);
    ipcRenderer.on('subnet:room-closed', listener);
    return () => {
      ipcRenderer.removeListener('subnet:room-closed', listener);
    };
  },

  onRoomMessageReceived: (callback: (message: any) => void): (() => void) => {
    const listener = (_event: IpcRendererEvent, msg: any) => callback(msg);
    ipcRenderer.on('subnet:room-message-received', listener);
    return () => {
      ipcRenderer.removeListener('subnet:room-message-received', listener);
    };
  },

  onRoomInvitationReceived: (callback: (invitation: any) => void): (() => void) => {
    const listener = (_event: IpcRendererEvent, inv: any) => callback(inv);
    ipcRenderer.on('subnet:room-invitation-received', listener);
    return () => {
      ipcRenderer.removeListener('subnet:room-invitation-received', listener);
    };
  },

  onDiscoveredRoomsUpdated: (callback: (rooms: any[]) => void): (() => void) => {
    const listener = (_event: IpcRendererEvent, list: any[]) => callback(list);
    ipcRenderer.on('subnet:discovered-rooms-updated', listener);
    return () => {
      ipcRenderer.removeListener('subnet:discovered-rooms-updated', listener);
    };
  },

  onSettingsUpdated: (callback: (settings: UserSettings) => void): (() => void) => {
    const listener = (_event: IpcRendererEvent, s: UserSettings) => callback(s);
    ipcRenderer.on('subnet:settings-updated', listener);
    return () => {
      ipcRenderer.removeListener('subnet:settings-updated', listener);
    };
  },
};

contextBridge.exposeInMainWorld('subnet', subnetBridge);
