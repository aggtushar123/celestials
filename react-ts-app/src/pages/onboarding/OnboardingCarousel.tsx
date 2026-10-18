// The first-run tour.
//
// Every screen here describes something the product actually does: the
// connectors in services/mail and the ticket sources, the four waiting
// buckets the Communications queue is built from, the five-component
// health rubric, and the Brain. Nothing is invented for the sake of a
// slide, because an onboarding that promises a feature is a promise the
// first session has to keep.
//
// Only one step writes anything: the theme step dispatches to the real
// settings slice, so a choice made here is the choice the app runs with.
// The rest are illustrations, and say so.

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Check,
  Sun,
  Moon,
  Rows3,
  Rows2,
  Mail,
  AtSign,
  LifeBuoy,
  Phone,
  HeartPulse,
  Brain,
  Sparkles,
  MessageSquare,
  LayoutGrid,
  Layers,
  Plus,
  ArrowRight,
} from 'lucide-react';
import { useAppDispatch, useAppSelector } from '../../hooks';
import { setTheme } from '../../features/settings/settingsSlice';
import { setTourCompleted } from '../../features/auth/authSlice';
import { RevenactMark } from '../../components/shared/RevenactMark';
import { SOURCES, sourceIcon } from './sourceCatalog';
import './OnboardingCarousel.css';

const TOTAL_STEPS = 8;

/** The four buckets Communications actually groups work into: the folders
 *  in src/pages/communications/InboxPanel.tsx own the real ones. */
const BUCKETS = [
  {
    kind: 'email' as const,
    label: 'Replies owed',
    icon: Mail,
    tint: 'onb-tint-accent',
    detail: 'A customer wrote last and nobody has answered yet.',
  },
  {
    kind: 'question' as const,
    label: 'Questions for you',
    icon: AtSign,
    tint: 'onb-tint-info',
    detail: 'Someone inside your company put a question to you by name.',
  },
  {
    kind: 'ticket' as const,
    label: 'Open tickets',
    icon: LifeBuoy,
    tint: 'onb-tint-warning',
    detail: 'Support work on your accounts that has not been closed.',
  },
  {
    kind: 'call' as const,
    label: 'Calls to wrap up',
    icon: Phone,
    tint: 'onb-tint-success',
    detail: 'A call happened and its follow-up has not been recorded.',
  },
];

/** Illustration rows for the preview window. Deliberately generic company
 *  names and no real addresses: this is a drawing of the queue, not data. */
const SAMPLE_QUEUE = [
  {
    id: 1,
    account: 'Northwind Labs',
    initial: 'N',
    tint: 'onb-tint-accent',
    source: 'gmail',
    bucket: 'Replies owed',
    snippet: 'Asked for the revised rollout plan before their board review.',
    time: '9:42',
  },
  {
    id: 2,
    account: 'Harbor Freight Co',
    initial: 'H',
    tint: 'onb-tint-warning',
    source: 'zendesk',
    bucket: 'Open tickets',
    snippet: 'Export jobs timing out for the third day running.',
    time: '9:05',
  },
  {
    id: 3,
    account: 'Volta Energy',
    initial: 'V',
    tint: 'onb-tint-info',
    source: 'slack',
    bucket: 'Questions for you',
    snippet: 'Finance wants the renewal number before Thursday.',
    time: '8:31',
  },
  {
    id: 4,
    account: 'Pinewood Health',
    initial: 'P',
    tint: 'onb-tint-success',
    source: 'calls',
    bucket: 'Calls to wrap up',
    snippet: 'QBR finished with two commitments and no owner recorded.',
    time: '8:02',
  },
  {
    id: 5,
    account: 'Atlas Freight',
    initial: 'A',
    tint: 'onb-tint-accent',
    source: 'outlook',
    bucket: 'Replies owed',
    snippet: 'Security review questionnaire waiting on your answers.',
    time: '7:48',
  },
  {
    id: 6,
    account: 'Cedar Mutual',
    initial: 'C',
    tint: 'onb-tint-warning',
    source: 'jira',
    bucket: 'Open tickets',
    snippet: 'Escalated defect moved to in-progress, customer not told.',
    time: '7:20',
  },
];

/** The five weighted components behind a health score, as the backend's
 *  rubric defines them. Weights are shown because a number nobody can
 *  explain is a number nobody trusts. */
