// The first thing a person sees after signing in.
//
// One question, asked well: the greeting, the ask box, three things worth
// asking, and the skills. It sits directly on the canvas with no frame
// around it, because a home page is a place, not a panel inside one. Every
// colour is a token; the only accent is the one the product has.

import { useEffect, useMemo, useState } from 'react';
import { ArrowUp, AtSign, Sparkles, X } from 'lucide-react';
import { MentionTextarea } from '../../components/shared/MentionTextarea';
import { useAppSelector } from '../../hooks';
import { SKILLS, type Category } from './skillsCatalog';

// The one skill prompt template that was ever fully written out — reused
// verbatim as the real message Run sends, labelled with whichever skill was
// chosen so the model knows what was asked for.
function buildSkillPrompt(skillTitle: string): string {
  return (
    `Run the "${skillTitle}" skill: create a high-level strategy for ` +
    'de-risking and renewing a focus account that I can share with our ' +
    'internal team.\n\n' +
    "Include: 1) who's involved (the CSM/TAM account owner, and any CSE " +
    'involved in calls/meetings/engagements with this account), and ' +
    "2) a strategic assessment — the account's ARR, true renewal date, " +
    'auto-renew/opt-out status, their use case, a root cause analysis of ' +
    'why the account is actually at risk (not symptoms — the underlying ' +
    'strategic misalignment), 2-3 high-level strategy bullets (no ' +
    'tactics), and how we would know the strategy is working.'
  );
}

const CATEGORIES: Category[] = ['Account', 'CSM', 'Portfolio', 'Product'];

/** Three things worth asking. Real questions the Copilot answers from real
 *  data, not marketing lines. */
const SUGGESTIONS = [
  'Which renewals in the next 90 days are at risk, and why?',
  'What changed in my accounts this week?',
  'Who has been waiting longest for a reply from us?',
];

