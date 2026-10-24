import React from 'react';

export interface PresetAvatar {
  id: string;
  name: string;
  category: 'memoji' | 'illustrative';
  gradient: string;
  svg: (props: { size?: number }) => React.JSX.Element;
}

export const PRESET_AVATARS: PresetAvatar[] = [
  {
    id: 'preset-astro',
    name: 'Cosmic Explorer',
    category: 'memoji',
    gradient: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 50%, #1e1b4b 100%)',
    svg: ({ size = 32 }) => (
      <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="24" cy="24" r="24" fill="url(#astro-grad)" />
        {/* Helmet */}
        <circle cx="24" cy="22" r="14" fill="#f8fafc" stroke="#94a3b8" strokeWidth="1.5" />
        {/* Visor */}
        <rect x="15" y="16" width="18" height="11" rx="5.5" fill="#0f172a" />
        <path d="M17 19C18.5 17.5 21 17 24 17" stroke="#38bdf8" strokeWidth="1.5" strokeLinecap="round" />
        {/* Collar / suit */}
        <path d="M12 40C13 33 18 31 24 31C30 31 35 33 36 40" fill="#e2e8f0" />
        <defs>
          <linearGradient id="astro-grad" x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
            <stop stopColor="#6366f1" />
            <stop offset="1" stopColor="#1e1b4b" />
          </linearGradient>
        </defs>
      </svg>
    ),
  },
  {
    id: 'preset-fox',
    name: 'Swift Fox',
    category: 'memoji',
    gradient: 'linear-gradient(135deg, #f97316 0%, #ea580c 50%, #7c2d12 100%)',
    svg: ({ size = 32 }) => (
      <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="24" cy="24" r="24" fill="url(#fox-grad)" />
        {/* Ears */}
        <path d="M13 10L20 22H11L13 10Z" fill="#ea580c" stroke="#fff" strokeWidth="1" />
        <path d="M35 10L37 22H28L35 10Z" fill="#ea580c" stroke="#fff" strokeWidth="1" />
        <path d="M15 13L19 20H13L15 13Z" fill="#ffedd5" />
        <path d="M33 13L35 20H29L33 13Z" fill="#ffedd5" />
        {/* Face */}
        <path d="M12 21C12 28 17 37 24 41C31 37 36 28 36 21C36 17 32 17 24 17C16 17 12 17 12 21Z" fill="#f97316" />
        {/* Cheeks white */}
        <path d="M12 24C15 28 19 33 24 37C29 33 33 28 36 24C34 32 29 39 24 41C19 39 14 32 12 24Z" fill="#fff" />
        {/* Eyes */}
        <ellipse cx="18" cy="24" rx="2" ry="2.5" fill="#1c1917" />
        <ellipse cx="30" cy="24" rx="2" ry="2.5" fill="#1c1917" />
        <circle cx="17.5" cy="23.5" r="0.75" fill="#fff" />
        <circle cx="29.5" cy="23.5" r="0.75" fill="#fff" />
        {/* Nose */}
        <polygon points="24,31 22,29 26,29" fill="#1c1917" />
        <defs>
          <linearGradient id="fox-grad" x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
            <stop stopColor="#fb923c" />
            <stop offset="1" stopColor="#9a3412" />
          </linearGradient>
        </defs>
      </svg>
    ),
  },
  {
    id: 'preset-owl',
    name: 'Sage Owl',
    category: 'memoji',
    gradient: 'linear-gradient(135deg, #10b981 0%, #059669 50%, #064e3b 100%)',
    svg: ({ size = 32 }) => (
      <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="24" cy="24" r="24" fill="url(#owl-grad)" />
        {/* Ear tufts */}
        <path d="M15 10L20 18H14L15 10Z" fill="#047857" />
        <path d="M33 10L34 18H28L33 10Z" fill="#047857" />
        {/* Head/Body */}
        <ellipse cx="24" cy="26" rx="14" ry="15" fill="#10b981" />
        {/* Eye circles */}
        <circle cx="18" cy="22" r="5.5" fill="#ecfdf5" stroke="#047857" strokeWidth="1.5" />
        <circle cx="30" cy="22" r="5.5" fill="#ecfdf5" stroke="#047857" strokeWidth="1.5" />
        {/* Pupils */}
        <circle cx="18" cy="22" r="2.5" fill="#064e3b" />
        <circle cx="30" cy="22" r="2.5" fill="#064e3b" />
        <circle cx="17" cy="21" r="1" fill="#fff" />
        <circle cx="29" cy="21" r="1" fill="#fff" />
        {/* Beak */}
        <path d="M22 25L24 29L26 25Z" fill="#f59e0b" />
        {/* Chest plumage */}
        <path d="M21 34C22 36 26 36 27 34" stroke="#047857" strokeWidth="1.5" strokeLinecap="round" />
        <defs>
          <linearGradient id="owl-grad" x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
            <stop stopColor="#34d399" />
            <stop offset="1" stopColor="#064e3b" />
          </linearGradient>
        </defs>
      </svg>
    ),
  },
  {
    id: 'preset-bot',
    name: 'Cyber Bot',
    category: 'memoji',
    gradient: 'linear-gradient(135deg, #06b6d4 0%, #0891b2 50%, #164e63 100%)',
    svg: ({ size = 32 }) => (
      <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="24" cy="24" r="24" fill="url(#bot-grad)" />
        {/* Antenna */}
        <line x1="24" y1="12" x2="24" y2="7" stroke="#38bdf8" strokeWidth="2" strokeLinecap="round" />
        <circle cx="24" cy="6" r="2.5" fill="#38bdf8" />
        {/* Ears */}
        <rect x="8" y="21" width="3" height="6" rx="1.5" fill="#94a3b8" />
        <rect x="37" y="21" width="3" height="6" rx="1.5" fill="#94a3b8" />
        {/* Head */}
        <rect x="11" y="13" width="26" height="22" rx="6" fill="#f1f5f9" stroke="#cbd5e1" strokeWidth="1.5" />
        {/* Visor display */}
        <rect x="14" y="17" width="20" height="9" rx="3" fill="#0f172a" />
        {/* Glowing eyes */}
        <circle cx="19" cy="21.5" r="2" fill="#38bdf8" />
        <circle cx="29" cy="21.5" r="2" fill="#38bdf8" />
        {/* Grille mouth */}
        <line x1="18" y1="30" x2="30" y2="30" stroke="#64748b" strokeWidth="1.5" strokeLinecap="round" />
        <defs>
          <linearGradient id="bot-grad" x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
            <stop stopColor="#38bdf8" />
            <stop offset="1" stopColor="#0f172a" />
          </linearGradient>
        </defs>
      </svg>
    ),
  },
  {
    id: 'preset-cat',
    name: 'Luna Cat',
    category: 'memoji',
    gradient: 'linear-gradient(135deg, #ec4899 0%, #db2777 50%, #831843 100%)',
    svg: ({ size = 32 }) => (
      <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="24" cy="24" r="24" fill="url(#cat-grad)" />
        {/* Ears */}
        <polygon points="12,12 21,21 13,22" fill="#f43f5e" stroke="#fff" strokeWidth="1" />
        <polygon points="36,12 35,22 27,21" fill="#f43f5e" stroke="#fff" strokeWidth="1" />
        <polygon points="14,14 19,20 14,21" fill="#fbcfe8" />
        <polygon points="34,14 34,21 29,20" fill="#fbcfe8" />
        {/* Face */}
        <circle cx="24" cy="26" r="13" fill="#fff" />
        {/* Eyes */}
        <ellipse cx="19" cy="24" rx="2" ry="3" fill="#0f172a" />
        <ellipse cx="29" cy="24" rx="2" ry="3" fill="#0f172a" />
        <circle cx="18.5" cy="23" r="1" fill="#fff" />
        <circle cx="28.5" cy="23" r="1" fill="#fff" />
        {/* Nose & Mouth */}
        <polygon points="24,28 22.5,26.5 25.5,26.5" fill="#f43f5e" />
        <path d="M22 29C23 30 24 30 24 29C24 30 25 30 26 29" stroke="#fda4af" strokeWidth="1.2" strokeLinecap="round" />
        {/* Whiskers */}
        <line x1="12" y1="26" x2="17" y2="27" stroke="#cbd5e1" strokeWidth="1" />
        <line x1="12" y1="29" x2="17" y2="29" stroke="#cbd5e1" strokeWidth="1" />
        <line x1="31" y1="27" x2="36" y2="26" stroke="#cbd5e1" strokeWidth="1" />
        <line x1="31" y1="29" x2="36" y2="29" stroke="#cbd5e1" strokeWidth="1" />
        <defs>
          <linearGradient id="cat-grad" x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
            <stop stopColor="#f472b6" />
            <stop offset="1" stopColor="#701a75" />
          </linearGradient>
        </defs>
      </svg>
    ),
  },
  {
    id: 'preset-bear',
    name: 'Atlas Bear',
    category: 'memoji',
    gradient: 'linear-gradient(135deg, #d97706 0%, #b45309 50%, #451a03 100%)',
    svg: ({ size = 32 }) => (
      <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="24" cy="24" r="24" fill="url(#bear-grad)" />
        {/* Ears */}
        <circle cx="14" cy="14" r="4.5" fill="#92400e" stroke="#fff" strokeWidth="1" />
        <circle cx="34" cy="14" r="4.5" fill="#92400e" stroke="#fff" strokeWidth="1" />
        <circle cx="14" cy="14" r="2.5" fill="#fde68a" />
        <circle cx="34" cy="14" r="2.5" fill="#fde68a" />
        {/* Head */}
        <circle cx="24" cy="26" r="14" fill="#b45309" />
        {/* Muzzle */}
        <ellipse cx="24" cy="29" rx="6.5" ry="5" fill="#fef3c7" />
        <ellipse cx="24" cy="27" rx="2.5" ry="1.8" fill="#451a03" />
        <path d="M24 29V31" stroke="#451a03" strokeWidth="1.2" />
        {/* Eyes */}
        <circle cx="18" cy="23" r="2" fill="#451a03" />
        <circle cx="30" cy="23" r="2" fill="#451a03" />
        <circle cx="17.5" cy="22.5" r="0.6" fill="#fff" />
        <circle cx="29.5" cy="22.5" r="0.6" fill="#fff" />
        <defs>
          <linearGradient id="bear-grad" x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
            <stop stopColor="#f59e0b" />
            <stop offset="1" stopColor="#451a03" />
          </linearGradient>
        </defs>
      </svg>
    ),
  },
  {
    id: 'preset-cyber',
    name: 'Neon Cyber',
    category: 'illustrative',
    gradient: 'linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%)',
    svg: ({ size = 32 }) => (
      <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="24" cy="24" r="24" fill="url(#cyber-grad)" />
        {/* Geometric head silhouette */}
        <polygon points="24,10 35,18 31,34 24,39 17,34 13,18" fill="#18181b" stroke="#a855f7" strokeWidth="1.5" />
        {/* Neon visor */}
        <polygon points="15,20 33,20 31,26 17,26" fill="#06b6d4" />
        <path d="M17 23H31" stroke="#ec4899" strokeWidth="1" />
        <defs>
          <linearGradient id="cyber-grad" x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
            <stop stopColor="#7c3aed" />
            <stop offset="1" stopColor="#db2777" />
          </linearGradient>
        </defs>
      </svg>
    ),
  },
  {
    id: 'preset-spark',
    name: 'Nova Star',
    category: 'illustrative',
    gradient: 'linear-gradient(135deg, #0ea5e9 0%, #6366f1 50%, #a855f7 100%)',
    svg: ({ size = 32 }) => (
      <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="24" cy="24" r="24" fill="url(#spark-grad)" />
        {/* Central 4-pointed radiant star */}
        <path
          d="M24 10C24 18 20 22 12 24C20 26 24 30 24 38C24 30 28 26 36 24C28 22 24 18 24 10Z"
          fill="#ffffff"
        />
        <circle cx="24" cy="24" r="2.5" fill="#38bdf8" />
        <defs>
          <linearGradient id="spark-grad" x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
            <stop stopColor="#38bdf8" />
            <stop offset="0.5" stopColor="#818cf8" />
            <stop offset="1" stopColor="#c084fc" />
          </linearGradient>
        </defs>
      </svg>
    ),
  },
  {
    id: 'preset-panda',
    name: 'Zen Panda',
    category: 'memoji',
    gradient: 'linear-gradient(135deg, #475569 0%, #1e293b 100%)',
    svg: ({ size = 32 }) => (
      <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="24" cy="24" r="24" fill="#334155" />
        {/* Ears */}
        <circle cx="13" cy="14" r="4.5" fill="#0f172a" />
        <circle cx="35" cy="14" r="4.5" fill="#0f172a" />
        {/* Face */}
        <circle cx="24" cy="26" r="14" fill="#f8fafc" />
        {/* Eye patches */}
        <ellipse cx="18" cy="24" rx="3.5" ry="4" transform="rotate(-15 18 24)" fill="#0f172a" />
        <ellipse cx="30" cy="24" rx="3.5" ry="4" transform="rotate(15 30 24)" fill="#0f172a" />
        <circle cx="18" cy="23.5" r="1.2" fill="#fff" />
        <circle cx="30" cy="23.5" r="1.2" fill="#fff" />
        {/* Nose */}
        <ellipse cx="24" cy="28" rx="2.5" ry="1.8" fill="#0f172a" />
        <path d="M22.5 31C23 32 25 32 25.5 31" stroke="#0f172a" strokeWidth="1.2" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: 'preset-falcon',
    name: 'Solar Falcon',
    category: 'memoji',
    gradient: 'linear-gradient(135deg, #eab308 0%, #ca8a04 100%)',
    svg: ({ size = 32 }) => (
      <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="24" cy="24" r="24" fill="#ca8a04" />
        {/* Crest */}
        <polygon points="24,8 28,18 20,18" fill="#a16207" />
        <polygon points="21,11 25,18 17,18" fill="#854d0e" />
        {/* Head */}
        <ellipse cx="24" cy="26" rx="13" ry="14" fill="#fef08a" />
        {/* Eye */}
        <circle cx="19" cy="23" r="3.5" fill="#1c1917" />
        <circle cx="29" cy="23" r="3.5" fill="#1c1917" />
        <circle cx="18.5" cy="22.5" r="1" fill="#f59e0b" />
        <circle cx="28.5" cy="22.5" r="1" fill="#f59e0b" />
        {/* Beak */}
        <path d="M21 26L24 33L27 26Z" fill="#d97706" />
      </svg>
    ),
  },
  {
    id: 'preset-alien',
    name: 'Galactic Alien',
    category: 'illustrative',
    gradient: 'linear-gradient(135deg, #a855f7 0%, #06b6d4 100%)',
    svg: ({ size = 32 }) => (
      <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="24" cy="24" r="24" fill="#1e1b4b" />
        {/* Alien head */}
        <path d="M14 20C14 13 18 11 24 11C30 11 34 13 34 20C34 28 29 37 24 37C19 37 14 28 14 20Z" fill="#a7f3d0" />
        {/* Big eyes */}
        <ellipse cx="19" cy="22" rx="3" ry="5" transform="rotate(20 19 22)" fill="#0f172a" />
        <ellipse cx="29" cy="22" rx="3" ry="5" transform="rotate(-20 29 22)" fill="#0f172a" />
        <circle cx="20" cy="21" r="1" fill="#a855f7" />
        <circle cx="28" cy="21" r="1" fill="#a855f7" />
        <ellipse cx="24" cy="31" rx="1.5" ry="0.8" fill="#059669" />
      </svg>
    ),
  },
  {
    id: 'preset-wave',
    name: 'Ocean Wave',
    category: 'illustrative',
    gradient: 'linear-gradient(135deg, #0284c7 0%, #0f172a 100%)',
    svg: ({ size = 32 }) => (
      <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        <circle cx="24" cy="24" r="24" fill="#0369a1" />
        {/* Tidal swirl */}
        <path
          d="M12 30C16 24 22 24 26 28C30 32 36 30 38 26C36 18 28 14 22 17C16 20 14 26 12 30Z"
          fill="#38bdf8"
        />
        <circle cx="26" cy="20" r="3" fill="#ffffff" />
      </svg>
    ),
  },
];

export function getPresetAvatar(id: string): PresetAvatar | undefined {
  return PRESET_AVATARS.find((a) => a.id === id);
}

import { getAnonymousAvatarIdForMember, PRESET_AVATAR_IDS } from '../../electron/network/protocol';

export { getAnonymousAvatarIdForMember, PRESET_AVATAR_IDS };

/**
 * Deterministically assigns a stable, random preset avatar to a room member
 * based on their anonymous participant identity within the room.
 * Ensures different participants within the same room receive different avatars
 * when presets are available.
 */
export function getAnonymousAvatarForMember(
  roomId: string,
  memberId: string,
  members?: Array<{ id: string }>
): PresetAvatar {
  const avatarId = getAnonymousAvatarIdForMember(roomId, memberId, members);
  return getPresetAvatar(avatarId) || PRESET_AVATARS[0];
}
