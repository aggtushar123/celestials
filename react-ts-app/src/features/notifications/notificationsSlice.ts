import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { Notification } from './types';

// Plain createSlice, same convention as features/tasks/tasksSlice.ts —
// this app's real notification state is small enough (one person's own
// short list) that a fetch-thunk-per-action shape (customersSlice.ts's
// own convention) would be overkill; DashboardLayout.tsx dispatches
// these plain actions itself after each real API/WebSocket event.

interface NotificationsState {
  items: Notification[];
}

const initialState: NotificationsState = {
  items: [],
};

export const notificationsSlice = createSlice({
  name: 'notifications',
  initialState,
  reducers: {
    // The initial real GET /notifications/ fetch, or a full refresh.
    notificationsReceived: (state, action: PayloadAction<Notification[]>) => {
      state.items = action.payload;
    },

    // A single new one pushed live over the real WebSocket — prepended
    // (newest-first, matching the backend's own default ordering), and
    // de-duplicated by id in case a reconnect ever redelivers one this
    // tab already has.
    notificationAdded: (state, action: PayloadAction<Notification>) => {
      if (state.items.some((n) => n.id === action.payload.id)) return;
      state.items.unshift(action.payload);
    },

    notificationRead: (state, action: PayloadAction<{ id: number }>) => {
      const notification = state.items.find((n) => n.id === action.payload.id);
      if (notification) notification.is_read = true;
    },

    allRead: (state) => {
      state.items.forEach((n) => {
        n.is_read = true;
      });
    },
  },
});

export const { notificationsReceived, notificationAdded, notificationRead, allRead } =
  notificationsSlice.actions;

export default notificationsSlice.reducer;
