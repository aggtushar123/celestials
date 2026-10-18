import { useState } from 'react';
import { initials } from '../../features/customers/formatters';

export interface EntityAvatarProps {
  /** Organization or account name — used for the initials fallback and
   * to pick a deterministic background color. */
  name: string;
  /** A company-logo URL to try first (e.g. a Clearbit domain lookup —
   * see mapToOrgRow.ts/mapToAccountRow.ts). Optional; the initials
   * avatar renders on its own when there's none, or if it fails to load. */
  logoUrl?: string;
  /** Size/shape/border for the outer circle or badge — e.g.
   * "w-9 h-9 rounded-xl border border-line-subtle". This component
   * supplies the color fill and centering; the caller controls
   * everything about how big and what shape it is. */
  className: string;
}

// One of five semantic hues already used elsewhere in the app (accent/
// info/warning/danger/success), so a generated avatar never introduces
// a color outside the existing palette.
const PALETTE = ['bg-accent', 'bg-info', 'bg-warning', 'bg-danger', 'bg-success'];

function colorForName(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash + name.charCodeAt(i) * (i + 1)) | 0;
  return PALETTE[Math.abs(hash) % PALETTE.length];
}

/**
 * An organization/account "logo": a real image when one loads, falling
 * back to a deterministic colored-initials avatar (same `initials()`
 * used for owner avatars elsewhere) when there isn't one or it fails.
 *
 * This isn't just defensive plumbing — as of this writing,
 * logo.clearbit.com's free logo API is unreachable outright (a DNS
 * failure, not a per-company 404), so every organization/account logo
 * in the app was rendering as an invisible blank box, real seeded
 * companies included, regardless of how legitimate the domain was. The
 * initials avatar is what actually renders right now; keeping the
 * `<img>` attempt costs nothing when it fails and starts working again
 * for free if the underlying service (or a replacement) ever does.
 */
export function EntityAvatar({ name, logoUrl, className }: EntityAvatarProps) {
  const [imgFailed, setImgFailed] = useState(false);

  return (
    <div
      className={`relative flex items-center justify-center overflow-hidden shrink-0 ${colorForName(name)} ${className}`}
    >
      <span className="text-[11px] font-bold text-white leading-none select-none">
        {initials(name)}
      </span>
      {logoUrl && !imgFailed && (
        <img
          src={logoUrl}
          alt={name}
          className="absolute inset-0 w-full h-full object-contain bg-white"
          onError={() => setImgFailed(true)}
        />
      )}
    </div>
  );
}
