import { useCallback, useRef, useState } from 'react';
import { withHidden, withoutItem } from '../../features/work/feed';
import type { FeedItem, FeedPayload } from '../../features/work/workTypes';
import type { Settle } from './FeedDecideRows';
import { feedChanged } from './taskChanges';
import type { Toast } from './WorkToast';

/** A feed page's toast and its rows' leaving (spec §5 "After an action";
 *  delivery 1 Decisions 1, 2, 6): a decided row leaves with a toast; a lost
 *  one also adds one to `hidden`. My work and Work › Team share it. */
export function useFeedSettle<P extends FeedPayload>(update: (change: (feed: P) => P) => void) {
  const [toast, setToast] = useState<Toast | null>(null);
  const toastId = useRef(0);
  const say = useCallback((next: Omit<Toast, 'id' | 'focus'>, focus = true) => setToast({ ...next, id: ++toastId.current, focus }), []);

  const leave = (item: FeedItem, settle: Settle, undo?: () => Promise<void>) => {
    update((current) => withoutItem(current, item.key));
    say({ ...settle, undo });
    feedChanged();
  };
  const gone = (item: FeedItem, text: string) => leave(item, { text });
  const lost = (item: FeedItem, text: string) => {
    update((current) => withHidden(withoutItem(current, item.key), 1));
    say({ text });
    feedChanged();
  };
  return { toast, close: () => setToast(null), say, leave, gone, lost };
}
