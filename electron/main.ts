import {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  nativeImage,
  shell,
  session,
  systemPreferences,
  protocol,
  net,
} from 'electron';
import path from 'path';
import os from 'os';
import fs from 'fs';
import crypto from 'crypto';
import url from 'url';
import { ConnectionManager } from './network/connection-manager';
import { getSystemAccountPicture } from './utils/system-avatar';

// Register standard custom media scheme before app is ready
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'subnet-media',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      bypassCSP: true,
      corsEnabled: true,
    },
  },
]);
import type {
  LocalProfile,
  NetworkStatus,
  Peer,
  Message,
  MessageAck,
  Invitation,
  InvitationResponse,
  ConversationSummary,
  UserSettings,
} from '../src/types/subnet';

let mainWindow: BrowserWindow | null = null;
let connectionManager: ConnectionManager | null = null;

// Generate stable per-launch session peer ID
const localPeerId = crypto.randomUUID();
const localProfile: LocalProfile = {
  id: localPeerId,
  name: `${os.userInfo().username}'s ${os.platform() === 'darwin' ? 'Mac' : 'Device'}`,
  deviceModel: os.hostname(),
};

function createWindow(): void {
  // Configure Electron session permission handlers for camera and microphone
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    if (permission === 'media') {
      callback(true);
    } else {
      callback(false);
    }
  });

  session.defaultSession.setPermissionCheckHandler((_webContents, permission) => {
    if (permission === 'media') {
      return true;
    }
    return false;
  });

  mainWindow = new BrowserWindow({
    width: 960,
    height: 680,
    minWidth: 780,
    minHeight: 520,
    title: 'Subnet',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 18, y: 18 },
    vibrancy: 'under-window',
    visualEffectState: 'active',
    backgroundColor: '#0c0f17',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    mainWindow.loadURL(devServerUrl);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function setupNetworking(): void {
  connectionManager = new ConnectionManager(localProfile);

  // Forward network & chat events over IPC to the sandboxed renderer
  connectionManager.on('peer-discovered', (peer: Peer) => {
    console.log(`[Subnet:IPC] Emitting subnet:peer-discovered to renderer for "${peer.name}" (${peer.id.slice(0, 8)})`);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('subnet:peer-discovered', peer);
    }
  });

  connectionManager.on('peer-lost', (peerId: string) => {
    console.log(`[Subnet:IPC] Emitting subnet:peer-lost to renderer for ${peerId.slice(0, 8)}`);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('subnet:peer-lost', peerId);
    }
  });

  connectionManager.on('peer-updated', (peer: Peer) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('subnet:peer-updated', peer);
    }
  });

  connectionManager.on('status-changed', (status: NetworkStatus) => {
    console.log(`[Subnet:IPC] Emitting subnet:status-changed (peers: ${status.peerCount}, port: ${status.port})`);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('subnet:status-changed', status);
    }
  });

  connectionManager.on('message-received', (message: Message) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('subnet:message-received', message);
    }
  });

  connectionManager.on('message-ack', (ack: MessageAck) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('subnet:message-ack', ack);
    }
  });

  connectionManager.on('invitation-received', (invitation: Invitation) => {
    console.log(`[Subnet:IPC] Emitting subnet:invitation-received for invitation from ${invitation.senderName}`);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('subnet:invitation-received', invitation);
    }
  });

  connectionManager.on('invitation-response', (response: InvitationResponse) => {
    console.log(`[Subnet:IPC] Emitting subnet:invitation-response (${response.accepted ? 'accepted' : 'declined'})`);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('subnet:invitation-response', response);
    }
  });

  connectionManager.on('conversations-updated', (conversations: ConversationSummary[]) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('subnet:conversations-updated', conversations);
    }
  });

  connectionManager.on('conversation-ended', (data: { peerId: string }) => {
    console.log(`[Subnet:IPC] Emitting subnet:conversation-ended for peer ${data.peerId}`);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('subnet:conversation-ended', data);
    }
  });

  connectionManager.on('rooms-updated', (rooms: any[]) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('subnet:rooms-updated', rooms);
    }
  });

  connectionManager.on('room-message-received', (message: any) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('subnet:room-message-received', message);
    }
  });

  connectionManager.on('room-invitation-received', (invitation: any) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('subnet:room-invitation-received', invitation);
    }
  });

  connectionManager.on('discovered-rooms-updated', (rooms: any[]) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('subnet:discovered-rooms-updated', rooms);
    }
  });

  connectionManager.on('room-closed', (data: { roomId: string; reason?: string }) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('subnet:room-closed', data);
    }
  });

  connectionManager.on('transfer-progress', (progress: any) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('subnet:transfer-progress', progress);
    }
  });

  // Start the networking core
  connectionManager.start().then(() => {
    ensureDefaultDeviceAvatar().catch((err) => {
      console.log('[Subnet:Avatar] Could not initialize device profile picture:', err.message);
    });
  }).catch((err) => {
    console.error('Failed to start Subnet networking core:', err);
  });
}

