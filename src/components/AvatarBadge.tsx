import { useState } from 'react';
import { GAME_ASSETS } from '../assets/gameAssets.ts';

export const AVATAR_PRESETS = [
  { id: 'avatar:champion', label: 'Champion Portrait', image: GAME_ASSETS.playerChampionAvatar },
  { id: 'avatar:strategist', label: 'Emerald Crest', bg: 'from-emerald-600 to-teal-700' },
  { id: 'avatar:tactician', label: 'Cobalt Crest', bg: 'from-blue-600 to-indigo-700' },
  { id: 'avatar:cipher', label: 'Amber Crest', bg: 'from-amber-500 to-orange-700' },
  { id: 'avatar:duelist', label: 'Crimson Crest', bg: 'from-rose-600 to-red-700' },
] as const;

interface AvatarBadgeProps {
  avatarUrl: string;
  username: string;
  size?: 'sm' | 'md' | 'lg';
}

export function AvatarBadge({ avatarUrl, username, size = 'md' }: AvatarBadgeProps) {
  const [imgFailed, setImgFailed] = useState(false);

  const dims =
    size === 'sm' ? 'w-8 h-8 text-xs' : size === 'lg' ? 'w-16 h-16 text-xl' : 'w-10 h-10 text-sm';

  const preset = AVATAR_PRESETS.find((p) => p.id === avatarUrl);
  const imageSrc =
    avatarUrl === 'avatar:champion'
      ? GAME_ASSETS.playerChampionAvatar
      : avatarUrl.startsWith('http://') || avatarUrl.startsWith('https://') || avatarUrl.startsWith('/')
      ? avatarUrl
      : null;

  if (imageSrc && !imgFailed) {
    return (
      <img
        src={imageSrc}
        alt={`${username} avatar`}
        referrerPolicy="no-referrer"
        onError={() => setImgFailed(true)}
        className={`${dims} rounded-full object-cover border border-slate-300 dark:border-slate-700 shrink-0`}
      />
    );
  }

  const bgGradient = preset && 'bg' in preset ? preset.bg : 'from-slate-700 to-slate-900';
  const initials = username.slice(0, 2).toUpperCase() || 'GV';

  return (
    <div
      className={`${dims} rounded-full bg-gradient-to-br ${bgGradient} text-white font-semibold flex items-center justify-center shrink-0 border border-white/15`}
      aria-label={`${username} avatar`}
    >
      {initials}
    </div>
  );
}
