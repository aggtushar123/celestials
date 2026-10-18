import { Link } from 'react-router-dom';
import type { CurrencyCode } from '../../features/auth/authSlice';
import type { DoingPlan } from '../../features/brain/brainTypes';
import { DO, planHref, thenNowParts } from '../../features/brain/doingText';
import { recordPath } from '../../features/brain/deskText';
import { formatDate } from '../../features/customers/formatters';
import { STATUS_LABEL } from '../../features/plans/planOptions';
import { NUM, TYPE } from '../ui';
import { LINK } from './styles';

/** One plan (spec §2.1; plan Decision 7): the plan's own page, its record,
 *  where it stands, and health and ARR then → now (Contract note 10). */
export function DoingPlanRow({ plan, currency }: { plan: DoingPlan; currency: CurrencyCode }) {
  const parts = thenNowParts(plan, currency);
  return (
    <li data-plan={plan.id} className="flex flex-col gap-1 px-4 py-3">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <Link to={planHref(plan)} className={LINK}>
          {plan.name}
        </Link>
        <span className={TYPE.bodyMuted}>on</span>
        <Link to={recordPath(plan.record)} className={LINK}>
          {plan.record.name}
        </Link>
      </div>
      <p data-part="meta" className={TYPE.bodyMuted}>
        {STATUS_LABEL[plan.status]} · <span className={NUM}>{plan.milestones.done}</span> of <span className={NUM}>{plan.milestones.total}</span>{' '}
        milestones · by <span className={NUM}>{formatDate(plan.target_date)}</span> · {plan.owner.name}
      </p>
      <p data-part="figures" className={TYPE.body}>
        {parts === null
          ? DO.BEFORE_FIGURES
          : parts.length === 0
            ? DO.NO_FIGURES
            : parts.map((p, n) => (
                <span key={p.label}>
                  {n > 0 ? ' · ' : ''}
                  {p.label} <span className={NUM}>{p.then}</span> → <span className={NUM}>{p.now}</span>
                </span>
              ))}
      </p>
    </li>
  );
}
