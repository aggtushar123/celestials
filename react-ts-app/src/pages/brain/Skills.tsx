import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAppDispatch, useAppSelector, useCapability } from '../../hooks';
import { fetchSkills } from '../../features/skills/skillsSlice';
import type { Skill } from '../../features/skills/skillsSlice';
import { formatDate } from '../../features/customers/formatters';
import { FORM_ALERT, INLINE_TARGET, LoadingState, MetaParts, NUM, QUIET, SettingsFrame, SettingsNote, SettingsSection, TYPE } from '../../components/ui';
import { settingsTitle } from '../settings/workspaceSettingsNav';

const compact = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M` : n >= 1_000 ? `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}K` : String(n);

const OUTCOME: Record<NonNullable<Skill['last_run']>['outcome'], { label: string; className: string }> = {
  ok: { label: 'OK', className: 'text-ink-muted' },
  failed: { label: 'Failed', className: 'font-semibold text-danger-ink' },
  unconfigured: { label: 'Not configured', className: 'text-ink-muted' },
  over_budget: { label: 'Over budget', className: 'font-semibold text-danger-ink' },
};

function List({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="min-w-0">
      <h4 className={`mb-1 ${TYPE.label}`}>{title}</h4>
      <ul className="flex flex-col gap-0.5">
        {items.map((item) => (
          <li key={item} className={TYPE.bodyMuted}>
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

function SkillRow({ skill }: { skill: Skill }) {
  const share = skill.usage.budget > 0 ? Math.min(100, (skill.usage.spent / skill.usage.budget) * 100) : 0;
  const surface = skill.surface.split(' ')[0];
  return (
    <li>
      <article aria-label={skill.name} className="flex flex-col gap-3 px-4 py-3">
        <div className="flex flex-col gap-0.5">
          <h3 className={`${TYPE.body} font-semibold`}>{skill.name}</h3>
          <p className={TYPE.bodyMuted}>{skill.summary}</p>
          <p className={TYPE.meta}>
            <MetaParts
              parts={[
                `Runs when ${skill.trigger.charAt(0).toLowerCase()}${skill.trigger.slice(1)}`,
                <>
                  Shows on{' '}
                  <Link to={surface} className={`${INLINE_TARGET} text-ink hover:underline`}>
                    {skill.surface}
                  </Link>
                </>,
              ]}
            />
          </p>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <List title="Reads" items={skill.reads} />
          <List title="May" items={skill.may} />
          <List title="Never" items={skill.never} />
        </div>
        <p className={`border-t border-line-subtle pt-2 ${TYPE.meta}`}>
          <MetaParts
            parts={[
              `Who may ask: ${skill.gate}`,
              <span title={`${skill.usage.calls} calls this month, ${skill.usage.failed} failed`}>
                <span className={NUM}>{compact(skill.usage.spent)}</span> of <span className={NUM}>{compact(skill.usage.budget)}</span> tokens (<span className={NUM}>{share.toFixed(0)}%</span>)
              </span>,
              skill.usage.failed > 0 ? (
                <span className="text-[11px] leading-4 text-danger-ink">
                  <span className={NUM}>{skill.usage.failed}</span> failed
                </span>
              ) : null,
              skill.produced ? (
                <>
                  <span className={NUM}>{skill.produced.count}</span> {skill.produced.label}
                </>
              ) : null,
              skill.produced?.approved !== undefined ? (
                <>
                  <span className={NUM}>{skill.produced.approved}</span> approved
                </>
              ) : null,
              skill.last_run ? (
                <>
                  last run {formatDate(skill.last_run.at.slice(0, 10))}
                  {skill.last_run.user ? ` by ${skill.last_run.user}` : ''}: <span className={OUTCOME[skill.last_run.outcome].className}>{OUTCOME[skill.last_run.outcome].label}</span>
                </>
              ) : (
                'never run'
              ),
            ]}
          />
        </p>
      </article>
    </li>
  );
}

/**
 * AI skills: what the brain's agents may do.
 *
 * The mock page of this name listed invented capabilities. This one is
 * the real catalogue: every purpose a model call can run under, what
 * that agent is given, what it may do with it, what it may never do, who
 * may ask, and where it shows, beside how each has actually been used
 * this month and what it has produced. The catalogue lives in code next
 * to the prompts (services/copilot/skills.py); a new purpose without a
 * description fails a backend test.
 */
export function SkillsPage() {
  const dispatch = useAppDispatch();
  const canSeeAll = useCapability('view_all_accounts');
  const { data, isLoading, error } = useAppSelector((s) => s.skills);

  useEffect(() => {
    if (canSeeAll) dispatch(fetchSkills());
  }, [dispatch, canSeeAll]);

  return (
    <SettingsFrame
      title={settingsTitle('/settings/ai/skills')}
      intro="What each agent is given, what it may do, what it may never do, and how it has been used."
      note={canSeeAll ? undefined : <SettingsNote icon="lock">The skills catalogue reports organisation-wide usage, which needs the view-all-accounts capability.</SettingsNote>}
      action={
        data ? (
          <Link to="/settings/ai/usage" className={QUIET}>
            Budgets and the call log
          </Link>
        ) : undefined
      }
    >
      {error ? (
        <p role="alert" className={FORM_ALERT}>
          {error}
        </p>
      ) : null}
      {data || (isLoading && canSeeAll) ? (
        <SettingsSection
          title="Skills"
          description={data ? <MetaParts parts={[`${data.skills.length} skills`, `usage since ${formatDate(data.month_start)}`]} /> : undefined}
          list="Skills"
          state={data ? undefined : <LoadingState label="Loading the skills" />}
        >
          {data?.skills.map((skill) => (
            <SkillRow key={skill.purpose} skill={skill} />
          ))}
        </SettingsSection>
      ) : null}
    </SettingsFrame>
  );
}
