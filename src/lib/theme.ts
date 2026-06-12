/**
 * System theme sync.
 *
 * The stylesheet defines light defaults on :root and a `.dark` override. Nothing
 * was ever toggling that class, so the app stayed light regardless of the OS
 * setting. This applies `.dark` on <html> to match the OS color scheme and keeps
 * it in sync if the user flips their system theme while the app is open.
 */
const DARK_QUERY = '(prefers-color-scheme: dark)';

const apply = (isDark: boolean) => {
  document.documentElement.classList.toggle('dark', isDark);
};

/** Apply the current OS theme and subscribe to changes. Call once at startup. */
export const initSystemTheme = () => {
  const mql = window.matchMedia(DARK_QUERY);
  apply(mql.matches);
  // Safari <14 only supports the deprecated addListener signature.
  if (typeof mql.addEventListener === 'function') {
    mql.addEventListener('change', (e) => apply(e.matches));
  } else if (typeof mql.addListener === 'function') {
    mql.addListener((e) => apply(e.matches));
  }
};
