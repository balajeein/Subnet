/**
 * Subnet Protocol Definitions & Message Envelope Validators
 */

export const PROTOCOL_VERSION = '1.0.0';
export const BONJOUR_SERVICE_TYPE = 'subnet'; // Translates to _subnet._tcp.local.
export const BONJOUR_ROOM_SERVICE_TYPE = 'subnet-room'; // Translates to _subnet-room._tcp.local.
export const MAX_MESSAGE_SIZE = 64 * 1024; // 64 KB message payload limit
export const HANDSHAKE_TIMEOUT_MS = 6000; // 6 seconds to complete mutual handshake
export const HEARTBEAT_INTERVAL_MS = 15000; // Ping every 15 seconds
export const HEARTBEAT_TIMEOUT_MS = 10000; // Stale socket timeout if no pong received
export const NICKNAME_REGEX = /^[a-zA-Z0-9 _-]{2,30}$/;

export interface ProfileAvatarMetadata {
  avatarType: 'default' | 'preset' | 'custom';
  avatarValue: string;
}

export const PRESET_AVATAR_IDS = [
  'preset-astro',
  'preset-fox',
  'preset-owl',
  'preset-bot',
  'preset-cat',
  'preset-bear',
  'preset-cyber',
  'preset-spark',
  'preset-panda',
  'preset-falcon',
  'preset-alien',
  'preset-wave',
] as const;

export type PresetAvatarId = typeof PRESET_AVATAR_IDS[number];

/**
 * Deterministically assigns a stable, random preset avatar ID to a room member
 * based on their anonymous participant identity within the room.
 * Ensures different participants within the same room receive different avatars
 * when presets are available.
 */
export function getAnonymousAvatarIdForMember(
  roomId: string,
  memberId: string,
  members?: Array<{ id: string }>
): PresetAvatarId {
  if (members && members.length > 0) {
    const sorted = [...members].sort((a, b) => a.id.localeCompare(b.id));
    const idx = sorted.findIndex((m) => m.id === memberId);
    if (idx !== -1) {
      return PRESET_AVATAR_IDS[idx % PRESET_AVATAR_IDS.length];
    }
  }

  let hash = 0;
  const str = `${roomId}:${memberId}`;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  }
  return PRESET_AVATAR_IDS[hash % PRESET_AVATAR_IDS.length];
}

export interface HandshakePayload {
  type: 'handshake';
  peerId: string;
  name: string;
  avatar?: ProfileAvatarMetadata;
  version: string;
  timestamp: number;
}

export interface HandshakeAckPayload {
  type: 'handshake_ack';
  peerId: string;
  name: string;
  avatar?: ProfileAvatarMetadata;
  version: string;
  timestamp: number;
}

export interface PingPayload {
  type: 'ping';
  timestamp: number;
}

