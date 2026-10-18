import type { ReactNode } from 'react';
import { GitBranch, LifeBuoy, MessageCircle, PenTool, Users, Video, Webhook } from 'lucide-react';
import type { Provider } from '../../features/connectors/connectorsSlice';

// The brands' own marks, in their own colours: the one place in Settings
// that may hold hex (named in settings.houseRules.test.ts). Systems with no
// mark here take a neutral Lucide icon (spec §7: decorative icons are
// never tinted).

const ICON = 'h-5 w-5 text-ink-muted';

const GMAIL_SVG = (
  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" aria-hidden="true">
    <path d="M22 6C22 4.9 21.1 4 20 4H4C2.9 4 2 4.9 2 6V18C2 19.1 2.9 20 4 20H20C21.1 20 22 19.1 22 18V6ZM20 6L12 11L4 6H20ZM20 18H4V8L12 13L20 8V18Z" fill="#EA4335"/>
  </svg>
);

const SALESFORCE_SVG = (
  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" aria-hidden="true">
    <path d="M16.963 8.16C16.897 8.157 16.837 8.163 16.772 8.17C16.591 6.305 14.896 4.869 12.872 4.869C11.332 4.869 9.972 5.753 9.324 7.026C9.079 6.892 8.802 6.819 8.51 6.819C7.456 6.819 6.578 7.568 6.354 8.536C4.846 8.784 3.737 10.046 3.737 11.597C3.737 13.268 5.167 14.629 6.914 14.629H16.845C18.667 14.629 20.145 13.197 20.145 11.439C20.145 9.721 18.73 8.32 16.963 8.16Z" fill="#00A1E0"/>
  </svg>
);

const SLACK_SVG = (
  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" aria-hidden="true">
    <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.528 2.528 0 0 1 2.521-2.523 2.528 2.528 0 0 1 2.521 2.523v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313z" fill="#E01E5A"/>
    <path d="M8.835 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.835 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.835zM8.835 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.313z" fill="#36C5F0"/>
    <path d="M18.958 8.835a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.835a2.528 2.528 0 0 1-2.52 2.521h-2.522V8.835zM17.687 8.835a2.528 2.528 0 0 1-2.521 2.521 2.528 2.528 0 0 1-2.522-2.521V2.522A2.528 2.528 0 0 1 15.166 0a2.528 2.528 0 0 1 2.521 2.522v6.313z" fill="#2EB67D"/>
    <path d="M15.165 18.958a2.528 2.528 0 0 1 2.522 2.522A2.528 2.528 0 0 1 15.165 24a2.528 2.528 0 0 1-2.522-2.52v-2.522h2.522zM15.165 17.687a2.528 2.528 0 0 1-2.522-2.522 2.528 2.528 0 0 1 2.522-2.522h6.313A2.528 2.528 0 0 1 24 15.166a2.528 2.528 0 0 1-2.52 2.521h-6.315z" fill="#ECB22E"/>
  </svg>
);

const JIRA_SVG = (
  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" aria-hidden="true">
    <path d="M21.75 3C22.9926 3 24 4.00736 24 5.25V18.75C24 19.9926 22.9926 21 21.75 21H2.25C1.00736 21 0 19.9926 0 18.75V5.25C0 4.00736 1.00736 3 2.25 3H21.75Z" fill="#0052CC"/>
    <path d="M11 7H13.5C14.8807 7 16 8.11929 16 9.5V17H13.5C12.1193 17 11 15.8807 11 14.5V7Z" fill="white"/>
    <path d="M6 10.5H8.5C9.88071 10.5 11 11.6193 11 13V17H8.5C7.11929 17 6 15.8807 6 14.5V10.5Z" fill="white"/>
  </svg>
);

const ZENDESK_SVG = (
  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-ink" aria-hidden="true">
    <path d="M12.91 16.59L17.5 21H12.91V16.59ZM21 16.59H16.41L11.82 21H21V16.59ZM12.91 3V7.41L17.5 3H12.91ZM21 3H16.41L11.82 7.41H21V3ZM3 16.59V21H7.59L3 16.59ZM11.09 16.59H6.5L11.09 21V16.59ZM3 3V7.41V3ZM11.09 3V7.41H6.5L11.09 3ZM3 7.41H7.59L3 12V7.41ZM11.09 7.41V12H6.5L11.09 7.41Z" fill="currentColor"/>
  </svg>
);

const HUBSPOT_SVG = (
  <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" aria-hidden="true">
    <path d="M24 10.457v3.085c0 .416-.339.755-.755.755h-2.186a9.074 9.074 0 0 1-1.391 3.327l1.527 1.527a.754.754 0 0 1 0 1.066l-2.181 2.181a.754.754 0 0 1-1.066 0l-1.527-1.527a9.074 9.074 0 0 1-3.327 1.391v2.186c0 .416-.339.755-.755.755h-3.085c-.416 0-.755-.339-.755-.755v-2.186a9.071 9.071 0 0 1-3.328-1.392l-1.526 1.528a.755.755 0 0 1-1.066 0L.498 19.617a.754.754 0 0 1 0-1.066l1.527-1.527A9.072 9.072 0 0 1 .634 13.7H-1.55a.755.755 0 0 1-.755-.755v-3.085c0-.416.339-.755.755-.755h2.186A9.074 9.074 0 0 1 2.027 5.78L.5 4.253a.754.754 0 0 1 0-1.066L2.681 1.006a.754.754 0 0 1 1.066 0l1.527 1.527A9.074 9.074 0 0 1 8.598 1.144V-1.04c0-.416.339-.755.755-.755h3.085c.416 0 .755.339.755.755v2.186a9.072 9.072 0 0 1 3.327 1.391l1.527-1.527a.754.754 0 0 1 1.066 0l2.181 2.181a.754.754 0 0 1 0 1.066L19.767 5.78a9.074 9.074 0 0 1 1.391 3.328h2.186c.417 0 .755.338.755.755zm-11.954 6.74c2.817 0 5.1-2.283 5.1-5.1 0-2.817-2.283-5.1-5.1-5.1-2.817 0-5.1 2.283-5.1 5.1 0 2.817 2.283 5.1 5.1 5.1z" fill="#FF7A59"/>
  </svg>
);

export const PROVIDER_LOGOS: Record<Provider, ReactNode> = {
  salesforce: SALESFORCE_SVG,
  hubspot: HUBSPOT_SVG,
  zendesk: ZENDESK_SVG,
  freshdesk: <LifeBuoy className={ICON} aria-hidden="true" />,
  intercom: <MessageCircle className={ICON} aria-hidden="true" />,
  webhook: <Webhook className={ICON} aria-hidden="true" />,
  jira: JIRA_SVG,
  github: <GitBranch className={ICON} aria-hidden="true" />,
  figma: <PenTool className={ICON} aria-hidden="true" />,
  gmail: GMAIL_SVG,
  slack: SLACK_SVG,
  ms_teams: <Users className={ICON} aria-hidden="true" />,
  zoom: <Video className={ICON} aria-hidden="true" />,
};
