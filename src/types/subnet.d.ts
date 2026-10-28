export interface ProfileAvatarMetadata {
  avatarType: 'default' | 'preset' | 'custom';
  avatarValue: string;
}

export interface Peer {
  id: string;
  name: string;
  avatar?: ProfileAvatarMetadata;
  host?: string;
  port?: number;
  filePort?: number;
  lastSeen?: number;
}

export interface LocalProfile {
  id: string;
  name: string;
  avatar?: ProfileAvatarMetadata;
  deviceModel?: string;
  filePort?: number;
}

export interface NetworkStatus {
  isRunning: boolean;
  port?: number;
  peerCount: number;
  connectedPeerCount?: number;
  localIp?: string;
  filePort?: number;
  preferredPort?: number;
  portMode?: 'fixed' | 'fallback' | 'ephemeral';
  discovery?: {
    bonjour: 'active' | 'unavailable' | 'disabled';
    udp: 'active' | 'unavailable' | 'disabled';
    interfaces: string[];
    broadcasts: string[];
    lastError?: string;
  };
  firewallHints?: string[];
}

export interface FileAttachmentMetadata {
  transferId: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  sha256: string;
  thumbnail?: string;
  totalChunks: number;
}

export interface FileTransferProgress {
  transferId: string;
  role: 'sender' | 'receiver';
  transferredBytes: number;
  totalBytes: number;
  percent: number;
  status: 'pending' | 'transferring' | 'completed' | 'cancelled' | 'failed';
  error?: string;
  localPath?: string;
}

export interface Message {
  id: string;
  senderId: string;
  recipientId: string;
  senderAvatar?: ProfileAvatarMetadata;
  text: string;
  attachment?: FileAttachmentMetadata;
  localAttachmentPath?: string;
  transferStatus?: 'idle' | 'transferring' | 'downloaded' | 'failed' | 'cancelled';
  timestamp: number;
  status?: 'sending' | 'delivered' | 'failed';
}

export interface MessageAck {
  messageId: string;
  senderId: string;
  recipientId: string;
  timestamp: number;
}

export interface Invitation {
  id: string;
  senderId: string;
  senderName: string;
  recipientId: string;
  text: string;
  timestamp: number;
  status: 'pending' | 'accepted' | 'declined';
}

export interface InvitationResponse {
  invitationId: string;
  senderId: string;
  senderName: string;
  recipientId: string;
  accepted: boolean;
  timestamp: number;
}

export interface ConversationSummary {
  peerId: string;
  peerName: string;
  peerAvatar?: ProfileAvatarMetadata;
  status: 'none' | 'pending_outgoing' | 'pending_incoming' | 'accepted' | 'declined';
  lastMessage?: string;
  lastTimestamp: number;
  unreadCount: number;
  pendingInvitation?: Invitation;
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

export interface RoomInvitation {
  id: string;
  roomId: string;
  roomName: string;
  roomType: 'private';
  hostId: string;
  hostName: string;
  invitedPeerId: string;
  timestamp: number;
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

export interface DiscoveredRoom {
  id: string;
  name: string;
  hostId: string;
  hostAddress: string;
  hostPort: number;
  capacity?: number;
  occupancy?: number;
  isJoinable: boolean;
  lastSeen: number;
}

export interface UserSettings {
  avatarType: 'default' | 'preset' | 'custom';
  avatarValue: string;
  defaultAnonymousNickname?: string;
  theme?: 'system' | 'dark' | 'light';
  notificationsEnabled?: boolean;
  soundEnabled?: boolean;
  shareAvatarWithPeers?: boolean;
  peopleCanFindMe?: boolean;
  listeningPort?: number;
}

export interface SubnetAPI {
  getProfile: () => Promise<LocalProfile>;
  getNetworkStatus: () => Promise<NetworkStatus>;
  getPeers: () => Promise<Peer[]>;
  getConversations: () => Promise<ConversationSummary[]>;
  getConversationMessages: (peerId: string) => Promise<Message[]>;
  respondToInvitation: (invitationId: string, accepted: boolean) => Promise<{ success: boolean; error?: string }>;
  markConversationRead: (peerId: string) => Promise<void>;
  deleteConversation: (peerId: string) => Promise<{ success: boolean; error?: string }>;
  endConversation: (
    peerId: string
  ) => Promise<{ success: boolean; remoteConfirmed: boolean; error?: string }>;
  sendMessage: (
    recipientId: string,
    text: string
  ) => Promise<{ success: boolean; messageId?: string; error?: string; isInvitation?: boolean }>;

  getSettings: () => Promise<UserSettings>;
  updateSettings: (settings: Partial<UserSettings>) => Promise<UserSettings>;
  copyText?: (text: string) => Promise<{ success: boolean; error?: string }>;
  selectAvatarFile: () => Promise<{ success: boolean; dataUrl?: string; error?: string }>;
  getSystemAvatar: () => Promise<{ success: boolean; dataUrl?: string; error?: string }>;

