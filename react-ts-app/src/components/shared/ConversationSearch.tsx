// A search box for conversations: the icon, the field, the "/" hint.
//
// It used to sit in the Communications top bar; the page no longer shows it,
// but the box is kept whole so any surface that wants to search
// conversations (a future global search, the inbox itself) can drop it in.
// It owns no state and dispatches nothing: the caller holds the draft and
// decides what a submit means.

import { type FormEvent } from 'react';
import { Search } from 'lucide-react';

export interface ConversationSearchProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  placeholder?: string;
  /** Shown in the corner as the shortcut hint; omit to hide it. */
  shortcut?: string;
  id?: string;
  className?: string;
}

export function ConversationSearch({
  value,
  onChange,
  onSubmit,
  placeholder = 'Search all conversations',
  shortcut = '/',
  id = 'conversation-search',
  className = '',
}: ConversationSearchProps) {
  return (
    <form
      role="search"
      className={`relative ${className}`}
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        onSubmit(value);
      }}
    >
      <Search className="w-4 h-4 text-ink-faint absolute left-3.5 top-1/2 -translate-y-1/2" aria-hidden="true" />
      <label htmlFor={id} className="sr-only">
        {placeholder}
      </label>
      <input
        id={id}
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full h-11 pl-10 pr-10 rounded-xl bg-surface border border-line text-[13.5px] text-ink placeholder:text-ink-faint focus-visible:outline-none focus-visible:border-line-strong"
      />
      {shortcut ? (
        <kbd className="absolute right-3 top-1/2 -translate-y-1/2 font-mono-brand text-[10px] text-ink-faint border border-line rounded px-1.5 py-0.5">
          {shortcut}
        </kbd>
      ) : null}
    </form>
  );
}