async function ensureDefaultDeviceAvatar(): Promise<void> {
  if (!connectionManager) return;
  const settings = connectionManager.getSettings();
  if (settings.avatarType === 'default' && !settings.avatarValue) {
    try {
      const res = await getSystemAccountPicture();
      if (res.success && res.dataUrl) {
        connectionManager.updateSettings({
          avatarType: 'custom',
          avatarValue: res.dataUrl,
        });
        console.log('[Subnet:Avatar] Defaulted to device profile picture');
      }
    } catch (err: any) {
      console.log('[Subnet:Avatar] Device profile picture not available:', err.message);
    }
  }
}

// IPC Handlers with defensive parameter validation
ipcMain.handle('subnet:get-profile', async (): Promise<LocalProfile> => {
  if (connectionManager) {
    const settings = connectionManager.getSettings();
    return {
      ...localProfile,
      avatar:
        settings.shareAvatarWithPeers !== false && settings.avatarType !== 'default'
          ? { avatarType: settings.avatarType, avatarValue: settings.avatarValue }
          : undefined,
    };
  }
  return localProfile;
});

ipcMain.handle('subnet:get-network-status', async (): Promise<NetworkStatus> => {
  if (connectionManager) {
    return connectionManager.getNetworkStatus();
  }
  return {
    isRunning: false,
    peerCount: 0,
    localIp: undefined,
  };
});

ipcMain.handle('subnet:get-peers', async (): Promise<Peer[]> => {
  if (connectionManager) {
    return connectionManager.getDiscoveredPeers();
  }
  return [];
});

ipcMain.handle('subnet:get-conversations', async (): Promise<ConversationSummary[]> => {
  if (connectionManager) {
    return connectionManager.getConversations();
  }
  return [];
});

ipcMain.handle('subnet:get-conversation-messages', async (_event, peerId: unknown): Promise<Message[]> => {
  if (typeof peerId !== 'string' || !peerId.trim()) {
    return [];
  }
  if (connectionManager) {
    return connectionManager.getConversationMessages(peerId.trim());
  }
  return [];
});

ipcMain.handle('subnet:get-settings', async (): Promise<UserSettings> => {
  if (connectionManager) {
    const settings = connectionManager.getSettings();
    if (settings.avatarType === 'default' && !settings.avatarValue) {
      try {
        const res = await getSystemAccountPicture();
        if (res.success && res.dataUrl) {
          return connectionManager.updateSettings({
            avatarType: 'custom',
            avatarValue: res.dataUrl,
          });
        }
      } catch { }
    }
    return settings;
  }
  return {
    avatarType: 'default',
    avatarValue: '',
    defaultAnonymousNickname: '',
    theme: 'system',
    notificationsEnabled: true,
    soundEnabled: true,
    shareAvatarWithPeers: true,
  };
});

ipcMain.handle(
  'subnet:update-settings',
  async (_event, partialSettings: unknown): Promise<UserSettings> => {
    if (!partialSettings || typeof partialSettings !== 'object') {
      throw new Error('Invalid settings object');
    }
    const cleanPartial: Partial<UserSettings> = {};
    const p = partialSettings as Record<string, unknown>;

    if (p.avatarType === 'default' || p.avatarType === 'preset' || p.avatarType === 'custom') {
      cleanPartial.avatarType = p.avatarType;
    }
    if (typeof p.avatarValue === 'string') {
      cleanPartial.avatarValue = p.avatarValue;
    }
    if (typeof p.defaultAnonymousNickname === 'string') {
      cleanPartial.defaultAnonymousNickname = p.defaultAnonymousNickname.trim().slice(0, 50);
    }
    if (p.theme === 'system' || p.theme === 'dark' || p.theme === 'light') {
      cleanPartial.theme = p.theme;
    }
    if (typeof p.notificationsEnabled === 'boolean') {
      cleanPartial.notificationsEnabled = p.notificationsEnabled;
    }
    if (typeof p.soundEnabled === 'boolean') {
      cleanPartial.soundEnabled = p.soundEnabled;
    }
    if (typeof p.shareAvatarWithPeers === 'boolean') {
      cleanPartial.shareAvatarWithPeers = p.shareAvatarWithPeers;
    }

    if (connectionManager) {
      const updated = connectionManager.updateSettings(cleanPartial);
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('subnet:settings-updated', updated);
      }
      return updated;
    }
    throw new Error('ConnectionManager not available');
  }
);