export interface PongPayload {
  type: 'pong';
  timestamp: number;
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

export interface MessagePayload {
  type: 'message';
  id: string;
  senderId: string;
  recipientId: string;
  text: string;
  attachment?: FileAttachmentMetadata;
  timestamp: number;
}

export interface MessageAckPayload {
  type: 'ack';
  messageId: string;
  senderId: string; // The peer acknowledging the message (original recipient)
  recipientId: string; // The peer receiving the acknowledgement (original sender)
  timestamp: number;
}

export interface InvitationPayload {
  type: 'invitation';
  id: string;
  senderId: string;
  senderName: string;
  recipientId: string;
  text: string;
  timestamp: number;
}

export interface InvitationResponsePayload {
  type: 'invitation_response';
  invitationId: string;
  senderId: string;
  senderName: string;
  recipientId: string;
  accepted: boolean;
  timestamp: number;
}

export interface RoomInvitationPayload {
  type: 'room_invitation';
  id: string;
  roomId: string;
  roomName: string;
  roomType: 'private';
  hostId: string;
  hostName: string;
  invitedPeerId: string;
  timestamp: number;
}

export interface RoomInvitationResponsePayload {
  type: 'room_invitation_response';
  invitationId: string;
  roomId: string;
  hostId: string;
  peerId: string;
  peerName: string;
  accepted: boolean;
  timestamp: number;
}

export interface RoomJoinPayload {
  type: 'room_join';
  roomId: string;
  peerId: string;
  nickname: string;
  timestamp: number;
}

export interface RoomJoinResponsePayload {
  type: 'room_join_response';
  roomId: string;
  roomName: string;
  roomType: 'anonymous';
  success: boolean;
  error?: string;
  members?: Array<{ id: string; nickname: string; isHost?: boolean }>;
  timestamp: number;
}

export interface RoomMessagePayload {
  type: 'room_message';
  id: string;
  roomId: string;
  senderId: string;
  senderNickname: string;
  senderAvatar?: ProfileAvatarMetadata;
  text: string;
  attachment?: FileAttachmentMetadata;
  timestamp: number;
}

export interface RoomLeavePayload {
  type: 'room_leave';
  roomId: string;
  peerId: string;
  nickname: string;
  timestamp: number;
}

export interface RoomMemberUpdatePayload {
  type: 'room_member_update';
  roomId: string;
  members: Array<{ id: string; nickname: string; isHost?: boolean; avatar?: ProfileAvatarMetadata }>;
  timestamp: number;
}

export interface RoomClosePayload {
  type: 'room_close' | 'room_closed';
  roomId: string;
  hostId: string;
  reason: string;
  timestamp: number;
}

export interface ConversationEndPayload {
  type: 'conversation_end';
  id: string;
  senderId: string;
  recipientId: string;
  timestamp: number;
}

export interface ProfileUpdatePayload {
  type: 'profile_update';
  peerId: string;
  name: string;
  avatar?: ProfileAvatarMetadata;
  timestamp: number;
}

export interface FileOfferPayload {
  type: 'file_offer';
  transferId: string;
  senderId: string;
  recipientId: string;
  attachment: FileAttachmentMetadata;
  timestamp: number;
}

export interface FileRequestPayload {
  type: 'file_request';
  transferId: string;
  senderId: string;
  recipientId: string;
  startIndex?: number;
  timestamp: number;
}

export interface FileChunkPayload {
  type: 'file_chunk';
  transferId: string;
  chunkIndex: number;
  totalChunks: number;
  data: string; // base64 encoded chunk
  chunkHash?: string;
  timestamp: number;
}

export interface FileChunkAckPayload {
  type: 'file_chunk_ack';
  transferId: string;
  chunkIndex: number;
  timestamp: number;
}

export interface FileCancelPayload {
  type: 'file_cancel';
  transferId: string;
  senderId: string;
  recipientId?: string;
  reason?: string;
  timestamp: number;
}

export interface FileCompletePayload {
  type: 'file_complete';
  transferId: string;
  senderId: string;
  recipientId?: string;
  success?: boolean;
  timestamp: number;
}

export type NetworkEnvelope =
  | HandshakePayload
  | HandshakeAckPayload
  | PingPayload
  | PongPayload
  | MessagePayload
  | MessageAckPayload
  | InvitationPayload
  | InvitationResponsePayload
  | ConversationEndPayload
  | ProfileUpdatePayload
  | RoomInvitationPayload
  | RoomInvitationResponsePayload
  | RoomJoinPayload
  | RoomJoinResponsePayload
  | RoomMessagePayload
  | RoomLeavePayload
  | RoomMemberUpdatePayload
  | RoomClosePayload
  | FileOfferPayload
  | FileRequestPayload
  | FileChunkPayload
  | FileChunkAckPayload
  | FileCancelPayload
  | FileCompletePayload;

/**
 * Validates profile avatar metadata.
 * Limits custom data-URL to 45KB payload and requires valid image mime-type.
 */
export function validateProfileAvatar(avatar: unknown): ProfileAvatarMetadata | undefined {
  if (!avatar || typeof avatar !== 'object') return undefined;
  const a = avatar as Record<string, unknown>;
  if (a.avatarType === 'preset' && typeof a.avatarValue === 'string') {
    const trimmed = a.avatarValue.trim();
    if (trimmed.length > 0 && trimmed.length <= 64) {
      return { avatarType: 'preset', avatarValue: trimmed };
    }
  } else if (a.avatarType === 'custom' && typeof a.avatarValue === 'string') {
    const trimmed = a.avatarValue.trim();
    if (
      trimmed.startsWith('data:image/') &&
      trimmed.length <= 45000 &&
      (trimmed.startsWith('data:image/jpeg;') ||
       trimmed.startsWith('data:image/png;') ||
       trimmed.startsWith('data:image/webp;') ||
       trimmed.startsWith('data:image/gif;'))
    ) {
      return { avatarType: 'custom', avatarValue: trimmed };
    }
  } else if (a.avatarType === 'default') {
    return { avatarType: 'default', avatarValue: '' };
  }
  return undefined;
}

/**
 * Validates an incoming handshake payload.
 */
export function validateHandshake(data: unknown): HandshakePayload | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;

