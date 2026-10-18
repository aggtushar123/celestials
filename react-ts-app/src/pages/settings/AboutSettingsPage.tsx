import React from 'react';
import { ExternalLink, Sparkles, ShieldCheck, Heart } from 'lucide-react';

export const AboutSettingsPage: React.FC = () => {
  return (
    <div className="space-y-4 max-w-3xl">
      {/* Header */}
      <div>
        <h1 className="text-[14px] font-semibold text-[var(--rv-text)] tracking-tight">About</h1>
      </div>

      {/* Main Product Card */}
      <div className="rv-card p-5 bg-[var(--rv-card-bg)] shadow-xs">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-tr from-[#FF6B4A]/20 via-[#4A90E2]/20 to-[#50E3C2]/20 border border-[var(--rv-card-border)] flex items-center justify-center p-2 shadow-xs">
            {/* Ambient Logo Glyph */}
            <svg
              viewBox="0 0 32 32"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="w-full h-full text-[var(--rv-text)]"
            >
              <rect
                x="4"
                y="4"
                width="14"
                height="14"
                rx="4"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <rect
                x="14"
                y="14"
                width="14"
                height="14"
                rx="4"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="opacity-70"
              />
            </svg>
          </div>

          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-[14px] font-semibold text-[var(--rv-text)]">Revenact</h2>
              <span className="inline-flex items-center gap-1 text-[10px] font-medium bg-[var(--rv-pill-secondary-bg)] text-[var(--rv-text-muted)] border border-[var(--rv-card-border)] px-2 py-0.5 rounded-full">
                <Sparkles className="w-2.5 h-2.5 text-amber-400" />
                Revenact Engine
              </span>
            </div>
            <p className="text-[11px] text-[var(--rv-text-muted)] mt-0.5 font-mono">Version 1.0.0-beta</p>
          </div>
        </div>

        <p className="text-[11.5px] text-[var(--rv-text-muted)] mt-3.5 leading-relaxed">
          Your AI-powered revenue intelligence and customer retention hub that unifies emails, pipeline metrics, and customer meetings in one place.
        </p>

        <div className="mt-3.5 pt-3.5 border-t border-[var(--rv-card-border)] flex items-center gap-3 text-[10.5px] text-[var(--rv-text-faint)]">
          {/* Claims here must match `.soc2/CONTROL_MAP.md`. Revenact is not
              SOC 2 certified: 43 of 66 controls are met, MFA is a live
              exception (EX-001) and several gaps are open, so "Type II
              Certified" would be a false assertion on a compliance badge.
              Nor is anything end-to-end encrypted: credentials are encrypted
              at rest and traffic uses TLS, which is a different claim. */}
          <span className="flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5 text-success" aria-hidden="true" />
            Working towards SOC 2
          </span>
          <span aria-hidden="true">&middot;</span>
          <span>Credentials encrypted at rest, TLS in transit</span>
        </div>
      </div>

      {/* Resources Card */}
      <div className="rv-card bg-[var(--rv-card-bg)] overflow-hidden shadow-xs">
        <div className="px-5 py-3 border-b border-[var(--rv-card-border)]">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-[var(--rv-text-muted)]">Resources</h3>
        </div>

        <div className="divide-y divide-[var(--rv-card-border)]">
          <a
            href="https://docs.revenact.ai"
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-between px-5 py-3 text-[12px] text-[var(--rv-text-muted)] hover:text-[var(--rv-text)] hover:bg-[var(--rv-pill-secondary-bg)] transition-colors group"
          >
            <span className="font-medium">Documentation</span>
            <ExternalLink className="w-3 h-3 text-[var(--rv-text-faint)] group-hover:text-[var(--rv-text-muted)] transition-colors" />
          </a>

          <a
            href="https://revenact.ai/api"
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-between px-5 py-3 text-[12px] text-[var(--rv-text-muted)] hover:text-[var(--rv-text)] hover:bg-[var(--rv-pill-secondary-bg)] transition-colors group"
          >
            <span className="font-medium">Developer API & Webhooks</span>
            <ExternalLink className="w-3 h-3 text-[var(--rv-text-faint)] group-hover:text-[var(--rv-text-muted)] transition-colors" />
          </a>

          <a
            href="mailto:support@revenact.ai"
            className="flex items-center justify-between px-5 py-3 text-[12px] text-[var(--rv-text-muted)] hover:text-[var(--rv-text)] hover:bg-[var(--rv-pill-secondary-bg)] transition-colors group"
          >
            <span className="font-medium">Contact Support</span>
            <ExternalLink className="w-3 h-3 text-[var(--rv-text-faint)] group-hover:text-[var(--rv-text-muted)] transition-colors" />
          </a>
        </div>
      </div>

      {/* Legal Card */}
      <div className="rv-card bg-[var(--rv-card-bg)] overflow-hidden shadow-xs">
        <div className="px-5 py-3 border-b border-[var(--rv-card-border)]">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-[var(--rv-text-muted)]">Legal</h3>
        </div>

        <div className="divide-y divide-[var(--rv-card-border)]">
          <a
            href="https://revenact.ai/terms"
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-between px-5 py-3 text-[12px] text-[var(--rv-text-muted)] hover:text-[var(--rv-text)] hover:bg-[var(--rv-pill-secondary-bg)] transition-colors group"
          >
            <span className="font-medium">Terms of Service</span>
            <ExternalLink className="w-3 h-3 text-[var(--rv-text-faint)] group-hover:text-[var(--rv-text-muted)] transition-colors" />
          </a>

          <a
            href="https://revenact.ai/privacy"
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-between px-5 py-3 text-[12px] text-[var(--rv-text-muted)] hover:text-[var(--rv-text)] hover:bg-[var(--rv-pill-secondary-bg)] transition-colors group"
          >
            <span className="font-medium">Privacy Policy</span>
            <ExternalLink className="w-3 h-3 text-[var(--rv-text-faint)] group-hover:text-[var(--rv-text-muted)] transition-colors" />
          </a>

          <a
            href="https://revenact.ai/cookies"
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-between px-5 py-3 text-[12px] text-[var(--rv-text-muted)] hover:text-[var(--rv-text)] hover:bg-[var(--rv-pill-secondary-bg)] transition-colors group"
          >
            <span className="font-medium">Cookie Policy</span>
            <ExternalLink className="w-3 h-3 text-[var(--rv-text-faint)] group-hover:text-[var(--rv-text-muted)] transition-colors" />
          </a>
        </div>
      </div>

      {/* Footer note */}
      <div className="pt-1 text-center text-[10.5px] text-[var(--rv-text-faint)] flex items-center justify-center gap-1">
        <span>Crafted for high-performing revenue teams with</span>
        <Heart className="w-3 h-3 text-rose-400 fill-rose-400" />
      </div>
    </div>
  );
};
