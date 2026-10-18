import { useState, type FormEvent } from 'react';
import { Plus, Trash2, Edit2, Sparkles, Check, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../../hooks';
import { setTourCompleted } from '../../features/auth/authSlice';
import {
  addRule,
  toggleRule,
  deleteRule,
  updateRule,
  type PersonalizationRule,
} from '../../features/settings/settingsSlice';

const PRESET_IDEAS = [
  'Always keep email summaries under 3 bullet points.',
  'Flag enterprise renewals within 45 days as high priority.',
  'Adopt an analytical, direct tone with quantifiable metrics.',
  'Highlight missing executive sponsors on deals over $50k.',
  'Never propose external meetings on Friday afternoons.',
];

export function PersonalizationPage() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const rules = useAppSelector((state) => state.settings.rules);

  const [showModal, setShowModal] = useState(false);
  const [editingRule, setEditingRule] = useState<PersonalizationRule | null>(null);
  const [ruleText, setRuleText] = useState('');
  const [ruleCategory, setRuleCategory] = useState<PersonalizationRule['category']>('general');
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const notify = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3000);
  };

  const handleOpenAdd = () => {
    setEditingRule(null);
    setRuleText('');
    setRuleCategory('general');
    setShowModal(true);
  };

  const handleOpenEdit = (rule: PersonalizationRule) => {
    setEditingRule(rule);
    setRuleText(rule.text);
    setRuleCategory(rule.category);
    setShowModal(true);
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!ruleText.trim()) return;

    if (editingRule) {
      dispatch(updateRule({ id: editingRule.id, text: ruleText.trim(), category: ruleCategory }));
      notify('Standing rule updated.');
    } else {
      dispatch(
        addRule({
          text: ruleText.trim(),
          isEnabled: true,
          category: ruleCategory,
        })
      );
      notify('New personalization rule active.');
    }

    setShowModal(false);
    setRuleText('');
  };

  const handleToggle = (id: string) => {
    dispatch(toggleRule(id));
  };

  const handleDelete = (id: string) => {
    dispatch(deleteRule(id));
    notify('Standing rule removed.');
  };

  return (
    <div className="flex flex-col gap-4" aria-label="Personalization Settings">
      {/* Header with Title and Add Rule Button */}
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-[14px] font-semibold text-[var(--rv-text)] tracking-tight">Personalization</h1>
        <button
          type="button"
          onClick={handleOpenAdd}
          className="rv-pill-primary text-[11.5px] flex items-center gap-1.5 cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Add rule</span>
        </button>
      </div>

      {toastMsg && (
        <div className="bg-[var(--rv-input-bg)] text-[var(--rv-text)] border border-[var(--rv-card-border)] px-3.5 py-2 rounded-xl text-[12px] font-medium flex items-center justify-between shadow-md">
          <span className="flex items-center gap-2">
            <Check className="w-3.5 h-3.5 text-emerald-400" /> {toastMsg}
          </span>
        </div>
      )}

      {/* Subheader context */}
      <div className="flex flex-col gap-1">
        <h2 className="text-[13.5px] font-semibold text-[var(--rv-text)]">
          What You've Asked Revenact to Remember
        </h2>
        <p className="text-[11.5px] text-[var(--rv-text-muted)] leading-relaxed">
          Standing rules that shape every reply. Add, edit, or remove them here, or just ask Revenact in chat.
        </p>
      </div>

      {/* Empty State or Rule List */}
      {rules.length === 0 ? (
        <div className="rv-card p-5 md:p-6 flex flex-col items-start gap-2 border-dashed border-[var(--rv-card-border)]">
          <p className="text-[12px] text-[var(--rv-text-muted)] italic leading-relaxed">
            Nothing remembered yet.{' '}
            <button
              type="button"
              onClick={handleOpenAdd}
              className="text-[var(--rv-text)] font-medium underline hover:text-[var(--rv-text)] cursor-pointer not-italic"
            >
              Add one
            </button>{' '}
            or tell Revenact something like &quot;always keep replies short&quot;.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {rules.map((rule) => (
            <div
              key={rule.id}
              className={`rv-card p-4 flex items-start justify-between gap-4 transition-all ${
                rule.isEnabled ? 'bg-[var(--rv-card-bg)]' : 'bg-[var(--rv-sidebar-bg)] opacity-60'
              }`}
            >
              <div className="flex-1 flex flex-col gap-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-md bg-[var(--rv-pill-secondary-bg)] text-[var(--rv-text-muted)] border border-[var(--rv-card-border)]">
                    {rule.category}
                  </span>
                  {!rule.isEnabled && (
                    <span className="text-[10.5px] font-medium text-[var(--rv-text-faint)]">
                      (Paused)
                    </span>
                  )}
                </div>
                <p className="text-[12.5px] text-[var(--rv-text)] font-medium leading-relaxed">
                  &ldquo;{rule.text}&rdquo;
                </p>
              </div>

              <div className="flex items-center gap-2.5 shrink-0 pt-0.5">
                {/* Toggle switch */}
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={rule.isEnabled}
                    onChange={() => handleToggle(rule.id)}
                    className="sr-only peer"
                  />
                  <div className="w-8 h-4.5 bg-[var(--rv-pill-secondary-bg)] border border-[var(--rv-card-border)] peer-focus-visible:ring-2 peer-focus-visible:ring-accent rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-[var(--rv-text-muted)] after:rounded-full after:h-3.5 after:w-3.5 after:transition-transform after:duration-150 peer-checked:bg-[var(--rv-pill-primary-bg)] peer-checked:border-[var(--rv-pill-primary-bg)] peer-checked:after:bg-[var(--rv-pill-primary-text)]"></div>
                </label>

                {/* Edit */}
                <button
                  type="button"
                  onClick={() => handleOpenEdit(rule)}
                  className="p-1 text-[var(--rv-text-muted)] hover:text-[var(--rv-text)] transition-colors cursor-pointer"
                  title="Edit rule"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                </button>

                {/* Delete */}
                <button
                  type="button"
                  onClick={() => handleDelete(rule.id)}
                  className="p-1 text-[var(--rv-text-muted)] hover:text-red-400 transition-colors cursor-pointer"
                  title="Delete rule"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Preset Ideas Section */}
      <div className="bg-[var(--rv-card-bg)] border border-[var(--rv-card-border)] rounded-xl p-4 md:p-5 flex flex-col gap-2.5">
        <div className="flex items-center gap-2 text-[12.5px] font-semibold text-[var(--rv-text)]">
          <Sparkles className="w-3.5 h-3.5 text-amber-400" />
          <span>Popular Rule Presets</span>
        </div>
        <p className="text-[11.5px] text-[var(--rv-text-muted)]">
          Click any recommendation below to quickly incorporate it into your personalization settings:
        </p>

        <div className="flex flex-wrap gap-2 pt-1">
          {PRESET_IDEAS.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => {
                dispatch(addRule({ text: preset, isEnabled: true, category: 'style' }));
                notify('Added preset rule.');
              }}
              className="text-left px-2.5 py-1 rounded-lg bg-[var(--rv-input-bg)] border border-[var(--rv-card-border)] text-[11px] text-[var(--rv-text)] font-medium hover:border-[var(--rv-card-border-hover)] hover:bg-[var(--rv-pill-secondary-bg)] transition-all cursor-pointer"
            >
              + &ldquo;{preset}&rdquo;
            </button>
          ))}
        </div>
      </div>

      {/* First-run tour */}
      <section className="rv-card p-5 flex flex-col gap-3" aria-labelledby="tour-heading">
        <div>
          <h2 id="tour-heading" className="text-[13.5px] font-semibold text-[var(--rv-text)]">
            Product tour
          </h2>
          <p className="text-[12px] text-[var(--rv-text-muted)] mt-0.5">
            The eight-step walk-through you saw on your first sign-in. Take it again any time.
          </p>
        </div>
        <div>
          <button
            type="button"
            onClick={() => {
              // Clears the server-side stamp, then the tour is where `/` sends you.
              dispatch(setTourCompleted(false));
              navigate('/onboarding');
            }}
            className="rv-pill-secondary text-[11.5px] cursor-pointer"
          >
            Show the tour again
          </button>
        </div>
      </section>

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-[var(--rv-card-bg)] rounded-2xl border border-[var(--rv-card-border)] shadow-2xl w-full max-w-lg p-5 md:p-6 flex flex-col gap-4 text-[var(--rv-text)]">
            <div className="flex items-center justify-between">
              <h3 className="text-[14px] font-semibold text-[var(--rv-text)]">
                {editingRule ? 'Edit Standing Rule' : 'New Personalization Rule'}
              </h3>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="text-[var(--rv-text-muted)] hover:text-[var(--rv-text)] p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
              <div className="flex flex-col gap-1">
                <label htmlFor="rule-desc" className="text-[11px] font-medium text-[var(--rv-text-muted)]">
                  What should Revenact remember across your responses?
                </label>
                <textarea
                  id="rule-desc"
                  rows={3}
                  value={ruleText}
                  onChange={(e) => setRuleText(e.target.value)}
                  placeholder="e.g. Always keep email replies concise and limit summaries to 3 bullet points."
                  className="rv-input text-[12px]"
                  autoFocus
                />
              </div>

              <div className="flex flex-col gap-1">
                <label htmlFor="rule-category" className="text-[11px] font-medium text-[var(--rv-text-muted)]">
                  Category
                </label>
                <select
                  id="rule-category"
                  value={ruleCategory}
                  onChange={(e) => setRuleCategory(e.target.value as PersonalizationRule['category'])}
                  className="rv-input text-[12px] bg-[var(--rv-input-bg)]"
                >
                  <option value="general">General Behavior</option>
                  <option value="style">Style & Length</option>
                  <option value="priority">Priority & Alerting</option>
                  <option value="context">Domain Context</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-[var(--rv-card-border)]">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="rv-pill-secondary text-[11.5px] cursor-pointer"
                >
                  Cancel
                </button>
                <button type="submit" className="rv-pill-primary text-[11.5px] cursor-pointer">
                  {editingRule ? 'Update rule' : 'Save rule'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