  if (
    d.type === 'handshake' &&
    typeof d.peerId === 'string' &&
    d.peerId.trim().length > 0 &&
    typeof d.name === 'string' &&
    d.name.trim().length > 0 &&
    typeof d.version === 'string' &&
    typeof d.timestamp === 'number'
  ) {
    return {
      type: 'handshake',
      peerId: d.peerId.trim(),
      name: d.name.trim().slice(0, 80),
      avatar: validateProfileAvatar(d.avatar),
      version: d.version.trim(),
      timestamp: d.timestamp,
    };
  }
  return null;
}

/**
 * Validates an incoming handshake acknowledgment payload.
 */
export function validateHandshakeAck(data: unknown): HandshakeAckPayload | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;

  if (
    d.type === 'handshake_ack' &&
    typeof d.peerId === 'string' &&
    d.peerId.trim().length > 0 &&
    typeof d.name === 'string' &&
    typeof d.version === 'string' &&
    typeof d.timestamp === 'number'
  ) {
    return {
      type: 'handshake_ack',
      peerId: d.peerId.trim(),
      name: d.name.trim().slice(0, 80),
      avatar: validateProfileAvatar(d.avatar),
      version: d.version.trim(),
      timestamp: d.timestamp,
    };
  }
  return null;
}

/**
 * Validates file attachment metadata.
 */
export function validateFileAttachmentMetadata(meta: unknown): FileAttachmentMetadata | undefined {
  if (!meta || typeof meta !== 'object') return undefined;
  const m = meta as Record<string, unknown>;
  if (
    typeof m.transferId === 'string' &&
    m.transferId.trim().length > 0 &&
    m.transferId.trim().length <= 64 &&
    typeof m.fileName === 'string' &&
    m.fileName.trim().length > 0 &&
    m.fileName.trim().length <= 255 &&
    typeof m.fileSize === 'number' &&
    Number.isFinite(m.fileSize) &&
    m.fileSize >= 0 &&
    m.fileSize <= 5 * 1024 * 1024 * 1024 &&
    typeof m.mimeType === 'string' &&
    m.mimeType.trim().length <= 100 &&
    typeof m.sha256 === 'string' &&
    /^[a-fA-F0-9]{64}$/.test(m.sha256.trim()) &&
    typeof m.totalChunks === 'number' &&
    Number.isInteger(m.totalChunks) &&
    m.totalChunks >= 1
  ) {
    let thumbnail: string | undefined;
    if (
      typeof m.thumbnail === 'string' &&
      m.thumbnail.startsWith('data:image/') &&
      m.thumbnail.length <= 45000
    ) {
      thumbnail = m.thumbnail;
    }
    return {
      transferId: m.transferId.trim(),
      fileName: m.fileName.trim().slice(0, 255),
      fileSize: m.fileSize,
      mimeType: m.mimeType.trim() || 'application/octet-stream',
      sha256: m.sha256.trim().toLowerCase(),
      thumbnail,
      totalChunks: m.totalChunks,
    };
  }
  return undefined;
}