ipcMain.handle(
  'subnet:get-system-avatar',
  async (): Promise<{ success: boolean; dataUrl?: string; error?: string }> => {
    return await getSystemAccountPicture();
  }
);

ipcMain.handle(
  'subnet:select-avatar-file',
  async (): Promise<{ success: boolean; dataUrl?: string; error?: string }> => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      return { success: false, error: 'App window unavailable' };
    }

    try {
      const result = await dialog.showOpenDialog(mainWindow, {
        title: 'Select Profile Picture',
        buttonLabel: 'Select Avatar',
        properties: ['openFile'],
        filters: [
          { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] },
        ],
      });

      if (result.canceled || result.filePaths.length === 0) {
        return { success: false, error: 'Selection cancelled' };
      }

      const filePath = result.filePaths[0];
      const stats = await fs.promises.stat(filePath);
      const MAX_AVATAR_SIZE = 10 * 1024 * 1024; // 10 MB file read limit
      if (stats.size > MAX_AVATAR_SIZE) {
        return {
          success: false,
          error: 'Image too large. Please select an image under 10MB.',
        };
      }

      const img = nativeImage.createFromPath(filePath);
      if (img.isEmpty()) {
        return { success: false, error: 'Could not decode image file' };
      }

      // Resize to 96x96 for crisp display and compress to JPEG under 45KB payload
      const resized = img.resize({ width: 96, height: 96, quality: 'better' });
      const jpegBuffer = resized.toJPEG(85);
      const dataUrl = `data:image/jpeg;base64,${jpegBuffer.toString('base64')}`;

      if (dataUrl.length > 45000) {
        return { success: false, error: 'Compressed avatar payload exceeds safe size limit' };
      }

      return { success: true, dataUrl };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to read image file' };
    }
  }
);

ipcMain.handle(
  'subnet:respond-to-invitation',
  async (_event, payload: unknown): Promise<{ success: boolean; error?: string }> => {
    if (!payload || typeof payload !== 'object') {
      return { success: false, error: 'Malformed invitation response request' };
    }
    const { invitationId, accepted } = payload as Record<string, unknown>;
    if (typeof invitationId !== 'string' || !invitationId.trim()) {
      return { success: false, error: 'Invitation ID must be a non-empty string' };
    }
    if (typeof accepted !== 'boolean') {
      return { success: false, error: 'Accepted parameter must be a boolean' };
    }

    if (!connectionManager) {
      return { success: false, error: 'Networking core is not running' };
    }

    return connectionManager.respondToInvitation(invitationId.trim(), accepted);
  }
);

ipcMain.handle('subnet:mark-conversation-read', async (_event, peerId: unknown): Promise<void> => {
  if (typeof peerId !== 'string' || !peerId.trim()) {
    return;
  }
  if (connectionManager) {
    connectionManager.setActiveChatPeerId(peerId.trim());
  }
});

ipcMain.handle(
  'subnet:delete-conversation',
  async (_event, peerId: unknown): Promise<{ success: boolean; error?: string }> => {
    if (typeof peerId !== 'string' || !peerId.trim()) {
      return { success: false, error: 'Invalid peer ID' };
    }
    if (!connectionManager) {
      return { success: false, error: 'Networking core is not running' };
    }
    const success = connectionManager.deleteConversation(peerId.trim());
    return { success };
  }
);

ipcMain.handle(
  'subnet:end-conversation',
  async (
    _event,
    peerId: unknown
  ): Promise<{ success: boolean; remoteConfirmed: boolean; error?: string }> => {
    if (typeof peerId !== 'string' || !peerId.trim()) {
      return { success: false, remoteConfirmed: false, error: 'Invalid peer ID' };
    }
    if (!connectionManager) {
      return { success: false, remoteConfirmed: false, error: 'Networking core is not running' };
    }
    return connectionManager.endConversation(peerId.trim());
  }
);

