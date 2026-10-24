import React from 'react';
import { Laptop } from 'lucide-react';
import { getPresetAvatar } from '../utils/avatars';

interface UserAvatarProps {
  avatarType?: 'default' | 'preset' | 'custom';
  avatarValue?: string;
  size?: number;
  className?: string;
  fallbackIconColor?: string;
  alt?: string;
}

export default function UserAvatar({
  avatarType = 'default',
  avatarValue = '',
  size = 32,
  className = '',
  fallbackIconColor = '#38bdf8',
  alt = 'Avatar',
}: UserAvatarProps): React.JSX.Element {
  if (avatarType === 'preset' && avatarValue) {
    const preset = getPresetAvatar(avatarValue);
    if (preset) {
      return (
        <div
          className={`user-avatar-wrap preset-avatar ${className}`}
          style={{ width: size, height: size, borderRadius: '50%', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          title={preset.name}
        >
          {preset.svg({ size })}
        </div>
      );
    }
  }

  if (avatarType === 'custom' && avatarValue) {
    return (
      <div
        className={`user-avatar-wrap custom-avatar ${className}`}
        style={{ width: size, height: size, borderRadius: '50%', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.08)' }}
      >
        <img
          src={avatarValue}
          alt={alt}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          onError={(e) => {
            // Fallback to default if image fails to render
            (e.target as HTMLElement).style.display = 'none';
          }}
        />
      </div>
    );
  }

  // Default device laptop icon
  return (
    <div
      className={`user-avatar-wrap default-avatar ${className}`}
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Laptop style={{ width: Math.round(size * 0.55), height: Math.round(size * 0.55), color: fallbackIconColor }} />
    </div>
  );
}
