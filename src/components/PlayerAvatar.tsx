import React from 'react';
import { getInitials } from '../utils/storage';

interface PlayerAvatarProps {
  name: string;
  avatarUrl?: string;
  avatarColor: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

const SIZE_CLASSES: Record<NonNullable<PlayerAvatarProps['size']>, string> = {
  xs: 'w-7 h-7 text-[11px]',
  sm: 'w-9 h-9 text-xs',
  md: 'w-11 h-11 text-sm',
  lg: 'w-14 h-14 text-base',
  xl: 'w-16 h-16 text-lg',
};

export const PlayerAvatar: React.FC<PlayerAvatarProps> = ({
  name,
  avatarUrl,
  avatarColor,
  size = 'md',
  className = '',
}) => {
  const sizeClass = SIZE_CLASSES[size];

  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        referrerPolicy="no-referrer"
        className={`${sizeClass} rounded-full object-cover shrink-0 border border-black/10 dark:border-white/15 ${className}`}
      />
    );
  }

  return (
    <div
      aria-label={name}
      style={{ backgroundColor: avatarColor }}
      className={`${sizeClass} rounded-full shrink-0 flex items-center justify-center font-bold text-white tracking-tight select-none ${className}`}
    >
      {getInitials(name)}
    </div>
  );
};