ipcMain.handle(
  'subnet:send-message',
  async (_event, payload: unknown): Promise<{ success: boolean; messageId?: string; error?: string; isInvitation?: boolean }> => {
    if (!payload || typeof payload !== 'object') {
      return { success: false, error: 'Malformed message request' };
    }

    const { recipientId, text } = payload as Record<string, unknown>;
    if (typeof recipientId !== 'string' || !recipientId.trim()) {
      return { success: false, error: 'Recipient ID must be a non-empty string' };
    }
    if (typeof text !== 'string' || !text.trim()) {
      return { success: false, error: 'Message text cannot be empty' };
    }

    if (!connectionManager) {
      return { success: false, error: 'Networking core is not running' };
    }

    return connectionManager.sendMessage(recipientId.trim(), text.trim());
  }
);

ipcMain.handle(
  'subnet:create-private-room',
  async (_event, payload: unknown): Promise<{ success: boolean; roomId?: string; error?: string }> => {
    if (!payload || typeof payload !== 'object') {
      return { success: false, error: 'Malformed request' };
    }
    const { name, invitedPeerIds } = payload as Record<string, unknown>;
    if (typeof name !== 'string' || !name.trim()) {
      return { success: false, error: 'Room name cannot be empty' };
    }
    if (!Array.isArray(invitedPeerIds) || invitedPeerIds.length === 0) {
      return { success: false, error: 'Must select at least one participant' };
    }
    if (!connectionManager) {
      return { success: false, error: 'Networking core is not running' };
    }
    return connectionManager.createPrivateRoom(
      name.trim(),
      invitedPeerIds.filter((id) => typeof id === 'string' && id.trim())
    );
  }
);

ipcMain.handle(
  'subnet:create-anonymous-room',
  async (_event, payload: unknown): Promise<{ success: boolean; roomId?: string; error?: string }> => {
    if (!payload || typeof payload !== 'object') {
      return { success: false, error: 'Malformed request' };
    }
    const { name, capacity, nickname } = payload as Record<string, unknown>;
    if (typeof name !== 'string' || !name.trim()) {
      return { success: false, error: 'Room name cannot be empty' };
    }
    if (!connectionManager) {
      return { success: false, error: 'Networking core is not running' };
    }
    return connectionManager.createAnonymousRoom(
      name.trim(),
      typeof capacity === 'number' ? capacity : undefined,
      typeof nickname === 'string' ? nickname : undefined
    );
  }
);

ipcMain.handle('subnet:get-rooms', async (): Promise<any[]> => {
  if (connectionManager) {
    return connectionManager.getRooms();
  }
  return [];
});

ipcMain.handle('subnet:get-room-messages', async (_event, roomId: unknown): Promise<any[]> => {
  if (typeof roomId !== 'string' || !roomId.trim() || !connectionManager) {
    return [];
  }
  return connectionManager.getRoomMessages(roomId.trim());
});

ipcMain.handle(
  'subnet:send-room-message',
  async (_event, payload: unknown): Promise<{ success: boolean; messageId?: string; error?: string }> => {
    if (!payload || typeof payload !== 'object' || !connectionManager) {
      return { success: false, error: 'Malformed request' };
    }
    const { roomId, text } = payload as Record<string, unknown>;
    if (typeof roomId !== 'string' || !roomId.trim()) {
      return { success: false, error: 'Invalid room ID' };
    }
    if (typeof text !== 'string' || !text.trim()) {
      return { success: false, error: 'Message cannot be empty' };
    }
    return connectionManager.sendRoomMessage(roomId.trim(), text.trim());
  }
);

ipcMain.handle(
  'subnet:respond-to-room-invitation',
  async (_event, payload: unknown): Promise<{ success: boolean; error?: string }> => {
    if (!payload || typeof payload !== 'object' || !connectionManager) {
      return { success: false, error: 'Malformed request' };
    }
    const { roomId, accepted } = payload as Record<string, unknown>;
    if (typeof roomId !== 'string' || !roomId.trim() || typeof accepted !== 'boolean') {
      return { success: false, error: 'Invalid parameters' };
    }
    return connectionManager.respondToRoomInvitation(roomId.trim(), accepted);
  }
);