/**
 * Validates an incoming message payload.
 */
export function validateMessage(data: unknown): MessagePayload | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;

  const attachment = validateFileAttachmentMetadata(d.attachment);
  const text = typeof d.text === 'string' ? d.text.trim().slice(0, 5000) : '';

  if (
    d.type === 'message' &&
    typeof d.id === 'string' &&
    d.id.trim().length > 0 &&
    typeof d.senderId === 'string' &&
    d.senderId.trim().length > 0 &&
    typeof d.recipientId === 'string' &&
    d.recipientId.trim().length > 0 &&
    (text.length > 0 || attachment !== undefined) &&
    typeof d.timestamp === 'number'
  ) {
    return {
      type: 'message',
      id: d.id.trim(),
      senderId: d.senderId.trim(),
      recipientId: d.recipientId.trim(),
      text,
      attachment,
      timestamp: d.timestamp,
    };
  }
  return null;
}

/**
 * Validates an incoming message acknowledgement payload.
 */
export function validateMessageAck(data: unknown): MessageAckPayload | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;

  if (
    d.type === 'ack' &&
    typeof d.messageId === 'string' &&
    d.messageId.trim().length > 0 &&
    typeof d.senderId === 'string' &&
    d.senderId.trim().length > 0 &&
    typeof d.recipientId === 'string' &&
    d.recipientId.trim().length > 0 &&
    typeof d.timestamp === 'number'
  ) {
    return {
      type: 'ack',
      messageId: d.messageId.trim(),
      senderId: d.senderId.trim(),
      recipientId: d.recipientId.trim(),
      timestamp: d.timestamp,
    };
  }
  return null;
}

/**
 * Validates an incoming invitation payload.
 */
export function validateInvitation(data: unknown): InvitationPayload | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;

  if (
    d.type === 'invitation' &&
    typeof d.id === 'string' &&
    d.id.trim().length > 0 &&
    typeof d.senderId === 'string' &&
    d.senderId.trim().length > 0 &&
    typeof d.senderName === 'string' &&
    d.senderName.trim().length > 0 &&
    typeof d.recipientId === 'string' &&
    d.recipientId.trim().length > 0 &&
    typeof d.text === 'string' &&
    d.text.trim().length > 0 &&
    typeof d.timestamp === 'number'
  ) {
    return {
      type: 'invitation',
      id: d.id.trim(),
      senderId: d.senderId.trim(),
      senderName: d.senderName.trim().slice(0, 80),
      recipientId: d.recipientId.trim(),
      text: d.text.trim().slice(0, 5000),
      timestamp: d.timestamp,
    };
  }
  return null;
}

/**
 * Validates an incoming invitation response payload.
 */
export function validateInvitationResponse(data: unknown): InvitationResponsePayload | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;

  if (
    d.type === 'invitation_response' &&
    typeof d.invitationId === 'string' &&
    d.invitationId.trim().length > 0 &&
    typeof d.senderId === 'string' &&
    d.senderId.trim().length > 0 &&
    typeof d.senderName === 'string' &&
    d.senderName.trim().length > 0 &&
    typeof d.recipientId === 'string' &&
    d.recipientId.trim().length > 0 &&
    typeof d.accepted === 'boolean' &&
    typeof d.timestamp === 'number'
  ) {
    return {
      type: 'invitation_response',
      invitationId: d.invitationId.trim(),
      senderId: d.senderId.trim(),
      senderName: d.senderName.trim().slice(0, 80),
      recipientId: d.recipientId.trim(),
      accepted: d.accepted,
      timestamp: d.timestamp,
    };
  }
  return null;
}

