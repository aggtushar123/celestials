import { useEffect, useRef } from 'react';
import { Info } from 'lucide-react';
import { TYPE } from '../ui';

/** The lost-access notice (delivery 1, M3): focus moves here on mount, since
 *  the control that was clicked unmounts along with the old scope. An info
 *  line, not a box. */
export function LostAccessNotice({ message }: { message: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return (
    <p ref={ref} tabIndex={-1} role="status" className={`flex items-center gap-2 ${TYPE.body} outline-none`}>
      <Info className="h-4 w-4 shrink-0 text-ink-muted" aria-hidden="true" />
      {message}
    </p>
  );
}