ipcMain.handle(
  'subnet:join-anonymous-room',
  async (_event, payload: unknown): Promise<{ success: boolean; error?: string }> => {
    if (!payload || typeof payload !== 'object' || !connectionManager) {
      return { success: false, error: 'Malformed request' };
    }
    const { roomId, nickname } = payload as Record<string, unknown>;
    if (typeof roomId !== 'string' || !roomId.trim()) {
      return { success: false, error: 'Invalid room ID' };
    }
    if (typeof nickname !== 'string' || !nickname.trim()) {
      return { success: false, error: 'Nickname cannot be empty' };
    }
    return connectionManager.joinAnonymousRoom(roomId.trim(), nickname.trim());
  }
);

ipcMain.handle('subnet:leave-room', async (_event, roomId: unknown): Promise<{ success: boolean; error?: string }> => {
  if (typeof roomId !== 'string' || !roomId.trim() || !connectionManager) {
    return { success: false, error: 'Invalid room ID' };
  }
  return connectionManager.leaveRoom(roomId.trim());
});

ipcMain.handle('subnet:close-room', async (_event, roomId: unknown): Promise<{ success: boolean; error?: string }> => {
  if (typeof roomId !== 'string' || !roomId.trim() || !connectionManager) {
    return { success: false, error: 'Invalid room ID' };
  }
  return connectionManager.closeRoom(roomId.trim());
});

ipcMain.handle('subnet:delete-room', async (_event, roomId: unknown): Promise<{ success: boolean; error?: string }> => {
  if (typeof roomId !== 'string' || !roomId.trim() || !connectionManager) {
    return { success: false, error: 'Invalid room ID' };
  }
  return connectionManager.deleteRoom(roomId.trim());
});

ipcMain.handle('subnet:mark-room-read', async (_event, roomId: unknown): Promise<void> => {
  if (typeof roomId === 'string' && roomId.trim() && connectionManager) {
    connectionManager.markRoomRead(roomId.trim());
  }
});

ipcMain.handle('subnet:get-discovered-anonymous-rooms', async (): Promise<any[]> => {
  if (connectionManager) {
    return connectionManager.getDiscoveredAnonymousRooms();
  }
  return [];
});

ipcMain.handle(
  'subnet:select-attachment-file',
  async (_event, mode: 'all' | 'media'): Promise<{
    success: boolean;
    files?: Array<{
      filePath: string;
      fileName: string;
      fileSize: number;
      mimeType: string;
      thumbnail?: string;
    }>;
    file?: {
      filePath: string;
      fileName: string;
      fileSize: number;
      mimeType: string;
      thumbnail?: string;
    };
    error?: string;
  }> => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      return { success: false, error: 'App window unavailable' };
    }

    try {
      const filters =
        mode === 'media'
          ? [
            {
              name: 'Photos & Videos',
              extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'mp4', 'mov', 'webm', 'mkv'],
            },
            { name: 'All Files', extensions: ['*'] },
          ]
          : [{ name: 'All Files', extensions: ['*'] }];

      const result = await dialog.showOpenDialog(mainWindow, {
        title: mode === 'media' ? 'Select Photo or Video' : 'Select Files to Send',
        buttonLabel: 'Choose',
        properties: ['openFile', 'multiSelections'],
        filters,
      });

      if (result.canceled || result.filePaths.length === 0) {
        return { success: false, error: 'Selection cancelled' };
      }

      const selectedFiles: Array<{
        filePath: string;
        fileName: string;
        fileSize: number;
        mimeType: string;
        thumbnail?: string;
      }> = [];

      for (const filePath of result.filePaths) {
        const stats = await fs.promises.stat(filePath);
        if (!stats.isFile()) continue;

        const fileName = path.basename(filePath);
        let mimeType = 'application/octet-stream';
        const ext = path.extname(filePath).toLowerCase();
        if (ext === '.jpg' || ext === '.jpeg') mimeType = 'image/jpeg';
        else if (ext === '.png') mimeType = 'image/png';
        else if (ext === '.gif') mimeType = 'image/gif';
        else if (ext === '.webp') mimeType = 'image/webp';
        else if (ext === '.mp4') mimeType = 'video/mp4';
        else if (ext === '.mov') mimeType = 'video/quicktime';
        else if (ext === '.webm') mimeType = 'video/webm';
        else if (ext === '.pdf') mimeType = 'application/pdf';
        else if (ext === '.zip') mimeType = 'application/zip';
        else if (ext === '.tar' || ext === '.gz') mimeType = 'application/gzip';
        else if (ext === '.txt' || ext === '.md') mimeType = 'text/plain';

        let thumbnail: string | undefined;
        if (mimeType.startsWith('image/')) {
          try {
            const img = nativeImage.createFromPath(filePath);
            if (!img.isEmpty()) {
              const resized = img.resize({ width: 120, height: 120, quality: 'better' });
              thumbnail = `data:image/jpeg;base64,${resized.toJPEG(75).toString('base64')}`;
            }
          } catch { }
        }

        selectedFiles.push({
          filePath,
          fileName,
          fileSize: stats.size,
          mimeType,
          thumbnail,
        });
      }

      if (selectedFiles.length === 0) {
        return { success: false, error: 'No valid files selected' };
      }

      return {
        success: true,
        files: selectedFiles,
        file: selectedFiles[0],
      };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to select file' };
    }
  }
);

