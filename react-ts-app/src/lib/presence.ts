// Is anyone actually here? lib/socket.ts pauses its WebSockets when the
// answer is no, because on Cloud Run an open WebSocket keeps an instance
// billed for as long as it stays open: a tab left open overnight is a full
// night of compute. "Away" is either of:
//   - the tab hidden (another tab, minimised, the laptop locked) for
//     HIDDEN_AFTER_MS, or
//   - no pointer, key, wheel or touch input for IDLE_AFTER_MS.
// Coming back (the tab shown again, or any input) makes the person present
// at once. One set of listeners and timers is shared by every subscriber,
// attached with the first subscriber and removed with the last.

export const HIDDEN_AFTER_MS = 5 * 60 * 1000;
export const IDLE_AFTER_MS = 30 * 60 * 1000;

const ACTIVITY_EVENTS = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart'] as const;

type Listener = (present: boolean) => void;

const listeners = new Set<Listener>();
let present = true;
let idleTimer: number | null = null;
let hiddenTimer: number | null = null;
let armedAt = 0;
// pointermove fires many times a second; re-arming at most this often is plenty.
const REARM_EVERY_MS = 15 * 1000;

function setPresent(next: boolean) {
  if (next === present) return;
  present = next;
  for (const listener of [...listeners]) listener(present);
}

function armIdleTimer() {
  if (idleTimer !== null) window.clearTimeout(idleTimer);
  armedAt = Date.now();
  idleTimer = window.setTimeout(() => setPresent(false), IDLE_AFTER_MS);
}

function onActivity() {
  if (document.hidden) return;
  if (!present || Date.now() - armedAt >= REARM_EVERY_MS) armIdleTimer();
  setPresent(true);
}

function onVisibilityChange() {
  if (hiddenTimer !== null) {
    window.clearTimeout(hiddenTimer);
    hiddenTimer = null;
  }
  if (document.hidden) {
    hiddenTimer = window.setTimeout(() => setPresent(false), HIDDEN_AFTER_MS);
  } else {
    armIdleTimer();
    setPresent(true);
  }
}

function start() {
  present = true;
  for (const name of ACTIVITY_EVENTS) window.addEventListener(name, onActivity, { passive: true });
  document.addEventListener('visibilitychange', onVisibilityChange);
  armIdleTimer();
  if (document.hidden) onVisibilityChange();
}

function stop() {
  for (const name of ACTIVITY_EVENTS) window.removeEventListener(name, onActivity);
  document.removeEventListener('visibilitychange', onVisibilityChange);
  if (idleTimer !== null) window.clearTimeout(idleTimer);
  if (hiddenTimer !== null) window.clearTimeout(hiddenTimer);
  idleTimer = hiddenTimer = null;
  armedAt = 0;
  present = true;
}

/** Calls `listener(false)` when the person goes away and `listener(true)`
 * when they come back. Returns the unsubscribe. */
export function onPresenceChange(listener: Listener): () => void {
  if (listeners.size === 0) start();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) stop();
  };
}

export function isPresent(): boolean {
  return present;
}
