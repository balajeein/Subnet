import React from 'react';

export interface MascotConfig {
  id: string;
  name: string;
  bg: string;
  render: (size: number) => React.JSX.Element;
}

export const MASCOTS: MascotConfig[] = [
  {
    id: 'bunny',
    name: 'Lilac Bunny',
    bg: '#F0E6FA',
    render: (size) => (
      <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect width="32" height="32" rx="16" fill="#F0E6FA" />
        {/* Left Ear */}
        <path d="M11 5C11 3.5 12.5 3 13.5 4.5C14.5 6 14 12 13 14C12 14 11 11 11 5Z" fill="#FFFFFF" />
        <path d="M11.8 6C11.8 5 12.5 4.7 13.2 5.5C13.8 6.5 13.5 10.5 12.8 12C12.2 12 11.8 10 11.8 6Z" fill="#F8D6E8" />
        {/* Right Ear */}
        <path d="M21 5C21 3.5 19.5 3 18.5 4.5C17.5 6 18 12 19 14C20 14 21 11 21 5Z" fill="#FFFFFF" />
        <path d="M20.2 6C20.2 5 19.5 4.7 18.8 5.5C18.2 6.5 18.5 10.5 19.2 12C19.8 12 20.2 10 20.2 6Z" fill="#F8D6E8" />
        {/* Face */}
        <ellipse cx="16" cy="19.5" rx="8.5" ry="7.5" fill="#FFFFFF" />
        {/* Cheeks */}
        <circle cx="10.5" cy="20.5" r="1.5" fill="#FBD5E5" opacity="0.8" />
        <circle cx="21.5" cy="20.5" r="1.5" fill="#FBD5E5" opacity="0.8" />
        {/* Eyes */}
        <circle cx="13" cy="18.5" r="1.3" fill="#24212A" />
        <circle cx="12.6" cy="18.1" r="0.4" fill="#FFFFFF" />
        <circle cx="19" cy="18.5" r="1.3" fill="#24212A" />
        <circle cx="18.6" cy="18.1" r="0.4" fill="#FFFFFF" />
        {/* Nose */}
        <ellipse cx="16" cy="20.5" rx="0.9" ry="0.6" fill="#E896B9" />
        {/* Mouth */}
        <path d="M15.2 21.8C15.6 22.3 16.4 22.3 16.8 21.8" stroke="#77717F" strokeWidth="0.7" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: 'bear',
    name: 'Caramel Bear',
    bg: '#F8E3D8',
    render: (size) => (
      <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect width="32" height="32" rx="16" fill="#F8E3D8" />
        {/* Ears */}
        <circle cx="9.5" cy="11.5" r="3.2" fill="#D49A6A" />
        <circle cx="9.5" cy="11.5" r="1.8" fill="#FDE7D6" />
        <circle cx="22.5" cy="11.5" r="3.2" fill="#D49A6A" />
        <circle cx="22.5" cy="11.5" r="1.8" fill="#FDE7D6" />
        {/* Head */}
        <circle cx="16" cy="18.5" r="8" fill="#D49A6A" />
        {/* Muzzle */}
        <ellipse cx="16" cy="20.5" rx="4.2" ry="3.2" fill="#FFF5EA" />
        {/* Nose */}
        <ellipse cx="16" cy="19.4" rx="1.3" ry="0.9" fill="#42281D" />
        {/* Eyes */}
        <circle cx="13" cy="16.5" r="1.2" fill="#24212A" />
        <circle cx="12.6" cy="16.1" r="0.4" fill="#FFFFFF" />
        <circle cx="19" cy="16.5" r="1.2" fill="#24212A" />
        <circle cx="18.6" cy="16.1" r="0.4" fill="#FFFFFF" />
        {/* Mouth */}
        <path d="M16 20.4V21.6M15 22.2C15.4 22.6 16.6 22.6 17 22.2" stroke="#42281D" strokeWidth="0.7" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: 'cat',
    name: 'Peach Kitten',
    bg: '#FCE8EF',
    render: (size) => (
      <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect width="32" height="32" rx="16" fill="#FCE8EF" />
        {/* Ears */}
        <polygon points="8,15 11,8 16,14" fill="#F2A4B8" />
        <polygon points="9.5,14 11.5,9.5 15,13.5" fill="#FFF0F5" />
        <polygon points="24,15 21,8 16,14" fill="#F2A4B8" />
        <polygon points="22.5,14 20.5,9.5 17,13.5" fill="#FFF0F5" />
        {/* Head */}
        <ellipse cx="16" cy="19.5" rx="8" ry="7.2" fill="#FFFFFF" />
        {/* Cheeks */}
        <circle cx="10.8" cy="20.5" r="1.4" fill="#F8B6C8" opacity="0.7" />
        <circle cx="21.2" cy="20.5" r="1.4" fill="#F8B6C8" opacity="0.7" />
        {/* Eyes */}
        <circle cx="13" cy="18.2" r="1.3" fill="#24212A" />
        <circle cx="12.6" cy="17.8" r="0.4" fill="#FFFFFF" />
        <circle cx="19" cy="18.2" r="1.3" fill="#24212A" />
        <circle cx="18.6" cy="17.8" r="0.4" fill="#FFFFFF" />
        {/* Nose */}
        <polygon points="15.4,20 16.6,20 16,20.8" fill="#E86E8C" />
        {/* Mouth */}
        <path d="M15 21.6C15.5 22.2 16.5 22.2 17 21.6" stroke="#77717F" strokeWidth="0.7" strokeLinecap="round" />
        {/* Whiskers */}
        <line x1="8.5" y1="19.5" x2="11" y2="20" stroke="#D1CAD4" strokeWidth="0.6" strokeLinecap="round" />
        <line x1="8.5" y1="21.5" x2="11" y2="21" stroke="#D1CAD4" strokeWidth="0.6" strokeLinecap="round" />
        <line x1="23.5" y1="19.5" x2="21" y2="20" stroke="#D1CAD4" strokeWidth="0.6" strokeLinecap="round" />
        <line x1="23.5" y1="21.5" x2="21" y2="21" stroke="#D1CAD4" strokeWidth="0.6" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: 'fox',
    name: 'Pastel Fox',
    bg: '#FDECE3',
    render: (size) => (
      <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect width="32" height="32" rx="16" fill="#FDECE3" />
        {/* Ears */}
        <polygon points="7,16 11,7 16,15" fill="#E88358" />
        <polygon points="9,14 11.5,9.5 14.5,14" fill="#FFE8DC" />
        <polygon points="25,16 21,7 16,15" fill="#E88358" />
        <polygon points="23,14 20.5,9.5 17.5,14" fill="#FFE8DC" />
        {/* Face Orange */}
        <path d="M8.5 17C8.5 22.5 12 25.5 16 26.5C20 25.5 23.5 22.5 23.5 17C23.5 14.5 21 15 16 15C11 15 8.5 14.5 8.5 17Z" fill="#E88358" />
        {/* Cheeks White */}
        <path d="M8.8 19C10.5 22 13 25 16 26.5C19 25 21.5 22 23.2 19C22 23.5 19 26 16 26.5C13 26 10 23.5 8.8 19Z" fill="#FFFFFF" />
        {/* Eyes */}
        <circle cx="12.8" cy="18" r="1.2" fill="#24212A" />
        <circle cx="12.4" cy="17.6" r="0.4" fill="#FFFFFF" />
        <circle cx="19.2" cy="18" r="1.2" fill="#24212A" />
        <circle cx="18.8" cy="17.6" r="0.4" fill="#FFFFFF" />
        {/* Nose */}
        <polygon points="15.2,22.2 16.8,22.2 16,23" fill="#24212A" />
      </svg>
    ),
  },
  {
    id: 'owl',
    name: 'Mint Owl',
    bg: '#DDF3EA',
    render: (size) => (
      <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect width="32" height="32" rx="16" fill="#DDF3EA" />
        {/* Ear tufts */}
        <path d="M10 9L13 14H9L10 9Z" fill="#36B987" />
        <path d="M22 9L23 14H19L22 9Z" fill="#36B987" />
        {/* Body */}
        <ellipse cx="16" cy="18.5" rx="8.5" ry="9" fill="#4FCFA1" />
        {/* Eye circles */}
        <circle cx="12.5" cy="16.5" r="3.6" fill="#FFFFFF" />
        <circle cx="19.5" cy="16.5" r="3.6" fill="#FFFFFF" />
        {/* Pupils */}
        <circle cx="12.8" cy="16.5" r="1.5" fill="#1C5E45" />
        <circle cx="12.4" cy="16.1" r="0.5" fill="#FFFFFF" />
        <circle cx="19.2" cy="16.5" r="1.5" fill="#1C5E45" />
        <circle cx="18.8" cy="16.1" r="0.5" fill="#FFFFFF" />
        {/* Beak */}
        <polygon points="15,18.5 17,18.5 16,20.8" fill="#F5A623" />
        {/* Chest plumage */}
        <path d="M14.5 22.5C15.2 23.3 16.8 23.3 17.5 22.5" stroke="#FFFFFF" strokeWidth="0.9" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: 'panda',
    name: 'Zen Panda',
    bg: '#EAF0F6',
    render: (size) => (
      <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect width="32" height="32" rx="16" fill="#EAF0F6" />
        {/* Ears */}
        <circle cx="9.5" cy="11.5" r="3" fill="#3E3A47" />
        <circle cx="22.5" cy="11.5" r="3" fill="#3E3A47" />
        {/* Head */}
        <circle cx="16" cy="18.5" r="8" fill="#FFFFFF" />
        {/* Eye Patches */}
        <ellipse cx="12.8" cy="17" rx="2.5" ry="2" transform="rotate(-15 12.8 17)" fill="#3E3A47" />
        <ellipse cx="19.2" cy="17" rx="2.5" ry="2" transform="rotate(15 19.2 17)" fill="#3E3A47" />
        {/* Eyes inside patch */}
        <circle cx="12.8" cy="17" r="0.9" fill="#FFFFFF" />
        <circle cx="19.2" cy="17" r="0.9" fill="#FFFFFF" />
        {/* Cheeks */}
        <circle cx="10.2" cy="21" r="1.3" fill="#F8B6C8" opacity="0.6" />
        <circle cx="21.8" cy="21" r="1.3" fill="#F8B6C8" opacity="0.6" />
        {/* Nose */}
        <ellipse cx="16" cy="19.8" rx="1.2" ry="0.8" fill="#3E3A47" />
        {/* Mouth */}
        <path d="M15.2 21.2C15.6 21.7 16.4 21.7 16.8 21.2" stroke="#3E3A47" strokeWidth="0.7" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: 'koala',
    name: 'Misty Koala',
    bg: '#ECE8F4',
    render: (size) => (
      <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect width="32" height="32" rx="16" fill="#ECE8F4" />
        {/* Fluffy ears */}
        <circle cx="8" cy="12" r="3.8" fill="#B2AABF" />
        <circle cx="8" cy="12" r="2.2" fill="#FFFFFF" />
        <circle cx="24" cy="12" r="3.8" fill="#B2AABF" />
        <circle cx="24" cy="12" r="2.2" fill="#FFFFFF" />
        {/* Head */}
        <circle cx="16" cy="18.5" r="7.8" fill="#B2AABF" />
        {/* Cheeks */}
        <circle cx="11" cy="20.5" r="1.3" fill="#F8B6C8" opacity="0.6" />
        <circle cx="21" cy="20.5" r="1.3" fill="#F8B6C8" opacity="0.6" />
        {/* Eyes */}
        <circle cx="12.5" cy="16.5" r="1.1" fill="#24212A" />
        <circle cx="12.2" cy="16.2" r="0.4" fill="#FFFFFF" />
        <circle cx="19.5" cy="16.5" r="1.1" fill="#24212A" />
        <circle cx="19.2" cy="16.2" r="0.4" fill="#FFFFFF" />
        {/* Koala Large Oval Nose */}
        <ellipse cx="16" cy="19.5" rx="2" ry="2.8" fill="#4B4456" />
      </svg>
    ),
  },
  {
    id: 'chick',
    name: 'Sunny Chirp',
    bg: '#FEF6D8',
    render: (size) => (
      <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect width="32" height="32" rx="16" fill="#FEF6D8" />
        {/* Feather crest */}
        <path d="M16 6C15 8 16 10 16 12C16.8 10 17.5 8 16 6Z" fill="#F5C042" />
        {/* Body */}
        <ellipse cx="16" cy="18.5" rx="8.5" ry="8" fill="#FFDC69" />
        {/* Cheeks */}
        <circle cx="10.8" cy="19.5" r="1.4" fill="#F8A76B" opacity="0.6" />
        <circle cx="21.2" cy="19.5" r="1.4" fill="#F8A76B" opacity="0.6" />
        {/* Eyes */}
        <circle cx="12.8" cy="16.8" r="1.2" fill="#24212A" />
        <circle cx="12.4" cy="16.4" r="0.4" fill="#FFFFFF" />
        <circle cx="19.2" cy="16.8" r="1.2" fill="#24212A" />
        <circle cx="18.8" cy="16.4" r="0.4" fill="#FFFFFF" />
        {/* Beak */}
        <polygon points="14.8,18.8 17.2,18.8 16,21" fill="#F37E3A" />
      </svg>
    ),
  },
];

export function getMascotById(idOrKey: string): MascotConfig {
  const clean = (idOrKey || '').toLowerCase();
  const direct = MASCOTS.find((m) => m.id === clean || clean.includes(m.id));
  if (direct) return direct;

  let hash = 0;
  for (let i = 0; i < idOrKey.length; i++) {
    hash = (hash << 5) - hash + idOrKey.charCodeAt(i);
    hash |= 0;
  }
  const index = Math.abs(hash) % MASCOTS.length;
  return MASCOTS[index];
}

interface MascotAvatarProps {
  id: string;
  name?: string;
  size?: number;
  className?: string;
}

export default function MascotAvatar({
  id,
  name,
  size = 28,
  className = '',
}: MascotAvatarProps): React.JSX.Element {
  const mascot = getMascotById(id || name || 'default');
  return (
    <div
      className={`mascot-avatar-wrap ${className}`}
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        backgroundColor: mascot.bg,
      }}
      title={name || mascot.name}
    >
      {mascot.render(size)}
    </div>
  );
}