export function validateConversationEnd(data: unknown): ConversationEndPayload | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;
  if (
    d.type === 'conversation_end' &&
    typeof d.id === 'string' &&
    d.id.trim().length > 0 &&
    typeof d.senderId === 'string' &&
    d.senderId.trim().length > 0 &&
    typeof d.recipientId === 'string' &&
    d.recipientId.trim().length > 0 &&
    typeof d.timestamp === 'number' &&
    !Number.isNaN(d.timestamp)
  ) {
    return {
      type: 'conversation_end',
      id: d.id.trim(),
      senderId: d.senderId.trim(),
      recipientId: d.recipientId.trim(),
      timestamp: d.timestamp,
    };
  }
  return null;
}

export function validateNickname(nickname: unknown): string | null {
  if (typeof nickname !== 'string') return null;
  const trimmed = nickname.trim();
  if (trimmed.length < 2 || trimmed.length > 30) return null;
  if (!NICKNAME_REGEX.test(trimmed)) return null;
  return trimmed;
}

export function validateRoomInvitation(data: unknown): RoomInvitationPayload | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;
  if (
    d.type === 'room_invitation' &&
    typeof d.id === 'string' && d.id.trim() &&
    typeof d.roomId === 'string' && d.roomId.trim() &&
    typeof d.roomName === 'string' && d.roomName.trim() &&
    d.roomType === 'private' &&
    typeof d.hostId === 'string' && d.hostId.trim() &&
    typeof d.hostName === 'string' && d.hostName.trim() &&
    typeof d.invitedPeerId === 'string' && d.invitedPeerId.trim() &&
    typeof d.timestamp === 'number'
  ) {
    return {
      type: 'room_invitation',
      id: d.id.trim(),
      roomId: d.roomId.trim(),
      roomName: d.roomName.trim().slice(0, 80),
      roomType: 'private',
      hostId: d.hostId.trim(),
      hostName: d.hostName.trim().slice(0, 80),
      invitedPeerId: d.invitedPeerId.trim(),
      timestamp: d.timestamp,
    };
  }
  return null;
}

export function validateRoomInvitationResponse(data: unknown): RoomInvitationResponsePayload | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;
  if (
    d.type === 'room_invitation_response' &&
    typeof d.invitationId === 'string' && d.invitationId.trim() &&
    typeof d.roomId === 'string' && d.roomId.trim() &&
    typeof d.hostId === 'string' && d.hostId.trim() &&
    typeof d.peerId === 'string' && d.peerId.trim() &&
    typeof d.peerName === 'string' && d.peerName.trim() &&
    typeof d.accepted === 'boolean' &&
    typeof d.timestamp === 'number'
  ) {
    return {
      type: 'room_invitation_response',
      invitationId: d.invitationId.trim(),
      roomId: d.roomId.trim(),
      hostId: d.hostId.trim(),
      peerId: d.peerId.trim(),
      peerName: d.peerName.trim().slice(0, 80),
      accepted: d.accepted,
      timestamp: d.timestamp,
    };
  }
  return null;
}

export function validateRoomJoin(data: unknown): RoomJoinPayload | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;
  const nickname = validateNickname(d.nickname);
  if (
    d.type === 'room_join' &&
    typeof d.roomId === 'string' && d.roomId.trim() &&
    typeof d.peerId === 'string' && d.peerId.trim() &&
    nickname &&
    typeof d.timestamp === 'number'
  ) {
    return {
      type: 'room_join',
      roomId: d.roomId.trim(),
      peerId: d.peerId.trim(),
      nickname,
      timestamp: d.timestamp,
    };
  }
  return null;
}

