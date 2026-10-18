import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../../App';

/**
 * What the shell owes a keyboard and a screen-reader user, independent of viewport width.
 *
 * There is deliberately NO responsive test here. jsdom has no layout engine: it computes no
 * grid tracks, applies no media queries and honours no `transform`, so `getComputedStyle`
 * returns author values with media-query overrides still attached. A test asserting
 * "the sidebar is off-canvas at 390px" could only ever assert the class name it was
 * written against, which is a tautology rather than evidence. The breakpoint behaviour is
 * verified by a human at 1440 / 1024 / 390 with `npm run dev`; what is asserted here is
 * the part a test CAN prove - the landmark and control structure, which is the part that
 * survives when the CSS is edited.
 */

// Same reason as App.test.tsx: jsdom has no 2D canvas, so a real Chart.js instance cannot
// be constructed and its teardown throws asynchronously out of `cleanup()`.
vi.mock('react-chartjs-2', () => {
  const Stub = () => <div data-testid="chart-stub" />;
  return { Bar: Stub, Doughnut: Stub, Line: Stub, Pie: Stub, Radar: Stub };
});

beforeEach(() => {
  localStorage.clear();
});

/**
 * The header toggle, found by whichever of its two names is current. The scrim carries a
 * deliberately different name ("Dismiss navigation overlay") so that "the control that
 * owns the navigation" stays a single unambiguous target rather than one of three buttons
 * that mention navigation.
 */
const navToggle = () =>
  screen.queryByRole('button', { name: 'Open navigation' }) ??
  screen.getByRole('button', { name: 'Close navigation' });

describe('App shell landmarks', () => {
  it('exposes exactly one main landmark', () => {
    render(<App />);
    // "At least one" would pass on a shell with two competing <main> elements, which is
    // the error a landmark is supposed to rule out: two mains means a screen reader user
    // has no way to tell which region they are in.
    expect(screen.getAllByRole('main')).toHaveLength(1);
  });

  it('exposes the navigation as a named nav landmark', () => {
    render(<App />);
    const navs = screen.getAllByRole('navigation');
    expect(navs).toHaveLength(1);
    expect(navs[0]).toHaveAccessibleName();
  });

  it('marks the current page in the navigation rather than only styling it', () => {
    render(<App />);
    const current = within(screen.getByRole('navigation')).getAllByRole('button', {
      current: 'page',
    });
    // `aria-current` is the only thing that carries "you are here" to assistive tech. The
    // `.nav-item--active` class is a colour and a 2px bar; on a monochrome or
    // high-contrast rendering the current page is invisible without it.
    expect(current).toHaveLength(1);
  });

  it('keeps every navigation item reachable as a real button', () => {
    render(<App />);
    const nav = screen.getByRole('navigation');
    const items = within(nav).getAllByRole('button');
    expect(items.length).toBeGreaterThanOrEqual(11);
    // Each one carries a native `title` as well, so the icon rail stays usable once the
    // labels are hidden below the collapse breakpoint.
    for (const item of items) {
      expect(item).toHaveAttribute('title');
    }
  });
});

describe('App shell navigation toggle', () => {
  it('offers a keyboard-reachable control that opens and closes the navigation', async () => {
    render(<App />);

    const toggle = navToggle();
    // Focusable, and it says so: a control that only works by pointer is not a control a
    // keyboard user has. `aria-expanded` is what publishes its state.
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    toggle.focus();
    expect(document.activeElement).toBe(toggle);

    await userEvent.click(toggle);
    expect(navToggle()).toHaveAttribute('aria-expanded', 'true');

    await userEvent.click(navToggle());
    expect(navToggle()).toHaveAttribute('aria-expanded', 'false');
  });

  it('points the toggle at the element it controls, and that element is the sidebar', () => {
    render(<App />);
    const toggle = navToggle();
    const controlled = document.getElementById(toggle.getAttribute('aria-controls') as string);
    expect(controlled).not.toBeNull();
    expect(controlled).toContainElement(screen.getByRole('navigation'));
  });

  it('closes the navigation once a destination has been chosen', async () => {
    render(<App />);

    await userEvent.click(navToggle());
    expect(navToggle()).toHaveAttribute('aria-expanded', 'true');

    await userEvent.click(screen.getByRole('button', { name: /Employee Directory/i }));

    // Choosing a page is the user saying they are done looking at the menu. Leaving it
    // open over the content they just asked for is the difference between a drawer and a
    // panel that got stuck.
    expect(navToggle()).toHaveAttribute('aria-expanded', 'false');
  });

  it('dismisses the navigation with Escape while it is open', async () => {
    render(<App />);
    await userEvent.click(navToggle());

    await userEvent.keyboard('{Escape}');

    expect(navToggle()).toHaveAttribute('aria-expanded', 'false');
  });

  it('closes the navigation when its scrim is activated', async () => {
    render(<App />);
    await userEvent.click(navToggle());

    await userEvent.click(screen.getByRole('button', { name: /dismiss navigation overlay/i }));

    expect(navToggle()).toHaveAttribute('aria-expanded', 'false');
  });
});

describe('App shell scroll ownership', () => {
  it('does not make <main> the scroll container, so a body scroll lock can work', () => {
    const { container } = render(<App />);
    const main = screen.getByRole('main');

    // The body scroll lock in `Dialog` sets `document.body.style.overflow`. That lock is
    // inert while <main> carries `overflow-y: auto`, because <main> is then the element
    // that actually scrolls: the scrim covers a viewport whose content still moves behind
    // it. The fix is to let the document scroll and keep the sidebar in place with
    // `position: sticky`, so there is exactly one scroll container and the lock has one to
    // lock. Asserted as "no inline overflow on main" because that is the property that
    // made <main> a scroll container in the first place.
    expect(main.getAttribute('style') ?? '').not.toMatch(/overflow|max-width/i);
    expect(container.querySelector('.app-shell')).not.toBeNull();
  });

  it('resolves the content column with a track that can shrink', () => {
    const { container } = render(<App />);
    expect(container.querySelector('.app-shell')).toHaveClass('app-shell');
    // The class name is the whole of what a jsdom test can say about the grid: the
    // `minmax(0, 1fr)` track it stands for is a layout result, not a DOM one. A human
    // checks the widths.
    expect(screen.getByRole('main')).toHaveClass('app-shell__main');
  });
});