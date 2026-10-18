import { useId } from 'react';
import { Check } from 'lucide-react';
import { lengthParts } from '../../features/plans/planText';
import type { PlanTemplate, TemplateLists } from '../../features/plans/planTypes';
import { Parts } from '../rules/Parts';
import { BUTTON, FOCUS, LoadingState, TYPE } from '../ui';
import { KindChip } from './parts';
import type { TemplatesLoad } from './useTemplates';

const SECTIONS: readonly { key: keyof TemplateLists; label: string }[] = [
  { key: 'builtin', label: 'Built-in' },
  { key: 'mine', label: 'Yours' },
  { key: 'shared', label: 'Shared with you' },
];

/** A radio drawn as a card: the whole label is the target; chosen reads as
 *  a border, a fill and a check, not a colour alone. */
function TemplateCard({ name, template, checked, onChange }: { name: string; template: PlanTemplate; checked: boolean; onChange: () => void }) {
  return (
    <label
      data-template={template.id}
      className={`flex min-h-11 cursor-pointer flex-col gap-1 rounded-lg border px-3 py-2 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent ${
        checked ? 'border-accent bg-subtle' : 'border-line hover:border-line-strong'
      }`}
    >
      <span className="flex min-w-0 items-center gap-2">
        <input type="radio" name={name} checked={checked} onChange={onChange} className="sr-only" />
        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-ink">{template.name}</span>
        <KindChip kind={template.kind} />
        {checked ? <Check className="h-4 w-4 shrink-0 text-ink" aria-hidden="true" /> : null}
      </span>
      <span className="text-[11px] text-ink-muted">
        <Parts parts={lengthParts(template)} />
      </span>
    </label>
  );
}

/** 2. Template (spec §2.2): the four built-in, then Yours and Shared with
 *  you, each card with its milestone count, task count and length. */
export function TemplateStep({ load, chosen, error, onPick, onRetry }: {
  load: TemplatesLoad;
  chosen: number | null;
  error?: string;
  onPick: (id: number) => void;
  onRetry: () => void;
}) {
  const headingId = useId();
  const name = useId();
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <h3 id={headingId} className="text-[15px] font-semibold text-ink">
        2. Template
      </h3>
      {load.status === 'loading' ? (
        <LoadingState label="Loading templates" variant="block" />
      ) : null}
      {load.status === 'failed' ? (
        <div role="alert" className="flex flex-wrap items-center gap-2 text-[13px] text-danger">
          <span>{load.message}</span>
          <button type="button" onClick={onRetry} className={BUTTON}>
            Try again
          </button>
        </div>
      ) : null}
      {load.status === 'ready'
        ? SECTIONS.map((section) => {
            const list = load.lists[section.key];
            if (list.length === 0) return null;
            return (
              <fieldset key={section.key} className="flex flex-col gap-2">
                <legend className={`mb-1 ${TYPE.label}`}>{section.label}</legend>
                <div className="grid gap-2 sm:grid-cols-2">
                  {list.map((template) => (
                    <TemplateCard key={template.id} name={name} template={template} checked={chosen === template.id} onChange={() => onPick(template.id)} />
                  ))}
                </div>
              </fieldset>
            );
          })
        : null}
      {error ? (
        <p role="alert" data-error tabIndex={-1} className={`text-[11px] text-danger ${FOCUS}`}>
          {error}
        </p>
      ) : null}
    </section>
  );
}
