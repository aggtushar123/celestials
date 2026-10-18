import { useId, useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { deleteTemplate } from '../../features/plans/planApi';
import { firstError, planErrors } from '../../features/plans/planErrors';
import { KIND_LABEL, PRIORITY_LABEL, ROLE_LABEL } from '../../features/plans/planOptions';
import { lengthParts } from '../../features/plans/planText';
import type { PlanTemplate, TemplateLists } from '../../features/plans/planTypes';
import { MadeByLine } from '../../components/agents/MadeByLine';
import { ConfirmDialog } from '../../components/organizations/ConfirmDialog';
import { KindChip } from '../../components/plans/parts';
import { useTemplates } from '../../components/plans/useTemplates';
import { Parts } from '../../components/rules/Parts';
import { OrganizationsFrame } from '../organizations/OrganizationsFrame';
import { BUTTON, Card, CardHeader, EmptyState, ErrorState, FOCUS, ICON_BUTTON, ListCard, LoadingState, NUM, PageHeader, PRIMARY, ROW_ACTIONS, TYPE } from '../../components/ui';

const BACK = { to: '/projects', label: 'Project Management' } as const;

const SECTIONS: readonly { key: keyof TemplateLists; label: string; empty: string }[] = [
  { key: 'builtin', label: 'Built-in', empty: '' },
  { key: 'mine', label: 'Yours', empty: 'Save a plan as a template, or make one from scratch.' },
  { key: 'shared', label: 'Shared with you', empty: 'Nothing is shared with you yet.' },
];

/** One template (Decision 10): its name opens it in place; Use starts a
 *  plan from it; yours also have Edit and Delete. */
function TemplateItem({ template, onDeleted }: { template: PlanTemplate; onDeleted: () => void }) {
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const viewId = useId();
  return (
    <li data-template={template.id} className="group relative flex flex-col gap-2 px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={open ? viewId : undefined}
          onClick={() => setOpen((value) => !value)}
          className={`inline-flex min-h-11 min-w-0 items-center rounded-sm text-left ${TYPE.body} font-semibold hover:underline sm:min-h-9 ${FOCUS}`}
        >
          {template.name}
        </button>
        {KIND_LABEL[template.kind] !== template.name ? <KindChip kind={template.kind} /> : null}
        <span className={TYPE.meta}>
          <Parts parts={lengthParts(template)} />
        </span>
        {!template.is_builtin && !template.is_owner && template.owner ? <span className={TYPE.meta}>From {template.owner.name}</span> : null}
        {template.is_owner ? (
          <span className={`ml-auto ${ROW_ACTIONS}`}>
            <Link to={`/projects/templates/${template.id}/edit`} aria-label={`Edit ${template.name}`} className={ICON_BUTTON}>
              <Pencil className="h-4 w-4" aria-hidden="true" />
            </Link>
            <button type="button" aria-label={`Delete ${template.name}`} onClick={() => setDeleting(true)} className={ICON_BUTTON}>
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            </button>
          </span>
        ) : null}
      </div>
      <MadeByLine madeBy={template.made_by} />
      {open ? (
        <div id={viewId} className="flex flex-col gap-2">
          {template.description ? <p className={TYPE.bodyMuted}>{template.description}</p> : null}
          <ol aria-label={`Milestones in ${template.name}`} className="flex flex-col gap-2">
            {template.milestones.map((milestone, at) => (
              <li key={`${milestone.name}-${at}`} className="flex flex-col gap-1">
                <p className={`${TYPE.body} font-semibold`}>
                  Day <span className={NUM}>{milestone.offset_days}</span> · {milestone.name}
                </p>
                {milestone.tasks.length > 0 ? (
                  <ul className="flex flex-col gap-0.5 pl-3">
                    {milestone.tasks.map((task, i) => (
                      <li key={`${task.title}-${i}`} className={TYPE.meta}>
                        Day <span className={NUM}>{task.offset_days}</span> · {task.title} · {PRIORITY_LABEL[task.priority]} · {ROLE_LABEL[task.assignee_role]}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ol>
          <Link to={`/projects/new?template=${template.id}`} className={`${BUTTON} self-start`}>
            Use
          </Link>
        </div>
      ) : null}
      {deleting ? (
        <ConfirmDialog
          title={`Delete ${template.name}?`}
          message="Plans already started from it keep their copy."
          confirmLabel="Delete"
          danger
          onConfirm={async () => {
            try {
              await deleteTemplate(template.id);
            } catch (err) {
              throw firstError(planErrors(err, [], 'Could not delete this template.'));
            }
            onDeleted();
          }}
          onClose={() => setDeleting(false)}
        />
      ) : null}
    </li>
  );
}

/** /projects/templates (spec §2.4). It reads again when its editor modal
 *  closes back to it, and after a delete. */
export function TemplatesPage() {
  const modalOpen = useLocation().pathname.replace(/\/$/, '') !== '/projects/templates';
  const [wasOpen, setWasOpen] = useState(modalOpen);
  const [version, setVersion] = useState(0);
  if (wasOpen !== modalOpen) {
    setWasOpen(modalOpen);
    if (!modalOpen) setVersion((n) => n + 1);
  }
  const [load, retry] = useTemplates(version);
  return (
    <OrganizationsFrame>
      <PageHeader back={BACK} />
      <div className="flex flex-col gap-6 pb-6">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className={`min-w-0 flex-1 ${TYPE.display}`}>Templates</h1>
          <Link to="/projects/templates/new" className={PRIMARY}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            New template
          </Link>
        </div>
        {load.status === 'loading' ? (
          <Card pad="none">
            <LoadingState label="Loading templates" count={4} />
          </Card>
        ) : null}
        {load.status === 'failed' ? (
          <Card pad="none">
            <ErrorState message={load.message} onRetry={retry} />
          </Card>
        ) : null}
        {load.status === 'ready'
          ? SECTIONS.map((section) => {
              const list = load.lists[section.key];
              if (list.length === 0 && section.empty === '') return null;
              return (
                <ListCard
                  key={section.key}
                  label={section.label}
                  header={<CardHeader title={section.label} />}
                  state={list.length === 0 ? <EmptyState size="inline" title={section.empty} /> : undefined}
                >
                  {list.map((template) => (
                    <TemplateItem key={template.id} template={template} onDeleted={() => setVersion((n) => n + 1)} />
                  ))}
                </ListCard>
              );
            })
          : null}
      </div>
      {/* /projects/templates/new and /:id/edit: the editor modal over this page. */}
      <Outlet />
    </OrganizationsFrame>
  );
}