function greetingFor(hour: number): string {
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

export function HomeView({
  onSendPrompt,
  selectedSkill,
  onSelectSkill,
}: {
  onSendPrompt: (p: string) => void;
  selectedSkill?: string | null;
  onSelectSkill?: (skill: string | null) => void;
}) {
  const user = useAppSelector((state) => state.auth.user);
  const [inputText, setInputText] = useState('');
  const [category, setCategory] = useState<Category | 'All'>('All');

  const now = useMemo(() => new Date(), []);
  const dateLine = now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
  const greeting = `${greetingFor(now.getHours())}${user?.name ? `, ${user.name.split(' ')[0]}` : ''}.`;

  useEffect(() => {
    if (selectedSkill) {
      window.setTimeout(() => {
        document.getElementById('active-skill-card')?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
      }, 10);
    }
  }, [selectedSkill]);

  const visible = category === 'All' ? SKILLS : SKILLS.filter((s) => s.category === category);

  function send() {
    if (inputText.trim()) onSendPrompt(inputText.trim());
  }

  return (
    <div className="flex-1 h-full overflow-y-auto custom-scrollbar w-full">
      <div className="w-full max-w-[760px] mx-auto px-6 pt-12 pb-24 flex flex-col">
        <p className="font-mono-brand text-[11px] uppercase tracking-[0.14em] text-ink-faint">{dateLine}</p>
        <h1 className="font-display text-[34px] leading-[1.1] tracking-tight text-ink mt-2">{greeting}</h1>
        <p className="text-[14px] text-ink-muted mt-2">Ask about your organisation, or start from a skill.</p>

        {selectedSkill ? (
          <div id="active-skill-card" className="mt-8 bg-surface border border-line rounded-xl shadow-sm">
            <div className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-mono-brand text-[10.5px] uppercase tracking-[0.12em] text-ink-faint">Skill</p>
                  <h2 className="text-[16px] font-semibold text-ink mt-0.5">{selectedSkill}</h2>
                </div>
                <button
                  type="button"
                  onClick={() => onSelectSkill?.(null)}
                  aria-label="Close skill"
                  className="p-1.5 rounded-md text-ink-faint hover:text-ink hover:bg-subtle"
                >
                  <X className="w-4 h-4" aria-hidden="true" />
                </button>
              </div>
              <div className="mt-4 text-[13.5px] text-ink-muted leading-[1.65] max-w-[64ch] space-y-3">
                <p>
                  Create a high-level strategy for de-risking and renewing <span className="font-mono-brand text-[12.5px] text-ink bg-subtle border border-line rounded px-1.5 py-0.5">account</span> that I can share with our internal team.
                </p>
                <p className="text-ink font-medium">1. Who is involved</p>
                <ul className="list-disc pl-5 space-y-1">
                  <li>The CSM or TAM who owns the account.</li>
                  <li>Any CSE who joined a call, meeting or engagement with a contact from this account.</li>
                </ul>
                <p className="text-ink font-medium">2. Strategic assessment</p>
                <ul className="list-disc pl-5 space-y-1">
                  <li>ARR, true renewal date, auto-renew and opt-out dates or notice period.</li>
                  <li>Their use case, from call, meeting and engagement summaries.</li>
                  <li>Root cause: why the account is actually at risk, not the symptoms.</li>
                  <li>The path back: two or three high-level bullets, no tactics.</li>
                  <li>How we will know it is working.</li>
                </ul>
              </div>
            </div>
            <div className="border-t border-line-subtle px-5 py-3 flex items-center justify-end gap-2">
              <button type="button" onClick={() => onSelectSkill?.(null)} className="rv-pill-secondary">
                Cancel
              </button>
              <button type="button" onClick={() => onSendPrompt(buildSkillPrompt(selectedSkill))} className="rv-pill-primary">
                <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
                Run skill
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="mt-8 bg-surface border border-line rounded-xl shadow-sm focus-within:border-line-strong transition-colors duration-[var(--dur-fast)]">
              <MentionTextarea
                className="w-full min-h-[92px] bg-transparent resize-none outline-none border-none px-4 pt-4 pb-2 text-[15px] text-ink placeholder:text-ink-faint leading-relaxed"
                placeholder="Ask anything — @mention a colleague or a function to route a question to them"
                aria-label="Message Copilot"
                value={inputText}
                onChange={setInputText}
                onSubmit={send}
              />
              <div className="flex items-center justify-between px-3 pb-3">
                <span className="inline-flex items-center gap-1.5 text-[11.5px] text-ink-faint">
                  <AtSign className="w-3.5 h-3.5" aria-hidden="true" />
                  @ routes a question to a colleague or a function
                </span>
                <button
                  type="button"
                  onClick={send}
                  disabled={!inputText.trim()}
                  aria-label="Send"
                  className="w-8 h-8 rounded-full bg-accent text-on-accent flex items-center justify-center transition-opacity duration-[var(--dur-fast)] disabled:opacity-30 hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
                >
                  <ArrowUp className="w-4 h-4" strokeWidth={2.5} aria-hidden="true" />
                </button>
              </div>
            </div>

            <ul className="mt-3 flex flex-wrap gap-2" aria-label="Suggested questions">
              {SUGGESTIONS.map((q) => (
                <li key={q}>
                  <button
                    type="button"
                    onClick={() => onSendPrompt(q)}
                    className="rounded-full border border-line bg-surface/70 px-3 py-1.5 text-[12.5px] text-ink-muted hover:text-ink hover:border-line-strong transition-colors duration-[var(--dur-fast)]"
                  >
                    {q}
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}

        <section className="mt-14" aria-labelledby="skills-heading">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="skills-heading" className="text-[13px] font-semibold text-ink">Skills</h2>
            <div role="tablist" aria-label="Skill categories" className="flex items-center gap-1">
              {(['All', ...CATEGORIES] as const).map((c) => (
                <button
                  key={c}
                  type="button"
                  role="tab"
                  aria-selected={category === c}
                  onClick={() => setCategory(c)}
                  className={`px-2.5 py-1 rounded-full text-[12px] transition-colors duration-[var(--dur-fast)] ${
                    category === c ? 'bg-accent text-on-accent' : 'text-ink-muted hover:text-ink hover:bg-subtle'
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          <ul className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {visible.map((skill) => {
              const Icon = skill.icon;
              return (
                <li key={skill.title}>
                  <button
                    type="button"
                    onClick={() => onSelectSkill?.(skill.title)}
                    className="w-full h-full text-left bg-surface border border-line rounded-xl p-4 hover:border-line-strong transition-colors duration-[var(--dur-fast)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  >
                    <span className="w-7 h-7 rounded-md bg-subtle text-ink-muted flex items-center justify-center">
                      <Icon className="w-4 h-4" aria-hidden="true" />
                    </span>
                    <span className="block text-[13px] font-semibold text-ink mt-3 leading-snug">{skill.title}</span>
                    <span className="block text-[12px] text-ink-muted mt-1 leading-[1.5]">{skill.desc}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </div>
  );
}
