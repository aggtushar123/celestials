import React, { useState } from 'react';
import { Plus, Sparkles, Zap, Clock, Trash2, X } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '../../hooks';
import {
  addCustomSkill,
  toggleCustomSkill,
  deleteCustomSkill,
  type CustomSkill,
} from '../../features/settings/settingsSlice';

const PRESET_TEMPLATES = [
  {
    name: 'Weekly Health & Churn Digest',
    summary: 'Synthesizes account health changes, usage drops, and open tickets into a Monday morning briefing.',
    trigger: 'Every Monday at 8:00 AM',
    instructions: 'Examine accounts with MRR > $1k. Flag any accounts whose health score dropped more than 10 points this week.',
  },
  {
    name: 'Executive Escalation Responder',
    summary: 'Monitors inbound communication sentiment and alerts the account lead when customer distress is detected.',
    trigger: 'On inbound email or ticket',
    instructions: 'If sentiment analysis drops below threshold or customer mentions canceling, generate an executive outreach draft.',
  },
  {
    name: 'Meeting Notes & Action Item Extractor',
    summary: 'Transcribes recorded customer calls, extracts action items, and syncs key insights to the account timeline.',
    trigger: 'On call recording upload',
    instructions: 'Extract key objections, competitor mentions, expansion opportunities, and action items with assignees.',
  },
  {
    name: 'Contract Renewal Auditor',
    summary: 'Verifies license counts against actual Stripe and Salesforce product usage 45 days prior to renewal.',
    trigger: '45 days before contract end date',
    instructions: 'Cross-reference active seats with contracted tiers and flag potential downsell or true-up candidates.',
  },
];

