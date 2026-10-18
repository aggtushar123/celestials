// Marks for the systems Revenact actually connects to.
//
// As with the sign-in buttons, third-party logos keep their own colours
// (brand terms forbid recolouring them) and are the one exception to the
// token rule. Everything Revenact draws around them uses tokens.
//
// The catalogue that uses these lives in sourceCatalog.tsx, kept apart so
// this file exports only components (fast refresh needs that).

export function GmailIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path fill="#4285F4" d="M1.5 5.5v13a2 2 0 0 0 2 2h2.5V9.5L1.5 5.5z" />
      <path fill="#34A853" d="M18 20.5h2.5a2 2 0 0 0 2-2v-13l-4.5 4v11z" />
      <path fill="#EA4335" d="M18 7.5l-6 4.5-6-4.5V5.5l6 4.5 6-4.5z" />
      <path fill="#FBBC05" d="M6 7.5v13H3.5a2 2 0 0 1-2-2v-11l4.5 3.5z" />
      <path fill="#C5221F" d="M18 5.5L12 10 6 5.5A2 2 0 0 1 8 3.5h8a2 2 0 0 1 2 2z" />
    </svg>
  );
}

export function OutlookIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <rect width="24" height="24" rx="5" fill="#0078D4" />
      <path
        fill="#FFFFFF"
        d="M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10zm0 8a3 3 0 1 1 0-6 3 3 0 0 1 0 6z"
      />
    </svg>
  );
}

export function SlackIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path fill="#E01E5A" d="M5.5 10.5a2 2 0 1 1-2-2h2v2zm1 0a2 2 0 1 1 2-2v2h-2z" />
      <path fill="#36C5F0" d="M10.5 5.5a2 2 0 1 1-2-2v2h2zm0 1a2 2 0 1 1-2 2h2v-2z" />
      <path fill="#2EB67D" d="M18.5 10.5a2 2 0 1 1 2 2h-2v-2zm-1 0a2 2 0 1 1-2 2v-2h2z" />
      <path fill="#ECB22E" d="M10.5 18.5a2 2 0 1 1 2 2v-2h-2zm0-1a2 2 0 1 1 2-2h-2v2z" />
    </svg>
  );
}

export function ZendeskIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path fill="#03363D" d="M11 5v9L3.5 5H11zM3.5 19a3.75 3.75 0 0 1 7.5 0H3.5z" />
      <path fill="#03363D" d="M13 19v-9l7.5 9H13zM20.5 5a3.75 3.75 0 0 1-7.5 0h7.5z" />
    </svg>
  );
}

export function JiraIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path fill="#2684FF" d="M12 1.5 21 10.5h-5.4A4.1 4.1 0 0 1 12 6.4V1.5z" />
      <path fill="#2684FF" d="M12 22.5 3 13.5h5.4A4.1 4.1 0 0 1 12 17.6v4.9z" />
      <path fill="#0052CC" d="M12 6.4a4.1 4.1 0 0 0 3.6 4.1H21L12 1.5v4.9z" opacity=".7" />
      <path fill="#0052CC" d="M12 17.6a4.1 4.1 0 0 0-3.6-4.1H3l9 9v-4.9z" opacity=".7" />
    </svg>
  );
}

export function FreshdeskIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <rect width="24" height="24" rx="6" fill="#25C16F" />
      <path
        fill="#FFFFFF"
        d="M12 5.5a6.5 6.5 0 0 0-6.5 6.5v4.5a2 2 0 0 0 2 2H10v-6H7.5v-.5a4.5 4.5 0 0 1 9 0v.5H14v6h2.5a2 2 0 0 0 2-2V12A6.5 6.5 0 0 0 12 5.5z"
      />
    </svg>
  );
}
