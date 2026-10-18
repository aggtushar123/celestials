import { createContext, useContext } from 'react';

export interface ToastSpec {
  message: string;
  action?: { label: string; onAction: () => void };
}

export const TOAST_MS = 5000;

export const ToastContext = createContext<(toast: ToastSpec) => void>(() => {});

/** Show a toast; outside a ToastProvider it does nothing. */
export const useToast = () => useContext(ToastContext);
