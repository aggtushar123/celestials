import { type TypedUseSelectorHook, useDispatch, useSelector } from 'react-redux';
import type { RootState, AppDispatch } from './store';
import type { Capability, CurrencyCode } from './features/auth/authSlice';

export const useAppDispatch = () => useDispatch<AppDispatch>();
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;

// Same '?? USD' fallback CurrencySection.tsx itself uses — the org's billing
// currency for anything rendering money (see formatMoney/formatCompactMoney
// in features/customers/formatters.ts, which every caller of this hook
// feeds into).
export const useOrgCurrency = (): CurrencyCode =>
  useAppSelector((state) => state.auth.user?.organisation.currency ?? 'USD');

// Does the logged-in user hold this capability? The single question
// every gated bit of UI asks, mirroring the backend's own
// `User.has_capability` (see services/accounts/permissions.py — the
// server enforces this independently, so this hook only decides what to
// *show*, never what's actually allowed).
//
// Replaced a scattering of `user.role === 'admin'` checks: roles are
// org-defined now, so which role you hold says nothing on its own —
// what it grants is the real question.
export const useCapability = (capability: Capability): boolean =>
  useAppSelector((state) => state.auth.user?.permissions?.includes(capability) ?? false);

// Platform access is two things at once: being Revenact staff (a superuser,
// belonging to no tenant) and having signed in with a second factor in
// *this* session. The backend's IsPlatformStaff enforces both; this only
// decides what to show, and which of the two is missing when it is not.
// Three primitive selectors rather than one returning an object, so
// react-redux's reference check sees stable values and never re-renders
// for nothing.
export const usePlatformAccess = () => {
  const isStaff = useAppSelector((state) => state.auth.user?.is_superuser === true);
  const mfaVerified = useAppSelector((state) => state.auth.mfaVerified === true);
  const mfaEnrolled = useAppSelector((state) => state.auth.user?.mfa_enrolled === true);
  return { isStaff, mfaVerified, mfaEnrolled };
};