export const SkillsTasksPage: React.FC = () => {
  const dispatch = useAppDispatch();
  const skills = useAppSelector((state) => state.settings?.customSkills || []);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [showEmptyPreview, setShowEmptyPreview] = useState(false);

  // Form state
  const [name, setName] = useState('');
  const [summary, setSummary] = useState('');
  const [trigger, setTrigger] = useState('Every Monday at 9:00 AM');
  const [instructions, setInstructions] = useState('');

  const handleOpenAddModal = (preset?: typeof PRESET_TEMPLATES[0]) => {
    if (preset) {
      setName(preset.name);
      setSummary(preset.summary);
      setTrigger(preset.trigger);
      setInstructions(preset.instructions);
    } else {
      setName('');
      setSummary('');
      setTrigger('Every Monday at 9:00 AM');
      setInstructions('');
    }
    setIsModalOpen(true);
  };

  const handleSaveSkill = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    dispatch(
      addCustomSkill({
        name: name.trim(),
        summary: summary.trim() || 'Custom automated workflow running across customer telemetry.',
        trigger: trigger.trim() || 'Manual trigger',
        status: 'active',
        instructions: instructions.trim() || 'Execute scheduled analysis on active customer records.',
        lastRun: 'Just added',
      })
    );

    setIsModalOpen(false);
    setShowEmptyPreview(false);
  };

  const activeSkills = skills.filter((s) => s.status === 'active');
  const displayedSkills = showEmptyPreview ? [] : skills;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-[14px] font-semibold text-[var(--rv-text)] tracking-tight">Skills & Tasks</h1>
          <p className="text-[11.5px] text-[var(--rv-text-muted)] mt-0.5">
            Autonomous AI capabilities and automated workflows running on your customer data.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {skills.length > 0 && (
            <button
              type="button"
              onClick={() => setShowEmptyPreview(!showEmptyPreview)}
              className="text-[11px] text-[var(--rv-text-muted)] hover:text-[var(--rv-text)] px-2.5 py-1 rounded-lg border border-[var(--rv-card-border)] bg-[var(--rv-input-bg)] transition-colors cursor-pointer"
            >
              {showEmptyPreview ? 'Show Active Skills' : 'Preview Empty State'}
            </button>
          )}
          <button
            type="button"
            onClick={() => handleOpenAddModal()}
            className="rv-pill-primary text-[11.5px] flex items-center gap-1.5 shadow-sm cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            Add skill
          </button>
        </div>
      </div>

      {/* Main Container */}
      {displayedSkills.length === 0 ? (
        /* Empty State */
        <div className="rv-card p-6 md:p-8 text-left border border-dashed border-[var(--rv-card-border)] rounded-2xl bg-[var(--rv-card-bg)] shadow-sm transition-all">
          <div className="max-w-md">
            <h2 className="text-[14px] font-medium text-[var(--rv-text)]">No skills yet</h2>
            <p className="text-[11.5px] text-[var(--rv-text-muted)] mt-1 leading-relaxed">
              Create one by asking Revenact in chat, or add one here.
            </p>
            <div className="mt-4">
              <button
                type="button"
                onClick={() => handleOpenAddModal()}
                className="rv-pill-primary text-[11.5px] flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                Add skill
              </button>
            </div>
          </div>

          {/* Quick starter suggestions */}
          <div className="mt-6 pt-5 border-t border-[var(--rv-card-border)]">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--rv-text-muted)] mb-2.5">
              Or start from a template
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {PRESET_TEMPLATES.map((tmpl) => (
                <button
                  key={tmpl.name}
                  type="button"
                  onClick={() => handleOpenAddModal(tmpl)}
                  className="flex items-start gap-2.5 p-2.5 text-left rounded-xl border border-[var(--rv-card-border)] hover:border-[var(--rv-card-border-hover)] bg-[var(--rv-input-bg)] hover:bg-[var(--rv-pill-secondary-bg)] transition-all group cursor-pointer"
                >
                  <div className="w-6.5 h-6.5 rounded-lg bg-[var(--rv-pill-secondary-bg)] border border-[var(--rv-card-border)] flex items-center justify-center shrink-0 text-[var(--rv-text)] mt-0.5">
                    <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[12px] font-medium text-[var(--rv-text)] group-hover:text-[var(--rv-text)]">
                      {tmpl.name}
                    </div>
                    <div className="text-[10.5px] text-[var(--rv-text-muted)] line-clamp-1 mt-0.5">
                      {tmpl.summary}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : (
        /* Active Skills List */
        <div className="space-y-3">
          <div className="flex items-center justify-between text-[11.5px] text-[var(--rv-text-muted)] px-1">
            <span>
              {activeSkills.length} active of {skills.length} total automated skills
            </span>
          </div>

          <div className="grid grid-cols-1 gap-2.5">
            {displayedSkills.map((skill: CustomSkill) => {
              const isActive = skill.status === 'active';
              return (
                <div
                  key={skill.id}
                  className={`rv-card p-3.5 transition-all duration-200 ${
                    isActive ? 'bg-[var(--rv-card-bg)] border-[var(--rv-card-border)]' : 'bg-[var(--rv-sidebar-bg)] border-[var(--rv-card-border)] opacity-75'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3.5">
                    <div className="flex items-start gap-3 min-w-0">
                      <div
                        className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 border transition-colors ${
                          isActive
                            ? 'bg-[var(--rv-pill-primary-bg)] text-[var(--rv-pill-primary-text)] border-[var(--rv-pill-primary-bg)]'
                            : 'bg-[var(--rv-pill-secondary-bg)] text-[var(--rv-text-muted)] border-[var(--rv-card-border)]'
                        }`}
                      >
                        {isActive ? <Zap className="w-3.5 h-3.5 text-amber-500 fill-amber-500" /> : <Clock className="w-3.5 h-3.5" />}
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="text-[13px] font-semibold text-[var(--rv-text)]">{skill.name}</h3>
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9.5px] font-medium ${
                              isActive
                                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                : 'bg-[var(--rv-pill-secondary-bg)] text-[var(--rv-text-muted)] border border-[var(--rv-card-border)]'
                            }`}
                          >
                            {isActive ? 'Active' : 'Paused'}
                          </span>
                        </div>

                        <p className="text-[11.5px] text-[var(--rv-text-muted)] mt-0.5 leading-relaxed">{skill.summary}</p>

                        {/* Metadata row */}
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-[10.5px] text-[var(--rv-text-faint)]">
                          <span className="flex items-center gap-1 font-mono text-[10px] bg-[var(--rv-pill-secondary-bg)] px-1.5 py-0.5 rounded border border-[var(--rv-card-border)] text-[var(--rv-text-muted)]">
                            <Clock className="w-3 h-3 text-[var(--rv-text-muted)]" />
                            {skill.trigger}
                          </span>
                          <span>
                            Executions:{' '}
                            <strong className="text-[var(--rv-text)] font-medium">{skill.actionCount}</strong>
                          </span>
                          {skill.lastRun && (
                            <span>
                              Last executed: <span className="text-[var(--rv-text-muted)]">{skill.lastRun}</span>
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 shrink-0 pt-0.5">
                      {/* Pill toggle switch */}
                      <button
                        type="button"
                        role="switch"
                        aria-checked={isActive}
                        onClick={() => dispatch(toggleCustomSkill(skill.id))}
                        className={`relative inline-flex h-4.5 w-8 shrink-0 cursor-pointer rounded-full border border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                          isActive ? 'bg-[var(--rv-pill-primary-bg)]' : 'bg-[var(--rv-pill-secondary-bg)] border border-[var(--rv-card-border)]'
                        }`}
                      >
                        <span
                          className={`pointer-events-none inline-block h-3.5 w-3.5 transform rounded-full shadow-xs ring-0 transition duration-200 ease-in-out mt-[1px] ml-[1px] ${
                            isActive ? 'translate-x-3.5 bg-[var(--rv-pill-primary-text)]' : 'translate-x-0 bg-[var(--rv-text-muted)]'
                          }`}
                        />
                      </button>

                      <button
                        type="button"
                        onClick={() => dispatch(deleteCustomSkill(skill.id))}
                        className="p-1 text-[var(--rv-text-faint)] hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors cursor-pointer"
                        title="Delete skill"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Add Skill Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-[var(--rv-card-bg)] border border-[var(--rv-card-border)] rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 text-[var(--rv-text)]">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-[var(--rv-card-border)]">
              <div>
                <h3 className="text-[13.5px] font-semibold text-[var(--rv-text)]">Create New Skill or Task</h3>
                <p className="text-[11px] text-[var(--rv-text-muted)] mt-0.5">
                  Define an autonomous workflow or AI task running across your revenue pipeline.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-1 text-[var(--rv-text-muted)] hover:text-[var(--rv-text)] rounded-lg hover:bg-[var(--rv-pill-secondary-bg)] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleSaveSkill} className="p-5 space-y-3.5">
              <div>
                <label className="block text-[11px] font-medium text-[var(--rv-text-muted)] mb-1">
                  Skill Name <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Inbound Deal Escalation Monitor"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="rv-input text-[12px] w-full"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-[var(--rv-text-muted)] mb-1">Summary</label>
                <input
                  type="text"
                  placeholder="Brief 1-sentence description of what this skill does"
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  className="rv-input text-[12px] w-full"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-[var(--rv-text-muted)] mb-1">Trigger Cadence</label>
                <select
                  value={trigger}
                  onChange={(e) => setTrigger(e.target.value)}
                  className="rv-input text-[12px] w-full bg-[var(--rv-input-bg)] cursor-pointer"
                >
                  <option value="Every Monday at 8:00 AM">Every Monday at 8:00 AM (Weekly Brief)</option>
                  <option value="Daily at 9:00 AM">Daily at 9:00 AM (Morning Digest)</option>
                  <option value="On inbound email or ticket">On inbound email or ticket (Real-time)</option>
                  <option value="On call recording upload">On customer call recording upload</option>
                  <option value="When health score drops < 60">When health score drops below 60</option>
                  <option value="45 days before contract renewal">45 days before contract renewal</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-[var(--rv-text-muted)] mb-1">Instructions & Scope</label>
                <textarea
                  rows={3}
                  placeholder="Tell Revenact exactly how to process data and what action or summary to produce..."
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                  className="rv-input text-[12px] w-full resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2.5 border-t border-[var(--rv-card-border)]">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="rv-pill-secondary text-[11.5px] cursor-pointer"
                >
                  Cancel
                </button>
                <button type="submit" className="rv-pill-primary text-[11.5px] cursor-pointer">
                  Create Skill
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
