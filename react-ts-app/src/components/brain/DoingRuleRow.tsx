import { Link } from 'react-router-dom';
import type { DoingRule } from '../../features/brain/brainTypes';
import { DO, lastRunParts, ruleHref, ruleStatusText, segmentText } from '../../features/brain/doingText';
import { NUM, TYPE } from '../ui';
import { LINK } from './styles';

/** One rule at work (spec §2.1, Decision 5; plan Decision 8): its name (a
 *  link when the reader may open it, Contract note 11), segment and status
 *  in words, and its last run: fired for everyone, matched and skipped for
 *  the owner. */
export function DoingRuleRow({ rule }: { rule: DoingRule }) {
  const href = ruleHref(rule);
  const run = lastRunParts(rule);
  return (
    <li data-rule={rule.id} className="flex flex-col gap-1 px-4 py-3">
      {href ? (
        <Link to={href} className={`${LINK} self-start`}>
          {rule.name}
        </Link>
      ) : (
        <p className={`${TYPE.body} font-semibold`}>{rule.name}</p>
      )}
      <p data-part="meta" className={TYPE.bodyMuted}>
        {segmentText(rule)} · {ruleStatusText(rule)}
      </p>
      <p data-part="run" className={TYPE.bodyMuted}>
        {run === null ? (
          DO.NOT_RUN
        ) : (
          <>
            Last run <span className={NUM}>{run.on}</span>:{' '}
            {run.parts.map((p, n) => (
              <span key={p.label}>
                {n > 0 ? ' · ' : ''}
                {p.label} <span className={NUM}>{p.n}</span>
              </span>
            ))}
          </>
        )}
      </p>
    </li>
  );
}