export function validateRoomJoinResponse(data: unknown): RoomJoinResponsePayload | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;
  if (
    d.type === 'room_join_response' &&
    typeof d.roomId === 'string' && d.roomId.trim() &&
    typeof d.roomName === 'string' &&
    d.roomType === 'anonymous' &&
    typeof d.success === 'boolean' &&
    typeof d.timestamp === 'number'
  ) {
    let members: Array<{ id: string; nickname: string; isHost?: boolean }> | undefined;
    if (Array.isArray(d.members)) {
      members = d.members
        .filter((m: any) => m && typeof m.id === 'string' && typeof m.nickname === 'string')
        .map((m: any) => ({
          id: String(m.id).trim(),
          nickname: String(m.nickname).trim().slice(0, 30),
          isHost: Boolean(m.isHost),
        }));
    }
    return {
      type: 'room_join_response',
      roomId: d.roomId.trim(),
      roomName: d.roomName.trim().slice(0, 80),
      roomType: 'anonymous',
      success: d.success,
      error: typeof d.error === 'string' ? d.error.slice(0, 200) : undefined,
      members,
      timestamp: d.timestamp,
    };
  }
  return null;
}

export function validateRoomMessage(data: unknown): RoomMessagePayload | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;

  const attachment = validateFileAttachmentMetadata(d.attachment);
  const text = typeof d.text === 'string' ? d.text.trim().slice(0, 5000) : '';

  if (
    d.type === 'room_message' &&
    typeof d.id === 'string' && d.id.trim() &&
    typeof d.roomId === 'string' && d.roomId.trim() &&
    typeof d.senderId === 'string' && d.senderId.trim() &&
    typeof d.senderNickname === 'string' && d.senderNickname.trim() &&
    (text.length > 0 || attachment !== undefined) &&
    typeof d.timestamp === 'number'
  ) {
    return {
      type: 'room_message',
      id: d.id.trim(),
      roomId: d.roomId.trim(),
      senderId: d.senderId.trim(),
      senderNickname: d.senderNickname.trim().slice(0, 30),
      senderAvatar: validateProfileAvatar(d.senderAvatar),
      text,
      attachment,
      timestamp: d.timestamp,
    };
  }
  return null;
}

export function validateRoomLeave(data: unknown): RoomLeavePayload | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;
  if (
    d.type === 'room_leave' &&
    typeof d.roomId === 'string' && d.roomId.trim() &&
    typeof d.peerId === 'string' && d.peerId.trim() &&
    typeof d.nickname === 'string' &&
    typeof d.timestamp === 'number'
  ) {
    return {
      type: 'room_leave',
      roomId: d.roomId.trim(),
      peerId: d.peerId.trim(),
      nickname: d.nickname.trim().slice(0, 30),
      timestamp: d.timestamp,
    };
  }
  return null;
}

export function validateRoomMemberUpdate(data: unknown): RoomMemberUpdatePayload | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;
  if (
    d.type === 'room_member_update' &&
    typeof d.roomId === 'string' && d.roomId.trim() &&
    Array.isArray(d.members) &&
    typeof d.timestamp === 'number'
  ) {
    const members = d.members
      .filter((m: any) => m && typeof m.id === 'string' && typeof m.nickname === 'string')
      .map((m: any) => ({
        id: String(m.id).trim(),
        nickname: String(m.nickname).trim().slice(0, 30),
        isHost: Boolean(m.isHost),
        avatar: validateProfileAvatar(m.avatar),
      }));
    return {
      type: 'room_member_update',
      roomId: d.roomId.trim(),
      members,
      timestamp: d.timestamp,
    };
  }
  return null;
}

export function validateProfileUpdate(data: unknown): ProfileUpdatePayload | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;
  if (
    d.type === 'profile_update' &&
    typeof d.peerId === 'string' &&
    d.peerId.trim().length > 0 &&
    typeof d.name === 'string' &&
    typeof d.timestamp === 'number'
  ) {
    return {
      type: 'profile_update',
      peerId: d.peerId.trim(),
      name: d.name.trim().slice(0, 80),
      avatar: validateProfileAvatar(d.avatar),
      timestamp: d.timestamp,
    };
  }
  return null;
}

