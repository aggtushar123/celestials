import { useCallback } from 'react';
import { Link } from 'react-router-dom';
import { FileStack, Plus } from 'lucide-react';
import { KIND_LABEL, KINDS } from '../../features/plans/planOptions';
import type { PlanParams, PlanScope, PlansView, StatusFilter } from '../../features/plans/planParams';
import type { PersonRef, PlanKind } from '../../features/plans/planTypes';
import { useSearchText } from '../organizations/portfolio/useSearchText';
import { BUTTON, PRIMARY, SearchInput, SegmentedControl, Select, Toolbar } from '../ui';

const SCOPES: readonly { value: PlanScope; label: string }[] = [
  { value: 'mine', label: 'Mine' },
  { value: 'tasks', label: 'Has my tasks' },
  { value: 'all', label: 'All I can see' },
];
const STATUS_OPTIONS: readonly { value: StatusFilter; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'draft', label: 'Draft' },
  { value: 'done', label: 'Done' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'all', label: 'All' },
];

/** The Plans toolbar (spec 2.1; UI foundations spec 5.6): the scope
 *  leads, then the search (commits 300 ms after typing stops), kind, owner
 *  (outside Mine), status (List only), Templates, and New plan last. */
export function PlanFilters({
  params,
  scope,
  view,
  owners,
  onChange,
  newPlanHref,
}: {
  params: PlanParams;
  scope: PlanScope;
  view: PlansView;
  owners: PersonRef[];
  onChange: (next: PlanParams) => void;
  /** New plan, carrying the list's filters into the modal and back. */
  newPlanHref: string;
}) {
  const commit = useCallback((q: string) => onChange({ ...params, q }), [params, onChange]);
  const [text, setText] = useSearchText(params.q, commit);
  return (
    <Toolbar
      lead={<SegmentedControl label="Scope" options={SCOPES} value={scope} onChange={(next) => onChange({ ...params, scope: next })} />}
      search={<SearchInput label="Search plans by plan or record name" placeholder="Search plans" value={text} onChange={setText} />}
      filters={
        <>
          <Select<PlanKind | ''>
            label="Kind"
            labelPosition="hidden"
            value={params.kind}
            onChange={(kind) => onChange({ ...params, kind })}
            options={[{ value: '', label: 'All kinds' }, ...KINDS.map((kind) => ({ value: kind, label: KIND_LABEL[kind] }))]}
          />
          {scope !== 'mine' ? (
            <Select
              label="Owner"
              labelPosition="hidden"
              value={params.owner === null ? '' : String(params.owner)}
              onChange={(owner) => onChange({ ...params, owner: owner ? Number(owner) : null })}
              options={[{ value: '', label: 'Any owner' }, ...owners.map((person) => ({ value: String(person.id), label: person.name }))]}
            />
          ) : null}
          {view === 'list' ? (
            <Select<StatusFilter> label="Status" labelPosition="hidden" value={params.status} onChange={(status) => onChange({ ...params, status })} options={STATUS_OPTIONS} />
          ) : null}
        </>
      }
      actions={{
        extra: (
          <Link to="/projects/templates" className={BUTTON}>
            <FileStack className="h-4 w-4" aria-hidden="true" />
            Templates
          </Link>
        ),
        primary: (
          <Link to={newPlanHref} className={PRIMARY}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            New plan
          </Link>
        ),
      }}
    />
  );
}
