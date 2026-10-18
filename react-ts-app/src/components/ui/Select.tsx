import { useEffect, useId } from 'react';
import { ChevronDown } from 'lucide-react';
import { INVALID, SELECT } from './styles';
import { TYPE } from './type';

export interface SelectOption<T extends string> {
  value: T;
  label: string;
  /** Shown but not choosable (a plan's Done before every milestone is). */
  disabled?: boolean;
}

/** Options under one `<optgroup>` label ("AI attributes"). */
export interface SelectGroup<T extends string> {
  label: string;
  options: readonly SelectOption<T>[];
}

function optionOf<T extends string>(option: SelectOption<T>) {
  return (
    <option key={option.value} value={option.value} disabled={option.disabled}>
      {option.label}
    </option>
  );
}

/** A native select with the house frame and chevron (UI foundations spec
 *  §5.5). The label sits `above` (forms), `inline` to the left ("Sort by",
 *  toolbars), `hidden` (a control whose context names it) or `external`
 *  (no label of its own: a `<label htmlFor={id}>` elsewhere, the rules'
 *  `Field`, names it, so `id` is required). An inline select never shrinks
 *  below its own width: the row wraps instead (Pipelines' Sort by was
 *  clipped beside the Ask rail). `invalid` sets `aria-invalid` and the
 *  danger edge; `describedBy` points at its hint and error; `className` is
 *  layout only (a width, `self-start`), on the outer wrapper. */
export function Select<T extends string>({
  label,
  labelPosition = 'above',
  value,
  onChange,
  options,
  disabled = false,
  id,
  invalid = false,
  describedBy,
  className = '',
}: {
  label: string;
  labelPosition?: 'above' | 'inline' | 'hidden' | 'external';
  value: T;
  onChange: (value: T) => void;
  options: readonly (SelectOption<T> | SelectGroup<T>)[];
  disabled?: boolean;
  id?: string;
  invalid?: boolean;
  describedBy?: string;
  className?: string;
}) {
  const ownId = useId();
  const selectId = id ?? ownId;
  useEffect(() => {
    if (import.meta.env.DEV && labelPosition === 'external' && !id) console.error('Select: labelPosition="external" needs the id its label points at');
  }, [labelPosition, id]);
  const control = (
    <div className={`relative min-w-0 ${labelPosition === 'external' ? className : ''}`.trim()}>
      <select
        id={selectId}
        value={value}
        disabled={disabled}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        onChange={(event) => onChange(event.target.value as T)}
        className={`${SELECT} ${INVALID}`}
      >
        {options.map((item) =>
          'options' in item ? (
            <optgroup key={`group-${item.label}`} label={item.label}>
              {item.options.map(optionOf)}
            </optgroup>
          ) : (
            optionOf(item)
          ),
        )}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" aria-hidden="true" />
    </div>
  );
  if (labelPosition === 'external') return control;
  if (labelPosition === 'inline') {
    return (
      <div className={`flex shrink-0 items-center gap-2 ${className}`.trim()}>
        <label htmlFor={selectId} className={`shrink-0 ${TYPE.bodyMuted}`}>
          {label}
        </label>
        {control}
      </div>
    );
  }
  return (
    <div className={`flex flex-col gap-1.5 ${className}`.trim()}>
      <label htmlFor={selectId} className={labelPosition === 'hidden' ? 'sr-only' : TYPE.label}>
        {label}
      </label>
      {control}
    </div>
  );
}
