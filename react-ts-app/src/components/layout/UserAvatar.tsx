// The one shared avatar for a logged-in person: a real image when they
// have one, a flat initials circle when they don't. Navbar and Sidebar each
// used to inline this, and Navbar's own copy fell back to a third-party
// placeholder-avatar service for every user with no avatar — this is the
// single helper both now call instead (layout markup cleanup, owner-
// approved 2026-10-06), so there's no copy-pasted markup and no outside
// network request for an avatar.
//
// Sizing/shape (e.g. "w-9 h-9 rounded-full") is the caller's call, same
// convention as EntityAvatar.tsx; this component only supplies the fill
// (real image, or the accent-tinted initial) and centers it.

export interface UserAvatarProps {
  name?: string | null;
  email?: string | null;
  avatarUrl?: string | null;
  className: string;
}

export function UserAvatar({ name, email, avatarUrl, className }: UserAvatarProps) {
  if (avatarUrl) {
    return <img src={avatarUrl} alt={name || 'User'} className={className} />;
  }
  const initial = (name?.charAt(0) || email?.charAt(0) || '?').toUpperCase();
  return (
    <div className={`flex items-center justify-center bg-accent text-on-accent font-bold text-[13px] select-none ${className}`}>
      {initial}
    </div>
  );
}
