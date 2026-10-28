import React, { useState } from 'react';
import { Laptop } from 'lucide-react';
import { getPresetAvatar, PRESET_AVATARS } from '../utils/avatars';

interface UserAvatarProps {
  avatarType?: 'default' | 'preset' | 'custom' | 'mascot';
  avatarValue?: string;
  size?: number;
  className?: string;
  fallbackIconColor?: string;
  alt?: string;
  name?: string;
  /** Use an illustrated avatar when a remote custom photo is unavailable. */
  fallbackToPreset?: boolean;
}

const PASTEL_PALETTE = [
  { bg: '#F0E6FA', fg: '#6941A5' }, // Lavender
  { bg: '#DDF3EA', fg: '#217355' }, // Mint
  { bg: '#F8E3D8', fg: '#964E24' }, // Peach
  { bg: '#FEF6D8', fg: '#7C5C10' }, // Butter
  { bg: '#EAF0F6', fg: '#2B5A84' }, // Sky
  { bg: '#FCE8EF', fg: '#9B3256' }, // Rose
  { bg: '#ECE8F4', fg: '#544175' }, // Lilac
  { bg: '#E2F4EE', fg: '#1C6955' }, // Sage
];

function getDeterministicPastel(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  return PASTEL_PALETTE[Math.abs(hash) % PASTEL_PALETTE.length];
}

function getMonogram(name: string): string {
  const clean = name.trim();
  if (!clean || clean.toLowerCase() === 'avatar') return '';
  const words = clean.split(/[\s\-._]+/).filter(Boolean);
  if (words.length >= 2) {
    const first = words[0][0];
    const second = words[1][0];
    if (/[a-zA-Z0-9]/.test(first) && /[a-zA-Z0-9]/.test(second)) {
      return (first + second).toUpperCase();
    }
  }
  const firstChar = clean[0];
  return /[a-zA-Z0-9]/.test(firstChar) ? firstChar.toUpperCase() : '';
}

function getFallbackPreset(name: string) {
  let hash = 0;
  for (const char of name || 'SubnetPeer') {
    hash = (hash * 31 + char.charCodeAt(0)) | 0;
  }
  return PRESET_AVATARS[Math.abs(hash) % PRESET_AVATARS.length];
}

export default function UserAvatar({
  avatarType = 'default',
  avatarValue = '',
  size = 32,
  className = '',
  fallbackIconColor,
  alt = 'Avatar',
  name,
  fallbackToPreset = false,
}: UserAvatarProps): React.JSX.Element {
  const [imgError, setImgError] = useState(false);
  const displayName = name || (alt !== 'Avatar' ? alt : '');
  const pastel = getDeterministicPastel(displayName || 'SubnetPeer');
  const monogram = getMonogram(displayName);

  const fallbackPreset = fallbackToPreset ? getFallbackPreset(displayName) : undefined;

  // Priority 1: Preset Avatar
  if (avatarType === 'preset' && avatarValue) {
    const preset = getPresetAvatar(avatarValue);
    if (preset) {
      return (
        <div
          className={`user-avatar-wrap preset-avatar ${className}`}
          style={{
            width: size,
            height: size,
            borderRadius: '50%',
            overflow: 'hidden',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
          title={preset.name}
        >
          {preset.svg({ size })}
        </div>
      );
    }
  }

  // Priority 1 / 2 / 3: Custom or explicitly shared photo (or OS account photo)
  if (avatarType === 'custom' && avatarValue && !imgError) {
    return (
      <div
        className={`user-avatar-wrap custom-avatar ${className}`}
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: pastel.bg,
          flexShrink: 0,
        }}
      >
        <img
          src={avatarValue}
          alt={alt}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          onError={() => setImgError(true)}
        />
      </div>
    );
  }

  if (fallbackPreset) {
    return (
      <div
        className={`user-avatar-wrap preset-avatar ${className}`}
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
        title={fallbackPreset.name}
      >
        {fallbackPreset.svg({ size })}
      </div>
    );
  }

  // Priority 4: Locally generated pastel avatar fallback (deterministic monogram or icon)
  return (
    <div
      className={`user-avatar-wrap default-avatar ${className}`}
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        backgroundColor: pastel.bg,
        color: fallbackIconColor || pastel.fg,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: Math.max(10, Math.round(size * 0.38)),
        fontWeight: 600,
        letterSpacing: '-0.02em',
        userSelect: 'none',
        flexShrink: 0,
      }}
      title={displayName || alt}
    >
      {monogram ? (
        <span>{monogram}</span>
      ) : (
        <Laptop
          style={{
            width: Math.round(size * 0.52),
            height: Math.round(size * 0.52),
            color: fallbackIconColor || pastel.fg,
          }}
        />
      )}
    </div>
  );
}