ipcMain.handle(
  'subnet:check-media-permissions',
  async (_event, mediaType: 'camera' | 'microphone') => {
    if (process.platform === 'darwin') {
      try {
        const status = systemPreferences.getMediaAccessStatus(mediaType);
        return { success: true, status };
      } catch (err: any) {
        return { success: false, status: 'unknown', error: err.message };
      }
    }
    return { success: true, status: 'granted' };
  }
);

ipcMain.handle(
  'subnet:request-media-permissions',
  async (_event, mediaTypes: Array<'camera' | 'microphone'>) => {
    if (process.platform === 'darwin') {
      const results: Record<string, boolean> = {};
      try {
        for (const type of mediaTypes) {
          const current = systemPreferences.getMediaAccessStatus(type);
          if (current === 'granted') {
            results[type] = true;
          } else if (current === 'denied' || current === 'restricted') {
            results[type] = false;
          } else {
            // 'not-determined' triggers native macOS TCC prompt and System Settings registration
            const granted = await systemPreferences.askForMediaAccess(type);
            results[type] = granted;
          }
        }
        const allGranted = Object.values(results).every(Boolean);
        return { success: allGranted, results };
      } catch (err: any) {
        return { success: false, results, error: err.message };
      }
    }
    return { success: true, results: { camera: true, microphone: true } };
  }
);

ipcMain.handle(
  'subnet:send-attachment',
  async (
    _event,
    payload: unknown
  ): Promise<{ success: boolean; messageId?: string; error?: string }> => {
    if (!payload || typeof payload !== 'object' || !connectionManager) {
      return { success: false, error: 'Malformed request' };
    }
    const { targetId, targetType, filePath, text } = payload as Record<string, unknown>;
    if (typeof targetId !== 'string' || !targetId.trim()) {
      return { success: false, error: 'Invalid target ID' };
    }
    if (typeof filePath !== 'string' || !filePath.trim()) {
      return { success: false, error: 'Invalid file path' };
    }

    const caption = typeof text === 'string' ? text.trim() : '';

    if (targetType === 'room') {
      return connectionManager.sendRoomAttachmentMessage(targetId.trim(), filePath.trim(), caption);
    } else {
      return connectionManager.sendAttachmentMessage(targetId.trim(), filePath.trim(), caption);
    }
  }
);

ipcMain.handle(
  'subnet:send-media-attachment',
  async (
    _event,
    payload: unknown
  ): Promise<{ success: boolean; messageId?: string; error?: string }> => {
    if (!payload || typeof payload !== 'object' || !connectionManager) {
      return { success: false, error: 'Malformed request' };
    }
    const { targetId, targetType, media, text } = payload as Record<string, unknown>;
    if (typeof targetId !== 'string' || !targetId.trim()) {
      return { success: false, error: 'Invalid target ID' };
    }
    if (!media || typeof media !== 'object') {
      return { success: false, error: 'Invalid media object' };
    }
    const m = media as Record<string, unknown>;
    if (typeof m.fileName !== 'string' || typeof m.base64Data !== 'string') {
      return { success: false, error: 'Missing media filename or data' };
    }

    const buffer = Buffer.from(m.base64Data, 'base64');
    const mimeType = typeof m.mimeType === 'string' ? m.mimeType : 'application/octet-stream';
    const caption = typeof text === 'string' ? text.trim() : '';

    if (targetType === 'room') {
      return connectionManager.sendRoomMediaAttachment(
        targetId.trim(),
        m.fileName,
        mimeType,
        buffer,
        caption
      );
    } else {
      return connectionManager.sendMediaAttachment(
        targetId.trim(),
        m.fileName,
        mimeType,
        buffer,
        caption
      );
    }
  }
);

