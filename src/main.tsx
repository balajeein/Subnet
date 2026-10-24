import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/index.css';

// Browser fallback when previewing in standard browser outside Electron
if (typeof window !== 'undefined' && !(window as any).subnet) {
  (window as any).subnet = {
    getProfile: () =>
      Promise.resolve({
        id: 'local-mac-001',
        name: "balajee's Mac Studio",
        host: '192.168.1.5',
        port: 51234,
      }),
    getNetworkStatus: () =>
      Promise.resolve({ isRunning: true, peerCount: 30, localIp: '192.168.1.5' }),
    getPeers: () => {
      const mockNames = [
        'Alice MacBook Pro',
        'Bob iPhone 16',
        'Charlie Studio',
        'Dana iPad',
        'Elena Mac Mini',
        'Frank Workstation',
        'Grace Air',
        'Henry Laptop',
        'Isla Mac Pro',
        'Jack Desktop',
      ];
      const presets = ['preset-fox', 'preset-cat', 'preset-panda', 'preset-owl', 'preset-wolf'];
      const peers = [];
      for (let i = 1; i <= 30; i++) {
        peers.push({
          id: `mock-peer-${String(i).padStart(2, '0')}`,
          name: `${mockNames[(i - 1) % mockNames.length]} #${i}`,
          host: `192.168.1.${100 + i}`,
          port: 51234 + i,
          lastSeen: Date.now(),
          avatar: {
            avatarType: 'preset' as const,
            avatarValue: presets[(i - 1) % presets.length],
          },
        });
      }
      return Promise.resolve(peers);
    },
    getConversations: () =>
      Promise.resolve([
        {
          peerId: 'mock-peer-01',
          peerName: 'Alice MacBook Pro',
          lastMessage: 'The soft cream and lavender palette feels so calm ✨',
          lastTimestamp: Date.now() - 1000 * 60 * 12,
          unreadCount: 1,
          status: 'accepted',
          peerAvatar: { avatarType: 'preset', avatarValue: 'preset-cat' },
        },
        {
          peerId: 'mock-peer-02',
          peerName: 'Bob iPhone 16',
          lastMessage: 'Check out the new mascot avatars for the rooms',
          lastTimestamp: Date.now() - 1000 * 60 * 45,
          unreadCount: 0,
          status: 'accepted',
          peerAvatar: { avatarType: 'preset', avatarValue: 'preset-panda' },
        },
      ]),
    getConversationMessages: (peerId: string) =>
      Promise.resolve([
        {
          id: 'msg-1',
          senderId: peerId,
          recipientId: 'local-mac-001',
          text: 'Hey! Have you seen the new minimal pastel redesign?',
          timestamp: Date.now() - 1000 * 60 * 15,
          type: 'text',
          direction: 'incoming',
          status: 'delivered',
        },
        {
          id: 'msg-2',
          senderId: 'local-mac-001',
          recipientId: peerId,
          text: 'Yes! The soft cream surfaces, lavender outgoing bubbles, and mascot avatars look stunning 💜',
          timestamp: Date.now() - 1000 * 60 * 10,
          type: 'text',
          direction: 'outgoing',
          status: 'delivered',
        },
        {
          id: 'msg-3',
          senderId: peerId,
          recipientId: 'local-mac-001',
          text: 'Here is the landscape photo from the shoot yesterday:',
          timestamp: Date.now() - 1000 * 60 * 5,
          type: 'file',
          direction: 'incoming',
          status: 'delivered',
          localAttachmentPath:
            'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400" viewBox="0 0 600 400"><defs><linearGradient id="sky" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" stop-color="%23E89B72"/><stop offset="50%" stop-color="%23C58CE3"/><stop offset="100%" stop-color="%237B5BA8"/></linearGradient><linearGradient id="sea" x1="0%" y1="0%" x2="0%" y2="100%"><stop offset="0%" stop-color="%234C5A96"/><stop offset="100%" stop-color="%23242C4C"/></linearGradient></defs><rect width="600" height="260" fill="url(%23sky)"/><circle cx="300" cy="200" r="60" fill="%23FFF2BD" opacity="0.95"/><rect y="260" width="600" height="140" fill="url(%23sea)"/><text x="300" y="80" font-family="-apple-system, sans-serif" font-size="24" font-weight="600" fill="%23FFFFFF" text-anchor="middle">COASTAL SUNSET</text></svg>',
          transferStatus: 'downloaded',
          attachment: {
            transferId: 'tr-mock-img-1',
            fileName: 'coastal_sunset.jpg',
            fileSize: 452100,
            mimeType: 'image/jpeg',
            sha256: 'mock-img-sha',
            totalChunks: 7,
          },
        },
        {
          id: 'msg-4',
          senderId: 'local-mac-001',
          recipientId: peerId,
          text: 'And here is the product clip:',
          timestamp: Date.now() - 1000 * 60 * 2,
          type: 'file',
          direction: 'outgoing',
          status: 'delivered',
          localAttachmentPath:
            'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
          transferStatus: 'downloaded',
          attachment: {
            transferId: 'tr-mock-vid-1',
            fileName: 'teaser_clip.mp4',
            fileSize: 1840000,
            mimeType: 'video/mp4',
            sha256: 'mock-vid-sha',
            totalChunks: 29,
          },
        },
      ]),
    getRooms: () =>
      Promise.resolve([
        {
          id: 'room-cosmic-pine',
          name: 'Cosmic Pine Design',
          type: 'anonymous',
          status: 'joined',
          memberCount: 5,
          lastMessage: 'Mint Owl: Soft mint accents look really clean on the badges',
          lastTimestamp: Date.now() - 1000 * 60 * 8,
          unreadCount: 2,
          members: [
            { id: 'm-1', nickname: 'Lilac Bunny', isHost: true },
            { id: 'm-2', nickname: 'Mint Owl', isHost: false },
            { id: 'local-mac-001', nickname: 'Sunny Chirp', isHost: false },
          ],
        },
        {
          id: 'room-product-sync',
          name: 'Core Engineering',
          type: 'private',
          status: 'joined',
          memberCount: 3,
          lastMessage: 'Bob: Peer discovery is running smoothly on LAN',
          lastTimestamp: Date.now() - 1000 * 60 * 30,
          unreadCount: 0,
          members: [
            { id: 'm-3', nickname: 'Bob iPhone', isHost: true },
            { id: 'local-mac-001', nickname: "balajee's Mac", isHost: false },
          ],
        },
      ]),
    getRoomMessages: (roomId: string) =>
      Promise.resolve([
        {
          id: 'rm-1',
          roomId,
          senderId: 'm-1',
          senderNickname: 'Lilac Bunny',
          text: 'Welcome to the room everyone! Here is the latest design preview.',
          timestamp: Date.now() - 1000 * 60 * 20,
        },
        {
          id: 'rm-2',
          roomId,
          senderId: 'local-mac-001',
          senderNickname: 'Sunny Chirp',
          text: 'The soft cream background (#F8F6F2) and lavender accents (#F0E6FA) feel so peaceful.',
          timestamp: Date.now() - 1000 * 60 * 12,
        },
        {
          id: 'rm-3',
          roomId,
          senderId: 'm-2',
          senderNickname: 'Mint Owl',
          text: 'And each member has their own matching mascot character avatar!',
          timestamp: Date.now() - 1000 * 60 * 3,
        },
      ]),
    getDiscoveredAnonymousRooms: () =>
      Promise.resolve([
        {
          id: 'room-lounge-01',
          name: 'Lofi Coffee Lounge',
          occupancy: 4,
          capacity: 10,
          isJoinable: true,
          hostPeerId: 'peer-ext-1',
        },
        {
          id: 'room-study-02',
          name: 'Silent Library',
          occupancy: 6,
          capacity: 8,
          isJoinable: true,
          hostPeerId: 'peer-ext-2',
        },
      ]),
    getSettings: () =>
      Promise.resolve({
        avatarType: 'custom',
        avatarValue:
          'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96"><rect width="96" height="96" rx="48" fill="%23B58AE8"/><circle cx="48" cy="40" r="18" fill="%23FFFFFF"/><path d="M24 80 C24 64 34 58 48 58 C62 58 72 64 72 80 Z" fill="%23FFFFFF"/></svg>',
        defaultAnonymousNickname: '',
        shareAvatarWithPeers: true,
        peopleCanFindMe: true,
      }),
    updateSettings: (s: any) => Promise.resolve(s),
    getSystemAvatar: () =>
      Promise.resolve({
        success: true,
        dataUrl:
          'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96"><rect width="96" height="96" rx="48" fill="%23B58AE8"/><circle cx="48" cy="40" r="18" fill="%23FFFFFF"/><path d="M24 80 C24 64 34 58 48 58 C62 58 72 64 72 80 Z" fill="%23FFFFFF"/></svg>',
      }),
    sendMessage: (_peerId: string, _text: string) =>
      Promise.resolve({
        success: true,
        messageId: 'msg-' + Date.now(),
      }),
    sendRoomMessage: (_roomId: string, _text: string) =>
      Promise.resolve({ success: true, messageId: 'rm-' + Date.now() }),
    createAnonymousRoom: (_name: string, _capacity?: number, nickname?: string) => {
      const trimmedNick = nickname?.trim();
      if (!trimmedNick) {
        return Promise.resolve({ success: false, error: 'Nickname is required' });
      }
      return Promise.resolve({ success: true, roomId: 'room-' + Date.now() });
    },
    createPrivateRoom: (_name: string, _memberIds: string[]) =>
      Promise.resolve({ success: true, roomId: 'room-' + Date.now() }),
    joinAnonymousRoom: (_roomId: string, nickname: string) => {
      const trimmedNick = nickname?.trim();
      if (!trimmedNick) {
        return Promise.resolve({ success: false, error: 'Nickname is required' });
      }
      return Promise.resolve({ success: true });
    },
    selectAttachmentFile: (_filterType?: 'all' | 'media') =>
      Promise.resolve({
        success: true,
        file: {
          filePath: '/mock/path/document.pdf',
          fileName: 'document.pdf',
          fileSize: 1024 * 50,
          mimeType: 'application/pdf',
        },
      }),
    selectAttachmentFiles: (_filterType?: 'all' | 'media') =>
      Promise.resolve({
        success: true,
        files: [
          {
            filePath: '/mock/path/document.pdf',
            fileName: 'document.pdf',
            fileSize: 1024 * 50,
            mimeType: 'application/pdf',
          },
        ],
      }),
    checkMediaPermissions: () =>
      Promise.resolve({ success: true, status: 'granted' as const }),
    requestMediaPermissions: () =>
      Promise.resolve({ success: true, results: { camera: true, microphone: true } }),
    sendAttachment: (_targetId: string, _targetType: 'direct' | 'room', filePath: string) =>
      Promise.resolve({
        success: true,
        messageId: 'att-' + Date.now(),
        metadata: {
          transferId: 'tr-' + Date.now(),
          fileName: filePath.split('/').pop() || 'file',
          fileSize: 1024 * 50,
          mimeType: 'application/octet-stream',
          sha256: 'mock-sha',
        },
      }),
    sendMediaAttachment: () =>
      Promise.resolve({ success: true, messageId: 'media-' + Date.now() }),
    saveFileAs: () =>
      Promise.resolve({ success: true, savedPath: '/mock/Downloads/saved-file' }),
    isElectron: false,
  };
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
