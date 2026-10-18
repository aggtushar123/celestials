import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

/** "Leaving with unsaved changes asks first" (spec §2.2, Decision 6). The app
 *  runs on BrowserRouter, where useBlocker is unavailable, so while `dirty`
 *  this catches in-app link clicks in the capture phase (before React or the
 *  router sees them) and asks; closing or reloading the tab gets the
 *  browser's own prompt. The browser's Back button is not intercepted. */
export function useUnsavedGuard(dirty: boolean) {
  const navigate = useNavigate();
  const location = useLocation();
  const here = `${location.pathname}${location.search}${location.hash}`;
  const [pending, setPending] = useState<string | null>(null);

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = event.target instanceof Element ? event.target.closest('a[href]') : null;
      if (!(link instanceof HTMLAnchorElement) || (link.target && link.target !== '_self') || link.hasAttribute('download')) return;
      const url = new URL(link.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      const to = `${url.pathname}${url.search}${url.hash}`;
      if (to === here) return;
      event.preventDefault();
      event.stopPropagation();
      setPending(to);
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    document.addEventListener('click', onClick, true);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      document.removeEventListener('click', onClick, true);
    };
  }, [dirty, here]);

  return {
    pending,
    /** Navigation from a control that is not a link (a select): asks first while dirty. */
    request: (to: string) => {
      if (dirty && to !== here) setPending(to);
      else navigate(to);
    },
    stay: () => setPending(null),
    leave: () => {
      const to = pending;
      setPending(null);
      if (to) navigate(to);
    },
  };
}