  selectAttachmentFile: (type?: 'all' | 'media') => Promise<{
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
  }>;
  selectAttachmentFiles: (type?: 'all' | 'media') => Promise<{
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
  }>;
  checkMediaPermissions?: (type: 'camera' | 'microphone') => Promise<{
    success: boolean;
    status: 'not-determined' | 'granted' | 'denied' | 'restricted' | 'unknown';
    error?: string;
  }>;
  requestMediaPermissions?: (types: Array<'camera' | 'microphone'>) => Promise<{
    success: boolean;
    results: Record<string, boolean>;
    error?: string;
  }>;
  sendAttachment: (
    targetId: string,
    targetType: 'direct' | 'room',
    filePath: string,
    text?: string
  ) => Promise<{ success: boolean; messageId?: string; error?: string }>;
  sendMediaAttachment: (
    targetId: string,
    targetType: 'direct' | 'room',
    media: {
      fileName: string;
      mimeType: string;
      base64Data: string;
    },
    text?: string
  ) => Promise<{ success: boolean; messageId?: string; error?: string }>;
  downloadAttachment: (
    transferId: string,
    targetPeerId: string,
    customDestination?: string
  ) => Promise<{ success: boolean; error?: string }>;
  cancelTransfer: (transferId: string) => Promise<{ success: boolean; error?: string }>;
  showItemInFolder: (filePath: string) => Promise<{ success: boolean; error?: string }>;
  openFile: (filePath: string) => Promise<{ success: boolean; error?: string }>;
  saveFileAs?: (
    sourcePath: string,
    defaultName?: string
  ) => Promise<{ success: boolean; canceled?: boolean; savedPath?: string; error?: string }>;
  isElectron?: boolean;
  onTransferProgress?: (callback: (progress: FileTransferProgress) => void) => () => void;

  createPrivateRoom: (
    name: string,
    invitedPeerIds: string[]
  ) => Promise<{ success: boolean; roomId?: string; error?: string }>;
  inviteToPrivateRoom: (
    roomId: string,
    peerId: string
  ) => Promise<{ success: boolean; error?: string }>;
  createAnonymousRoom: (
    name: string,
    capacity?: number,
    nickname?: string
  ) => Promise<{ success: boolean; roomId?: string; error?: string }>;
  getRooms: () => Promise<RoomSummary[]>;
  getRoomMessages: (roomId: string) => Promise<RoomMessage[]>;
  sendRoomMessage: (
    roomId: string,
    text: string
  ) => Promise<{ success: boolean; messageId?: string; error?: string }>;
  respondToRoomInvitation: (
    roomId: string,
    accepted: boolean
  ) => Promise<{ success: boolean; error?: string }>;
  joinAnonymousRoom: (
    roomId: string,
    nickname: string
  ) => Promise<{ success: boolean; error?: string }>;
  leaveRoom: (roomId: string) => Promise<{ success: boolean; error?: string }>;
  closeRoom?: (roomId: string) => Promise<{ success: boolean; error?: string }>;
  deleteRoom: (roomId: string) => Promise<{ success: boolean; error?: string }>;
  markRoomRead: (roomId: string) => Promise<void>;
  getDiscoveredAnonymousRooms: () => Promise<DiscoveredRoom[]>;

  onPeerDiscovered: (callback: (peer: Peer) => void) => () => void;
  onPeerUpdated?: (callback: (peer: Peer) => void) => () => void;
  onPeerLost: (callback: (peerId: string) => void) => () => void;
  onStatusChanged?: (callback: (status: NetworkStatus) => void) => () => void;
  onMessageReceived: (callback: (message: Message) => void) => () => void;
  onMessageAck?: (callback: (ack: MessageAck) => void) => () => void;
  onInvitationReceived: (callback: (invitation: Invitation) => void) => () => void;
  onInvitationResponse: (callback: (response: InvitationResponse) => void) => () => void;
  onConversationEnded?: (callback: (data: { peerId: string }) => void) => () => void;
  onConversationsUpdated?: (callback: (conversations: ConversationSummary[]) => void) => () => void;
  onRoomsUpdated?: (callback: (rooms: RoomSummary[]) => void) => () => void;
  onRoomClosed?: (callback: (data: { roomId: string; reason?: string }) => void) => () => void;
  onRoomMessageReceived?: (callback: (message: RoomMessage) => void) => () => void;
  onRoomInvitationReceived?: (callback: (invitation: RoomInvitation) => void) => () => void;
  onDiscoveredRoomsUpdated?: (callback: (rooms: DiscoveredRoom[]) => void) => () => void;
  onSettingsUpdated?: (callback: (settings: UserSettings) => void) => () => void;
}

declare global {
  interface Window {
    subnet: SubnetAPI;
  }
}
