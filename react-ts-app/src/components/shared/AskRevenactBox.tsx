import { useState, useRef, type FormEvent, type KeyboardEvent, type RefObject } from 'react';
import {
  ArrowUp,
  ChevronDown,
  AudioLines,
  AtSign,
  Zap,
  Bot,
  Sparkles,
  Check,
  Building2,
  Mail,
  User,
} from 'lucide-react';

interface AskRevenactBoxProps {
  onSend: (text: string, mode: 'Fast' | 'Reasoning' | 'Pro', context: string) => void;
  disabled?: boolean;
  /** The owner's handle on the input, to put focus back after a send it
   *  started elsewhere (a suggestion, Retry). */
  inputRef?: RefObject<HTMLInputElement | null>;
  /** The text the box opens with (a prefilled question). Remount with a new
   *  `key` to replace it. */
  initialValue?: string;
  /** Focus the input on mount. */
  autoFocus?: boolean;
  /** Called when the person changes the text (typing, a mention), so an
   *  owner can tell an edited prefill from an untouched one. */
  onEdit?: () => void;
  /** The id of the text that says why nothing can be asked right now (the
   *  rail's `unavailable` line), so a screen-reader user who types anyway
   *  hears it rather than silence. */
  ariaDescribedBy?: string;
}

export const AskRevenactBox: React.FC<AskRevenactBoxProps> = ({
  onSend,
  disabled = false,
  inputRef: givenRef,
  initialValue = '',
  autoFocus = false,
  onEdit,
  ariaDescribedBy,
}) => {
  const [query, setQuery] = useState(initialValue);
  const [modelMode, setModelMode] = useState<'Fast' | 'Reasoning' | 'Pro'>('Fast');
  const [isModelDropdownOpen, setIsModelDropdownOpen] = useState(false);
  const [isMentionMenuOpen, setIsMentionMenuOpen] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const contextSource = 'Workspace';
  const ownRef = useRef<HTMLInputElement>(null);
  const inputRef = givenRef ?? ownRef;

  const handleSubmit = (e?: FormEvent) => {
    if (e) e.preventDefault();
    const text = query.trim();
    if (!text || disabled) return;
    onSend(text, modelMode, contextSource);
    setQuery('');
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleVoiceToggle = () => {
    if (!isListening) {
      setIsListening(true);
      setTimeout(() => {
        setQuery('Summarize accounts up for renewal next month');
        setIsListening(false);
      }, 2000);
    } else {
      setIsListening(false);
    }
  };

  const handleInsertMention = (mention: string) => {
    setQuery((prev) => `${prev} @${mention} `);
    onEdit?.();
    setIsMentionMenuOpen(false);
    inputRef.current?.focus();
  };

  return (
    <div className="w-full bg-[var(--rv-ask-bg)] rounded-2xl border border-[var(--rv-ask-border)] shadow-xl p-3 transition-colors duration-200 text-[var(--rv-ask-text)]">
      {/* Input Area */}
      <form onSubmit={handleSubmit} className="relative mb-2">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            onEdit?.();
          }}
          onKeyDown={handleKeyDown}
          placeholder="Ask Revenact"
          autoFocus={autoFocus}
          aria-describedby={ariaDescribedBy}
          className="w-full text-[13px] text-[var(--rv-ask-text)] placeholder:text-[var(--rv-text-faint)] placeholder:font-normal outline-none border-none bg-transparent py-0.5 font-sans"
        />
      </form>

      {/* Bottom Toolbar Row */}
      <div className="flex items-center justify-between pt-1 border-t border-[var(--rv-card-border)]">
        {/* Left: @ mention tool */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setIsMentionMenuOpen(!isMentionMenuOpen)}
            className="p-1 text-[var(--rv-text-muted)] hover:text-[var(--rv-text)] rounded-md hover:bg-black/5 dark:hover:bg-white/[0.06] transition-colors"
            title="Mention account, contact, or tool"
          >
            <AtSign className="w-3.5 h-3.5" />
          </button>

          {/* Mention Menu */}
          {isMentionMenuOpen && (
            <div className="absolute bottom-8 left-0 w-44 bg-[var(--rv-card-bg)] rounded-xl shadow-xl border border-[var(--rv-card-border)] py-1 z-50 text-xs text-[var(--rv-text)]">
              <div className="px-2.5 py-1 text-[10px] uppercase font-semibold text-[var(--rv-text-muted)] tracking-wider">
                Insert Mention
              </div>
              <button
                type="button"
                onClick={() => handleInsertMention('Accounts')}
                className="w-full text-left px-3 py-1.5 hover:bg-black/5 dark:hover:bg-white/[0.06] flex items-center gap-2"
              >
                <Building2 className="w-3.5 h-3.5 text-blue-500" />
                <span>@Accounts</span>
              </button>
              <button
                type="button"
                onClick={() => handleInsertMention('Gmail')}
                className="w-full text-left px-3 py-1.5 hover:bg-black/5 dark:hover:bg-white/[0.06] flex items-center gap-2"
              >
                <Mail className="w-3.5 h-3.5 text-rose-500" />
                <span>@Gmail</span>
              </button>
              <button
                type="button"
                onClick={() => handleInsertMention('CSM Team')}
                className="w-full text-left px-3 py-1.5 hover:bg-black/5 dark:hover:bg-white/[0.06] flex items-center gap-2"
              >
                <User className="w-3.5 h-3.5 text-purple-500" />
                <span>@CSM Team</span>
              </button>
            </div>
          )}
        </div>

        {/* Right Tools: Model selector, Waveform voice, Send button */}
        <div className="flex items-center gap-1.5">
          {/* Model Speed Selector Pill */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsModelDropdownOpen(!isModelDropdownOpen)}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium text-[var(--rv-ask-tool-text)] bg-[var(--rv-ask-tool-bg)] hover:opacity-90 border border-[var(--rv-ask-tool-border)] transition-colors cursor-pointer"
            >
              <span>{modelMode}</span>
              <ChevronDown className="w-2.5 h-2.5 text-[var(--rv-text-muted)]" />
            </button>

            {/* Model Mode Dropdown */}
            {isModelDropdownOpen && (
              <div className="absolute bottom-7 right-0 w-32 bg-[var(--rv-card-bg)] rounded-xl shadow-xl border border-[var(--rv-card-border)] py-1 z-50 text-xs text-[var(--rv-text)]">
                {(['Fast', 'Reasoning', 'Pro'] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => {
                      setModelMode(mode);
                      setIsModelDropdownOpen(false);
                    }}
                    className="w-full text-left px-3 py-1.5 hover:bg-black/5 dark:hover:bg-white/[0.06] flex items-center justify-between"
                  >
                    <div className="flex items-center gap-1.5">
                      {mode === 'Fast' && <Zap className="w-3 h-3 text-amber-500" />}
                      {mode === 'Reasoning' && <Bot className="w-3 h-3 text-blue-500" />}
                      {mode === 'Pro' && <Sparkles className="w-3 h-3 text-purple-500" />}
                      <span>{mode}</span>
                    </div>
                    {modelMode === mode && <Check className="w-3 h-3 text-emerald-500" />}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Audio waveform / mic icon */}
          <button
            type="button"
            onClick={handleVoiceToggle}
            className={`p-1 rounded-md transition-colors cursor-pointer ${
              isListening
                ? 'bg-rose-500/20 text-rose-500 animate-pulse'
                : 'text-[var(--rv-text-muted)] hover:text-[var(--rv-text)] hover:bg-black/5 dark:hover:bg-white/[0.06]'
            }`}
            title={isListening ? 'Listening...' : 'Voice command'}
          >
            <AudioLines className="w-3.5 h-3.5" />
          </button>

          {/* Send circular button with up arrow */}
          <button
            type="button"
            disabled={!query.trim() || disabled}
            onClick={() => handleSubmit()}
            aria-label="Send"
            className={`w-5.5 h-5.5 rounded-full flex items-center justify-center transition-colors shrink-0 ${
              query.trim() && !disabled
                ? 'bg-[var(--rv-ask-btn-bg)] text-[var(--rv-ask-btn-text)] hover:opacity-90 shadow-xs cursor-pointer'
                : 'bg-black/10 dark:bg-white/10 text-[var(--rv-text-faint)] cursor-not-allowed'
            }`}
            title="Send"
          >
            <ArrowUp className="w-3 h-3 stroke-[2.5]" />
          </button>
        </div>
      </div>
    </div>
  );
};
