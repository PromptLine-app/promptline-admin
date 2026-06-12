import { describe, it, expect, beforeEach, vi } from 'vitest';
import { initSystemTheme } from './theme';

// jsdom has no matchMedia; provide a controllable fake that also lets us fire
// a "change" event to simulate the user flipping their OS theme.
function mockMatchMedia(matches: boolean) {
  let handler: ((e: { matches: boolean }) => void) | null = null;
  const mql = {
    matches,
    media: '(prefers-color-scheme: dark)',
    addEventListener: (_: string, h: (e: { matches: boolean }) => void) => {
      handler = h;
    },
    removeEventListener: vi.fn(),
    addListener: (h: (e: { matches: boolean }) => void) => {
      handler = h;
    },
    removeListener: vi.fn(),
    onchange: null,
    dispatchEvent: vi.fn(),
  };
  window.matchMedia = vi.fn().mockReturnValue(mql) as unknown as typeof window.matchMedia;
  return { fire: (m: boolean) => handler?.({ matches: m }) };
}

beforeEach(() => {
  document.documentElement.classList.remove('dark');
});

describe('initSystemTheme', () => {
  it('applies .dark when the OS prefers dark', () => {
    mockMatchMedia(true);
    initSystemTheme();
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('leaves light mode when the OS prefers light', () => {
    mockMatchMedia(false);
    initSystemTheme();
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('reacts live when the OS theme changes', () => {
    const { fire } = mockMatchMedia(false);
    initSystemTheme();
    expect(document.documentElement.classList.contains('dark')).toBe(false);

    fire(true);
    expect(document.documentElement.classList.contains('dark')).toBe(true);

    fire(false);
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });
});
