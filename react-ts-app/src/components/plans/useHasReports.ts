import { useEffect, useState } from 'react';
import { useAppSelector } from '../../hooks';
import { loadMembers } from '../../features/knowledge/useMembers';

/** Whether anyone reports to the signed-in person, read from GET
 *  /auth/members/ (Contract note 15); null until the members load. It
 *  decides the scope's default, so the list waits for it (Decision 5). */
export function useHasReports(): boolean | null {
  const me = useAppSelector((state) => state.auth.user?.id ?? null);
  const [answer, setAnswer] = useState<{ me: number | null; value: boolean } | null>(null);
  useEffect(() => {
    let alive = true;
    loadMembers().then((members) => {
      if (alive) setAnswer({ me, value: members.some((member) => member.reports_to?.id === me) });
    });
    return () => {
      alive = false;
    };
  }, [me]);
  return answer?.me === me ? answer.value : null;
}
