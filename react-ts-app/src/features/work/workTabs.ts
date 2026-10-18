// Which paths wear the Work bar (kept free of React for its own test).

/** Every Work route wears the Work bar; `/workspace` would not. */
export function isWorkPath(pathname: string): boolean {
  return /^\/work(\/|$)/.test(pathname);
}