export function validateRoomClose(data: unknown): RoomClosePayload | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;
  if (
    (d.type === 'room_close' || d.type === 'room_closed') &&
    typeof d.roomId === 'string' && d.roomId.trim() &&
    typeof d.hostId === 'string' && d.hostId.trim() &&
    typeof d.reason === 'string' &&
    typeof d.timestamp === 'number'
  ) {
    return {
      type: d.type as 'room_close' | 'room_closed',
      roomId: d.roomId.trim(),
      hostId: d.hostId.trim(),
      reason: d.reason.trim().slice(0, 200),
      timestamp: d.timestamp,
    };
  }
  return null;
}

export function validateFileOffer(data: unknown): FileOfferPayload | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;
  const attachment = validateFileAttachmentMetadata(d.attachment);
  if (
    d.type === 'file_offer' &&
    typeof d.transferId === 'string' && d.transferId.trim() &&
    typeof d.senderId === 'string' && d.senderId.trim() &&
    typeof d.recipientId === 'string' && d.recipientId.trim() &&
    attachment !== undefined &&
    typeof d.timestamp === 'number'
  ) {
    return {
      type: 'file_offer',
      transferId: d.transferId.trim(),
      senderId: d.senderId.trim(),
      recipientId: d.recipientId.trim(),
      attachment,
      timestamp: d.timestamp,
    };
  }
  return null;
}

export function validateFileRequest(data: unknown): FileRequestPayload | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;
  if (
    d.type === 'file_request' &&
    typeof d.transferId === 'string' && d.transferId.trim() &&
    typeof d.senderId === 'string' && d.senderId.trim() &&
    typeof d.recipientId === 'string' && d.recipientId.trim() &&
    typeof d.timestamp === 'number'
  ) {
    if (d.startIndex !== undefined && (typeof d.startIndex !== 'number' || !Number.isInteger(d.startIndex) || d.startIndex < 0)) {
      return null;
    }
    return {
      type: 'file_request',
      transferId: d.transferId.trim(),
      senderId: d.senderId.trim(),
      recipientId: d.recipientId.trim(),
      startIndex: typeof d.startIndex === 'number' ? d.startIndex : 0,
      timestamp: d.timestamp,
    };
  }
  return null;
}

export function validateFileChunk(data: unknown): FileChunkPayload | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;
  if (
    d.type === 'file_chunk' &&
    typeof d.transferId === 'string' && d.transferId.trim() &&
    typeof d.chunkIndex === 'number' && Number.isInteger(d.chunkIndex) && d.chunkIndex >= 0 &&
    typeof d.totalChunks === 'number' && Number.isInteger(d.totalChunks) && d.totalChunks > 0 &&
    d.chunkIndex < d.totalChunks &&
    typeof d.data === 'string' && d.data.length <= 50000 &&
    typeof d.timestamp === 'number'
  ) {
    return {
      type: 'file_chunk',
      transferId: d.transferId.trim(),
      chunkIndex: d.chunkIndex,
      totalChunks: d.totalChunks,
      data: d.data,
      chunkHash: typeof d.chunkHash === 'string' ? d.chunkHash.trim() : undefined,
      timestamp: d.timestamp,
    };
  }
  return null;
}

export function validateFileChunkAck(data: unknown): FileChunkAckPayload | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;
  if (
    d.type === 'file_chunk_ack' &&
    typeof d.transferId === 'string' && d.transferId.trim() &&
    typeof d.chunkIndex === 'number' && Number.isInteger(d.chunkIndex) && d.chunkIndex >= 0 &&
    typeof d.timestamp === 'number'
  ) {
    return {
      type: 'file_chunk_ack',
      transferId: d.transferId.trim(),
      chunkIndex: d.chunkIndex,
      timestamp: d.timestamp,
    };
  }
  return null;
}

