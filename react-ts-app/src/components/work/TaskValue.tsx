import { MONO } from '../organizations/portfolio/styles';
import { TYPE } from '../ui';

/** A field the reader may not change: its label above (the same label as an
 *  editable field beside it), its value as text. */
export function TaskValue({ label, value, mono = false, wide = false }: { label: string; value: string; mono?: boolean; wide?: boolean }) {
  return (
    <div className={`flex min-w-0 flex-col gap-1 ${wide ? 'sm:col-span-2' : ''}`}>
      <p className={TYPE.label}>{label}</p>
      <p className={`max-w-[70ch] whitespace-pre-line break-words ${TYPE.body} ${mono ? MONO : ''}`}>{value}</p>
    </div>
  );
}
