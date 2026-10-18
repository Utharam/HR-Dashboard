import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { GuidesSection } from '../GuidesSection';

const noop = () => {};

/**
 * jsdom ships no `navigator.clipboard`, which makes it the honest stand-in for the case
 * that actually breaks in the field: any origin the browser considers insecure - plain http
 * on an intranet, some corporate proxies - has no `clipboard` object at all.
 */
const installClipboard = (writeText: unknown) => {
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true, writable: true });
};

afterEach(() => {
  Reflect.deleteProperty(navigator, 'clipboard');
  vi.useRealTimers();
});

/** The 18 "Quick Copy" buttons all share one name, so the first is addressed by position. */
const copyButton = () => screen.getAllByRole('button', { name: 'Copy' })[0];
const copiedButton = () => screen.queryByRole('button', { name: 'Copied' });

/**
 * A click handler that throws is caught by React and re-reported on `window` rather than
 * propagating to the caller, so "did the click throw" is only answerable by listening for
 * that report. Asserting the click returned normally would pass with the bug still present.
 */
const captureUncaughtErrors = async (click: () => void) => {
  const seen: string[] = [];
  const onError = (e: Event) => seen.push((e as ErrorEvent).message);
  window.addEventListener('error', onError);
  try {
    await act(async () => {
      click();
      await Promise.resolve();
    });
  } finally {
    window.removeEventListener('error', onError);
  }
  return seen;
};

/** Fake time only advances cleanly when React is flushed inside `act`. */
const tick = async (ms: number) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};

const click = async (el: Element) => {
  await act(async () => {
    fireEvent.click(el);
    await Promise.resolve();
  });
};

const renderExcelGuide = () => render(<GuidesSection initialGuide="excel" onNavigateTab={noop} />);

describe('GuidesSection clipboard', () => {
  it('does not raise an uncaught error when there is no clipboard API, as on any non-secure origin', async () => {
    renderExcelGuide();
    expect(navigator.clipboard).toBeUndefined();

    // `writeText` used to be called unconditionally. It is not a rejected promise but a
    // synchronous TypeError out of the click handler, which React re-reported as an uncaught
    // error and which in the field kills the interaction and litters the console.
    const uncaught = await captureUncaughtErrors(() => fireEvent.click(copyButton()));

    expect(uncaught).toEqual([]);
  });

  it('confirms the copy once the write resolves', async () => {
    installClipboard(vi.fn().mockResolvedValue(undefined));
    renderExcelGuide();

    await click(copyButton());

    await waitFor(() => expect(copiedButton()).toBeInTheDocument());
  });

  it('does not claim the text was copied when the clipboard refused', async () => {
    installClipboard(vi.fn().mockRejectedValue(new Error('denied')));
    renderExcelGuide();

    await click(copyButton());
    await act(async () => {
      await Promise.resolve();
    });

    // The guide text is on screen either way; saying "Copied" when nothing was written
    // sends the user off to paste something stale.
    expect(copiedButton()).toBeNull();
  });

  it('keeps the confirmation for two seconds after the LAST of several rapid clicks', async () => {
    vi.useFakeTimers();
    installClipboard(vi.fn().mockResolvedValue(undefined));
    renderExcelGuide();

    await click(copyButton());
    await tick(1500);
    await click(copyButton());

    // Both clicks target the same button, so the second sets the same value and re-renders
    // nothing. The confirmation must still be up 600ms after the LAST click.
    await tick(600);
    expect(copiedButton()).toBeInTheDocument();

    await tick(1400); // 2s after the last click
    expect(copiedButton()).toBeNull();
  });

  it('releases the pending timer when the section goes away', async () => {
    vi.useFakeTimers();
    installClipboard(vi.fn().mockResolvedValue(undefined));
    const { unmount } = renderExcelGuide();

    await click(copyButton());
    const clearSpy = vi.spyOn(globalThis, 'clearTimeout');
    unmount();

    expect(clearSpy).toHaveBeenCalled();
    clearSpy.mockRestore();
  });
});
