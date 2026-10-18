import type { LucideIcon } from 'lucide-react';

/** A radio drawn as a selectable tile (the builder's Kind and Sharing): the
 *  native radio stays in the tab order and the accessibility tree, visually
 *  hidden; the whole label is the 44px target. */
export function RadioTile({ name, label, icon: Icon, checked, onChange }: {
  name: string;
  label: string;
  icon?: LucideIcon;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <label
      className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-[13px] font-semibold has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent ${
        checked ? 'border-accent bg-subtle text-ink' : 'border-line text-ink-muted hover:border-line-strong hover:text-ink'
      }`}
    >
      <input type="radio" name={name} checked={checked} onChange={onChange} className="sr-only" />
      {Icon ? <Icon className="h-4 w-4 shrink-0" aria-hidden="true" /> : null}
      {label}
    </label>
  );
}