const HEALTH_COMPONENTS = [
  { label: 'Product usage', weight: 30 },
  { label: 'Support load', weight: 20 },
  { label: 'Engagement', weight: 20 },
  { label: 'Sentiment', weight: 15 },
  { label: 'Commercial', weight: 15 },
];

export function OnboardingCarousel() {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const user = useAppSelector((state) => state.auth.user);
  const theme = useAppSelector((state) => state.settings.theme);

  const [step, setStep] = useState(1);
  const [selectedSources, setSelectedSources] = useState<string[]>(['gmail']);
  const [showConnected, setShowConnected] = useState(false);
  const [showMoreSources, setShowMoreSources] = useState(false);
  const [density, setDensity] = useState<'compact' | 'expanded'>('compact');
  const [activeBucket, setActiveBucket] = useState<(typeof BUCKETS)[number]['kind']>('email');
  const [queue, setQueue] = useState(SAMPLE_QUEUE);
  const [clearedOne, setClearedOne] = useState(false);

  function toggleSource(id: string) {
    setSelectedSources((current) =>
      current.includes(id)
        ? current.length > 1
          ? current.filter((s) => s !== id)
          : current
        : [...current, id]
    );
  }

  function finish() {
    // Recorded on the server, so the tour follows the person and a new
    // browser does not replay it. Leaving before the reply lands is fine:
    // the root redirect reads the cached user, which the reply updates.
    dispatch(setTourCompleted(true));
    navigate('/work', { replace: true });
  }

  function goNext() {
    if (step === 2 && !showConnected) {
      setShowConnected(true);
      return;
    }
    if (step < TOTAL_STEPS) {
      setStep(step + 1);
      return;
    }
    finish();
  }

  function goBack() {
    if (step === 2 && showMoreSources) {
      setShowMoreSources(false);
      return;
    }
    if (step === 2 && showConnected) {
      setShowConnected(false);
      return;
    }
    if (step > 1) setStep(step - 1);
  }

  function clearItem(id: number) {
    setQueue((current) => current.filter((item) => item.id !== id));
    setClearedOne(true);
  }

  const visibleQueue =
    step === 5 ? queue.filter((item) => item.bucket === bucketLabel(activeBucket)) : queue;

  return (
    <div className="onboarding-wrapper">
      <header className="onboarding-top-bar">
        <button
          type="button"
          onClick={goBack}
          className={`onboarding-back-btn ${step === 1 ? 'invisible' : ''}`}
        >
          <ArrowLeft className="w-4 h-4" aria-hidden="true" />
          <span>Back</span>
        </button>

        <RevenactMark withWordmark size="sm" className="onboarding-brand" />

        <nav className="onboarding-dots" aria-label="Tour steps">
          {Array.from({ length: TOTAL_STEPS }, (_, index) => index + 1).map((dot) => (
            <button
              key={dot}
              type="button"
              className={`onboarding-dot ${step === dot ? 'active' : ''}`}
              aria-label={`Step ${dot} of ${TOTAL_STEPS}`}
              aria-current={step === dot ? 'step' : undefined}
              onClick={() => {
                setStep(dot);
                setShowMoreSources(false);
              }}
            />
          ))}
        </nav>

        <button type="button" onClick={finish} className="onboarding-skip-btn">
          Skip tour
        </button>
      </header>

      <main className="onboarding-content-area">
        {/* ── 1. What this is ─────────────────────────────────── */}
        {step === 1 && (
          <>
            <div className="onboarding-header-block">
              <h1 className="onboarding-title">
                {user?.name ? `Welcome, ${user.name.split(' ')[0]}.` : 'Welcome to Revenact.'}
              </h1>
              <p className="onboarding-subtitle">
                Three things to set up. After that your portfolio arrives already triaged.
              </p>
            </div>

            <div className="cards-trio-grid">
              <article className="card-trio-item">
                <h2 className="card-trio-title">Connect your sources</h2>
                <p className="card-trio-desc">
                  Mail, shared Slack channels, your helpdesk and your call recordings.
                </p>
                <div className="card-trio-visual">
                  <div className="flex flex-wrap items-center justify-center gap-2.5">
                    {SOURCES.slice(0, 6).map((source) => (
                      <span key={source.id} className="onb-source-chip" title={source.name}>
                        {sourceIcon(source.id, 'w-5 h-5')}
                      </span>
                    ))}
                  </div>
                </div>
              </article>

              <article className="card-trio-item">
                <h2 className="card-trio-title">See what needs you</h2>
                <p className="card-trio-desc">
                  One queue across every account you own, ordered by what is waiting longest.
                </p>
                <div className="card-trio-visual">
                  <ul className="w-full space-y-1.5">
                    {BUCKETS.map((bucket) => (
                      <li key={bucket.kind} className="onb-mini-row">
                        <span className={`onb-mini-icon ${bucket.tint}`}>
                          <bucket.icon className="w-3.5 h-3.5" aria-hidden="true" />
                        </span>
                        <span className="text-[11px] text-ink-muted">{bucket.label}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </article>

              <article className="card-trio-item">
                <h2 className="card-trio-title">Know why a score moved</h2>
                <p className="card-trio-desc">
                  Health is five weighted components, and every one of them is inspectable.
                </p>
                <div className="card-trio-visual">
                  <div className="flex flex-col items-center gap-2">
                    <span className="onb-score-ring">
                      <HeartPulse className="w-5 h-5" aria-hidden="true" />
                    </span>
                    <span className="text-[11px] font-semibold text-ink">Health 74</span>
                    <span className="text-[10px] text-ink-faint">Down 6 since last month</span>
                  </div>
                </div>
              </article>
            </div>
          </>
        )}

        {/* ── 2. Sources ──────────────────────────────────────── */}
        {step === 2 && !showConnected && (
          <>
            <div className="onboarding-header-block">
              <h1 className="onboarding-title">Choose what Revenact should read.</h1>
              <p className="onboarding-subtitle">
                Pick at least one. Your mail stays visible to you only, until you add a conversation to Revenact.
              </p>
            </div>

            <div className="apps-choice-grid">
              {SOURCES.map((source) => {
                const selected = selectedSources.includes(source.id);
                return (
                  <button
                    key={source.id}
                    type="button"
                    className={`app-choice-card ${selected ? 'selected' : ''}`}
                    aria-pressed={selected}
                    onClick={() => toggleSource(source.id)}
                  >
                    <span className="app-choice-card-left">
                      <span className="app-choice-icon">{source.icon}</span>
                      <span className="text-left">
                        <span className="app-choice-name">{source.name}</span>
                        <span className="app-choice-blurb">{source.blurb}</span>
                      </span>
                    </span>
                    <span className="app-choice-check">
                      {selected && <Check className="w-3 h-3" aria-hidden="true" />}
                    </span>
                  </button>
                );
              })}
            </div>
          </>
        )}

        {step === 2 && showConnected && (
          <>
            <div className="onboarding-header-block">
              <h1 className="onboarding-title">Connect them from Settings › Connections.</h1>
              <p className="onboarding-subtitle">
                Each one opens its own consent screen. You can add the rest later.
              </p>
            </div>

            <div className="connected-app-panel">
              <ul className="w-full divide-y divide-line-subtle">
                {selectedSources.map((id) => {
                  const source = SOURCES.find((s) => s.id === id);
                  if (!source) return null;
                  return (
                    <li key={id} className="connected-app-item">
                      <span className="flex items-center gap-3">
                        {sourceIcon(id, 'w-6 h-6')}
                        <span>
                          <span className="block text-[13px] font-semibold text-ink">
                            {source.name}
                          </span>
                          <span className="block text-[11px] text-ink-muted">
                            {id === 'gmail' || id === 'outlook'
                              ? (user?.email ?? 'Your work mailbox')
                              : source.blurb}
                          </span>
                        </span>
                      </span>
                      <span className="onb-status-pill">Not connected yet</span>
                    </li>
                  );
                })}
              </ul>

              <button
                type="button"
                onClick={() => setShowMoreSources(true)}
                className="onb-text-btn"
              >
                <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Show every source</span>
              </button>
            </div>
          </>
        )}

        {step === 2 && showMoreSources && (
          <div className="onb-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="onb-modal-title">
            <div className="onb-modal">
              <h2 id="onb-modal-title" className="text-[15px] font-semibold text-ink mb-2">
                The more you connect, the less you have to chase.
              </h2>
              <p className="text-[12px] text-ink-muted leading-relaxed mb-5">
                Health reads support load and engagement from these systems. With only mail
                connected, two of the five components stay empty.
              </p>
              <div className="flex flex-wrap items-center gap-2.5 mb-6">
                {SOURCES.map((source) => (
                  <button
                    key={source.id}
                    type="button"
                    className={`onb-source-chip ${selectedSources.includes(source.id) ? 'selected' : ''}`}
                    aria-pressed={selectedSources.includes(source.id)}
                    aria-label={source.name}
                    onClick={() => toggleSource(source.id)}
                  >
                    {sourceIcon(source.id, 'w-5 h-5')}
                  </button>
                ))}
              </div>
              <div className="flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowMoreSources(false)}
                  className="onb-btn-secondary"
                >
                  Keep choosing
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowMoreSources(false);
                    setStep(3);
                  }}
                  className="onb-btn-primary-sm"
                >
                  Continue
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── 3. Theme ────────────────────────────────────────── */}
        {step === 3 && (
          <>
            <div className="onboarding-header-block">
              <h1 className="onboarding-title">Choose your theme.</h1>
              <p className="onboarding-subtitle">
                This one is real. It saves straight away and you can change it in Settings.
              </p>
            </div>

            <div className="theme-selector-bar" role="radiogroup" aria-label="Theme">
              {(
                [
                  { value: 'system' as const, label: 'Match system', icon: null },
                  { value: 'light' as const, label: 'Light', icon: Sun },
                  { value: 'dark' as const, label: 'Dark', icon: Moon },
                ]
              ).map((option) => (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={theme === option.value}
                  className={`theme-pill-btn ${theme === option.value ? 'active' : ''}`}
                  onClick={() => dispatch(setTheme(option.value))}
                >
                  <span className="theme-pill-icon">
                    {option.icon ? (
                      <option.icon className="w-5 h-5" aria-hidden="true" />
                    ) : (
                      <span className="onb-split-swatch" aria-hidden="true" />
                    )}
                  </span>
                  <span className="theme-pill-label">{option.label}</span>
                </button>
              ))}
            </div>

            <AppPreview queue={queue.slice(0, 4)} density="compact" />
          </>
        )}

        {/* ── 4. Density ──────────────────────────────────────── */}
        {step === 4 && (
          <>
            <div className="onboarding-header-block">
              <h1 className="onboarding-title">How much do you want to see at once?</h1>
              <p className="onboarding-subtitle">
                Compact fits a full book of business on one screen. Expanded shows the first line
                of every thread.
              </p>
            </div>

            <div className="theme-selector-bar" role="radiogroup" aria-label="Queue density">
              {(
                [
                  { value: 'compact' as const, label: 'Compact', icon: Rows3 },
                  { value: 'expanded' as const, label: 'Expanded', icon: Rows2 },
                ]
              ).map((option) => (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={density === option.value}
                  className={`theme-pill-btn ${density === option.value ? 'active' : ''}`}
                  onClick={() => setDensity(option.value)}
                >
                  <span className="theme-pill-icon">
                    <option.icon className="w-5 h-5" aria-hidden="true" />
                  </span>
                  <span className="theme-pill-label">{option.label}</span>
                </button>
              ))}
            </div>

            <AppPreview queue={queue} density={density} />
          </>
        )}

        {/* ── 5. Buckets ──────────────────────────────────────── */}
        {step === 5 && (
          <>
            <div className="onboarding-header-block">
              <h1 className="onboarding-title">Four kinds of waiting.</h1>
              <p className="onboarding-subtitle">
                Communications sorts everything it reads into these, per account you own.
              </p>
            </div>

            <div className="collections-tabs-bar" role="tablist" aria-label="Queue buckets">
              {BUCKETS.map((bucket) => (
                <button
                  key={bucket.kind}
                  type="button"
                  role="tab"
                  aria-selected={activeBucket === bucket.kind}
                  className={`collection-tab-btn ${activeBucket === bucket.kind ? 'active' : ''}`}
                  onClick={() => setActiveBucket(bucket.kind)}
                >
                  <span className={`collection-tab-icon ${bucket.tint}`}>
                    <bucket.icon className="w-5 h-5" aria-hidden="true" />
                  </span>
                  <span className="collection-tab-label">{bucket.label}</span>
                </button>
              ))}
            </div>

            <p className="onb-bucket-detail">
              {BUCKETS.find((b) => b.kind === activeBucket)?.detail}
            </p>

            <AppPreview queue={visibleQueue} density="compact" emptyLabel="Nothing waiting here." />
          </>
        )}

        {/* ── 6. Working the queue ────────────────────────────── */}
        {step === 6 && (
          <>
            <div className="onboarding-header-block">
              <h1 className="onboarding-title">Clear something.</h1>
              <p className="onboarding-subtitle">
                Marking an item done takes it out of the queue until the account comes back to you.
                Try it on a row below.
              </p>
            </div>

            <AppPreview
              queue={queue}
              density="compact"
              onClear={clearItem}
              banner={clearedOne ? 'Cleared. It will return if they reply.' : undefined}
              emptyLabel="Queue empty. That is the whole idea."
            />
          </>
        )}

        {/* ── 7. How it decides ───────────────────────────────── */}
        {step === 7 && (
          <>
            <div className="onboarding-header-block">
              <h1 className="onboarding-title">How Revenact decides what matters.</h1>
              <p className="onboarding-subtitle">
                Three mechanisms, all of which you can inspect and correct.
              </p>
            </div>

            <div className="clears-trio-grid">
              <article className="clear-trio-card">
                <div className="clear-trio-visual">
                  <ul className="w-full space-y-1.5">
                    {HEALTH_COMPONENTS.map((component) => (
                      <li key={component.label} className="flex items-center gap-2">
                        <span className="text-[10px] text-ink-muted w-[84px] shrink-0">
                          {component.label}
                        </span>
                        <span className="onb-weight-track">
                          <span
                            className="onb-weight-fill"
                            style={{ width: `${(component.weight / 30) * 100}%` }}
                          />
                        </span>
                        <span className="text-[10px] font-mono-brand text-ink-faint tabular-nums">
                          {component.weight}%
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
                <h2 className="clear-trio-title">
                  <HeartPulse className="w-4 h-4" aria-hidden="true" />
                  Health, component by component
                </h2>
                <p className="clear-trio-desc">
                  One score, five weighted parts. Hover it anywhere in the app and the breakdown
                  opens, so a drop always has a reason attached.
                </p>
              </article>

              <article className="clear-trio-card">
                <div className="clear-trio-visual">
                  <div className="onb-copilot-mock">
                    <p className="onb-copilot-ask">Which renewals are at risk this quarter?</p>
                    <p className="onb-copilot-answer">
                      Four accounts. Three share the same export failure.
                    </p>
                    <span className="onb-copilot-cite">Reading 62 records</span>
                  </div>
                </div>
                <h2 className="clear-trio-title">
                  <Sparkles className="w-4 h-4" aria-hidden="true" />
                  Copilot, on your own data
                </h2>
                <p className="clear-trio-desc">
                  Ask in plain words. It answers from the records you are allowed to see, and
                  colleagues can join the same session.
                </p>
              </article>

              <article className="clear-trio-card">
                <div className="clear-trio-visual">
                  <ul className="w-full space-y-1.5 text-[11px]">
                    <li className="onb-mini-row">
                      <span className="onb-mini-icon onb-tint-success">
                        <Check className="w-3 h-3" aria-hidden="true" />
                      </span>
                      <span className="text-ink-muted">Accepted: renewal owner is Sales</span>
                    </li>
                    <li className="onb-mini-row">
                      <span className="onb-mini-icon onb-tint-warning">
                        <Brain className="w-3 h-3" aria-hidden="true" />
                      </span>
                      <span className="text-ink-muted">Proposed: escalation path changed</span>
                    </li>
                    <li className="onb-mini-row">
                      <span className="onb-mini-icon onb-tint-info">
                        <MessageSquare className="w-3 h-3" aria-hidden="true" />
                      </span>
                      <span className="text-ink-muted">Asked: who signs off on credits?</span>
                    </li>
                  </ul>
                </div>
                <h2 className="clear-trio-title">
                  <Brain className="w-4 h-4" aria-hidden="true" />
                  The Brain, reviewed by people
                </h2>
                <p className="clear-trio-desc">
                  What the system learns about your company goes to Waiting on you first. Nothing
                  becomes company knowledge without someone approving it.
                </p>
              </article>
            </div>
          </>
        )}

        {/* ── 8. What happens next ────────────────────────────── */}
        {step === 8 && (
          <>
            <div className="onboarding-header-block">
              <h1 className="onboarding-title">That is the tour.</h1>
              <p className="onboarding-subtitle">
                Your first health snapshot is built on the next scheduled run, so scores fill in
                over the first day rather than the first minute.
              </p>
            </div>

            <div className="onb-next-grid">
              <article className="onb-next-card">
                <span className="onb-next-icon onb-tint-accent">
                  <LayoutGrid className="w-5 h-5" aria-hidden="true" />
                </span>
                <h2 className="onb-next-title">Start at the Dashboard</h2>
                <p className="onb-next-desc">
                  Your book of business, with the accounts that moved most since last week at the
                  top.
                </p>
              </article>

              <article className="onb-next-card">
                <span className="onb-next-icon onb-tint-info">
                  <MessageSquare className="w-5 h-5" aria-hidden="true" />
                </span>
                <h2 className="onb-next-title">Then Communications</h2>
                <p className="onb-next-desc">
                  The queue fills as soon as the first connector finishes its initial sync.
                </p>
              </article>

              <article className="onb-next-card">
                <span className="onb-next-icon onb-tint-warning">
                  <Layers className="w-5 h-5" aria-hidden="true" />
                </span>
                <h2 className="onb-next-title">Finish in Settings › Connections</h2>
                <p className="onb-next-desc">
                  Nothing you picked here is connected yet. Settings › Connections is where each
                  one is authorised.
                </p>
              </article>
            </div>
          </>
        )}

        <div className="onboarding-bottom-bar">
          {step === 6 ? (
            <button type="button" className="onboarding-btn-primary" onClick={goNext}>
              {clearedOne ? 'Continue' : 'Clear a row to continue'}
            </button>
          ) : step === TOTAL_STEPS ? (
            <button type="button" className="onboarding-btn-primary" onClick={finish}>
              <span>Go to the Dashboard</span>
              <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </button>
          ) : (
            <button type="button" className="onboarding-btn-primary" onClick={goNext}>
              <span>Continue</span>
            </button>
          )}
        </div>
      </main>
    </div>
  );
}

function bucketLabel(kind: (typeof BUCKETS)[number]['kind']): string {
  return BUCKETS.find((bucket) => bucket.kind === kind)?.label ?? '';
}

interface AppPreviewProps {
  queue: typeof SAMPLE_QUEUE;
  density: 'compact' | 'expanded';
  onClear?: (id: number) => void;
  banner?: string;
  emptyLabel?: string;
}

/** A drawing of the Communications queue inside an application window.
 *  It is labelled as an illustration for screen readers so nobody mistakes
 *  it for their own data. */
function AppPreview({ queue, density, onClear, banner, emptyLabel }: AppPreviewProps) {
  return (
    <figure className="app-window-mock" aria-label="Illustration of the Communications queue">
      <div className="app-window-chrome">
        <span className="app-window-dot" />
        <span className="app-window-dot" />
        <span className="app-window-dot" />
      </div>

      <div className="app-window-body">
        <div className="app-window-sidebar" aria-hidden="true">
          <RevenactMark size="sm" className="mb-2" />
          <span className="app-sidebar-icon active">
            <MessageSquare className="w-4 h-4" />
          </span>
          <span className="app-sidebar-icon">
            <LayoutGrid className="w-4 h-4" />
          </span>
          <span className="app-sidebar-icon">
            <Layers className="w-4 h-4" />
          </span>
          <span className="app-sidebar-icon">
            <HeartPulse className="w-4 h-4" />
          </span>
          <span className="app-sidebar-icon">
            <Brain className="w-4 h-4" />
          </span>
        </div>

        <div className="app-window-main">
          <div className="app-window-header">
            <span className="text-[11px] font-semibold text-ink">Communications</span>
            {banner && <span className="app-window-banner">{banner}</span>}
          </div>

          {queue.length === 0 ? (
            <p className="app-window-empty">{emptyLabel ?? 'Nothing waiting.'}</p>
          ) : (
            <ul className="app-row-list">
              {queue.map((item) => (
                <li key={item.id} className={`app-row ${density}`}>
                  <span className="app-row-left">
                    <span className={`app-row-avatar ${item.tint}`}>
                      {item.initial}
                      <span className="app-row-source">{sourceIcon(item.source, 'w-2.5 h-2.5')}</span>
                    </span>
                    <span className="app-row-text">
                      <span className="app-row-account">{item.account}</span>
                      <span className="app-row-snippet">{item.snippet}</span>
                    </span>
                  </span>
                  <span className="app-row-right">
                    <span className="app-row-bucket">{item.bucket}</span>
                    <span className="app-row-time">{item.time}</span>
                    {onClear && (
                      <button
                        type="button"
                        className="app-row-clear"
                        onClick={() => onClear(item.id)}
                        aria-label={`Mark ${item.account} done`}
                      >
                        <Check className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </figure>
  );
}

export default OnboardingCarousel;