ipcMain.handle(
  'subnet:download-attachment',
  async (
    _event,
    payload: unknown
  ): Promise<{ success: boolean; error?: string }> => {
    if (!payload || typeof payload !== 'object' || !connectionManager) {
      return { success: false, error: 'Malformed download request' };
    }
    const { transferId, targetPeerId, customDestination } = payload as Record<string, unknown>;
    if (typeof transferId !== 'string' || !transferId.trim()) {
      return { success: false, error: 'Invalid transfer ID' };
    }
    if (typeof targetPeerId !== 'string' || !targetPeerId.trim()) {
      return { success: false, error: 'Invalid peer ID' };
    }

    return connectionManager.downloadAttachment(
      transferId.trim(),
      targetPeerId.trim(),
      typeof customDestination === 'string' ? customDestination : undefined
    );
  }
);

ipcMain.handle(
  'subnet:cancel-transfer',
  async (_event, transferId: unknown): Promise<{ success: boolean; error?: string }> => {
    if (typeof transferId !== 'string' || !transferId.trim() || !connectionManager) {
      return { success: false, error: 'Invalid transfer ID' };
    }
    return connectionManager.cancelTransfer(transferId.trim());
  }
);

ipcMain.handle(
  'subnet:show-item-in-folder',
  async (_event, filePath: unknown): Promise<{ success: boolean; error?: string }> => {
    if (typeof filePath !== 'string' || !filePath.trim()) {
      return { success: false, error: 'Invalid file path' };
    }
    try {
      shell.showItemInFolder(filePath.trim());
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
);

ipcMain.handle(
  'subnet:open-file',
  async (_event, filePath: unknown): Promise<{ success: boolean; error?: string }> => {
    if (typeof filePath !== 'string' || !filePath.trim()) {
      return { success: false, error: 'Invalid file path' };
    }
    try {
      const err = await shell.openPath(filePath.trim());
      if (err) {
        return { success: false, error: err };
      }
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
);

ipcMain.handle(
  'subnet:save-file-as',
  async (
    _event,
    payload: unknown
  ): Promise<{ success: boolean; canceled?: boolean; savedPath?: string; error?: string }> => {
    if (!payload || typeof payload !== 'object' || !mainWindow) {
      return { success: false, error: 'Malformed save request' };
    }
    const { sourcePath, defaultName } = payload as Record<string, unknown>;
    if (typeof sourcePath !== 'string' || !sourcePath.trim()) {
      return { success: false, error: 'Invalid source path' };
    }

    try {
      const cleanPath = sourcePath.trim();
      if (!fs.existsSync(cleanPath)) {
        return { success: false, error: 'Source file does not exist on disk' };
      }

      const defaultFilename =
        typeof defaultName === 'string' && defaultName.trim()
          ? defaultName.trim()
          : path.basename(cleanPath);

      const saveResult = await dialog.showSaveDialog(mainWindow, {
        title: 'Save Attachment',
        defaultPath: path.join(app.getPath('downloads'), defaultFilename),
      });

      if (saveResult.canceled || !saveResult.filePath) {
        return { success: false, canceled: true };
      }

      await fs.promises.copyFile(cleanPath, saveResult.filePath);
      return { success: true, savedPath: saveResult.filePath };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to save file' };
    }
  }
);

app.whenReady().then(() => {
  // Protocol handler for serving local media files safely without CSP blocking or high memory
  protocol.handle('subnet-media', (request) => {
    try {
      const parsed = new URL(request.url);
      let filePath = decodeURIComponent(parsed.pathname);
      if (parsed.hostname && parsed.hostname !== 'localhost') {
        filePath = decodeURIComponent('/' + parsed.hostname + parsed.pathname);
      }
      if (process.platform === 'win32' && filePath.startsWith('/')) {
        filePath = filePath.slice(1);
      }
      if (!fs.existsSync(filePath)) {
        return new Response('File not found', { status: 404 });
      }
      const fileUrl = url.pathToFileURL(filePath).toString();
      return net.fetch(fileUrl);
    } catch (err: any) {
      return new Response(err.message || 'Error loading media', { status: 500 });
    }
  });

  createWindow();
  setupNetworking();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('before-quit', async () => {
  if (connectionManager) {
    await connectionManager.stop();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
