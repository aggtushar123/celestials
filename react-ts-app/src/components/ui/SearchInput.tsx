import { useRef, type RefObject } from 'react';
import { Search, X } from 'lucide-react';
import { FOCUS, ICON_BUTTON } from './styles';

/** The one search field (UI foundations spec §5.5): a hidden label with
 *  the full description, a placeholder of at most 24 characters, the
 *  Search icon, and Clear search while there is a value. The clear button
 *  sits outside the label so it never joins the field's accessible name. */
export function SearchInput({
  label,
  value,
  onChange,
  placeholder,
  inputRef,
  width = 'grow',
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** At most 24 characters ("Search organizations"), so it never truncates. */
  placeholder: string;
  inputRef?: RefObject<HTMLInputElement | null>;
  /** `grow` fills a toolbar row up to max-w-sm; `full` takes the whole width. */
  width?: 'grow' | 'full';
}) {
  const ownRef = useRef<HTMLInputElement>(null);
  const ref = inputRef ?? ownRef;
  return (
    <div className={width === 'grow' ? 'relative min-w-0 flex-1 sm:min-w-[12rem] sm:max-w-sm' : 'relative w-full'}>
      <label className="block">
        <span className="sr-only">{label}</span>
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" aria-hidden="true" />
        <input
          ref={ref}
          type="search"
          value={value}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
          className={`w-full min-h-11 sm:min-h-9 rounded-lg border border-line bg-surface pl-9 pr-9 text-[13px] text-ink placeholder:text-ink-faint hover:border-line-strong [&::-webkit-search-cancel-button]:appearance-none ${FOCUS}`}
        />
      </label>
      {value ? (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => {
            onChange('');
            ref.current?.focus();
          }}
          className={`absolute right-0 top-1/2 -translate-y-1/2 ${ICON_BUTTON}`}
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}