export function validateFileCancel(data: unknown): FileCancelPayload | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;
  if (
    d.type === 'file_cancel' &&
    typeof d.transferId === 'string' && d.transferId.trim() &&
    typeof d.senderId === 'string' && d.senderId.trim() &&
    typeof d.timestamp === 'number'
  ) {
    return {
      type: 'file_cancel',
      transferId: d.transferId.trim(),
      senderId: d.senderId.trim(),
      recipientId: typeof d.recipientId === 'string' ? d.recipientId.trim() : undefined,
      reason: typeof d.reason === 'string' ? d.reason.slice(0, 200) : undefined,
      timestamp: d.timestamp,
    };
  }
  return null;
}

export function validateFileComplete(data: unknown): FileCompletePayload | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;
  if (
    d.type === 'file_complete' &&
    typeof d.transferId === 'string' && d.transferId.trim() &&
    typeof d.senderId === 'string' && d.senderId.trim() &&
    typeof d.timestamp === 'number'
  ) {
    return {
      type: 'file_complete',
      transferId: d.transferId.trim(),
      senderId: d.senderId.trim(),
      recipientId: typeof d.recipientId === 'string' ? d.recipientId.trim() : undefined,
      success: typeof d.success === 'boolean' ? d.success : true,
      timestamp: d.timestamp,
    };
  }
  return null;
}

/**
 * Validates, size-limits, and safely parses a raw string or buffer into a NetworkEnvelope.
 */
export function parseAndValidateEnvelope(raw: string | Buffer): NetworkEnvelope | null {
  if (typeof raw !== 'string' && !Buffer.isBuffer(raw)) return null;
  if (raw.length > MAX_MESSAGE_SIZE) return null;

  try {
    const text = typeof raw === 'string' ? raw : raw.toString('utf-8');
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object') return null;

    switch (parsed.type) {
      case 'handshake':
        return validateHandshake(parsed);

      case 'handshake_ack':
        return validateHandshakeAck(parsed);

      case 'ping':
        if (typeof parsed.timestamp === 'number') {
          return { type: 'ping', timestamp: parsed.timestamp };
        }
        return null;

      case 'pong':
        if (typeof parsed.timestamp === 'number') {
          return { type: 'pong', timestamp: parsed.timestamp };
        }
        return null;

      case 'message':
        return validateMessage(parsed);

      case 'ack':
        return validateMessageAck(parsed);

      case 'invitation':
        return validateInvitation(parsed);

      case 'invitation_response':
        return validateInvitationResponse(parsed);

      case 'conversation_end':
        return validateConversationEnd(parsed);

      case 'profile_update':
        return validateProfileUpdate(parsed);

      case 'room_invitation':
        return validateRoomInvitation(parsed);

      case 'room_invitation_response':
        return validateRoomInvitationResponse(parsed);

      case 'room_join':
        return validateRoomJoin(parsed);

      case 'room_join_response':
        return validateRoomJoinResponse(parsed);

      case 'room_message':
        return validateRoomMessage(parsed);

      case 'room_leave':
        return validateRoomLeave(parsed);

      case 'room_member_update':
        return validateRoomMemberUpdate(parsed);

      case 'room_close':
      case 'room_closed':
        return validateRoomClose(parsed);

      case 'file_offer':
        return validateFileOffer(parsed);

      case 'file_request':
        return validateFileRequest(parsed);

      case 'file_chunk':
        return validateFileChunk(parsed);

      case 'file_chunk_ack':
        return validateFileChunkAck(parsed);

      case 'file_cancel':
        return validateFileCancel(parsed);

      case 'file_complete':
        return validateFileComplete(parsed);

      default:
        return null;
    }
  } catch {
    return null;
  }
}

/**
 * Deterministic tie-breaker for duplicate connections between two peers.
 * If localPeerId < remotePeerId, local is the canonical initiator (winner).
 * Both peers will reach the identical conclusion independently.
 */
export function isPeerIdTieWinner(localPeerId: string, remotePeerId: string): boolean {
  return localPeerId.localeCompare(remotePeerId) < 0;
}
