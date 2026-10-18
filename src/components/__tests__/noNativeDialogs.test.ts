import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * A grep is the only honest way to keep native blocking dialogs from creeping back.
 *
 * `window.alert` and `window.confirm` block the main thread, cannot be themed, cannot say
 * what is about to be lost, and are invisible to a screen-reader user until focus returns.
 * Every one of them was replaced by `Callout` or `ConfirmDialog`.
 *
 * The pattern deliberately requires the bare, unqualified call: a preceding `.` or a word
 * character disqualifies the match, so `window.confirm(...)` or `obj.onConfirm(...)` do not
 * trip it. This file is scanned like every other source file, so its own prose must not
 * spell either call either.
 */
const BARE_BLOCKING_DIALOG = /(^|[^.\w])(alert|confirm)\s*\(/;

describe('no native blocking dialogs', () => {
  it('uses no bare blocking dialog anywhere in src', () => {
    const dir = join(process.cwd(), 'src');
    const offenders: string[] = [];

    for (const entry of readdirSync(dir, { recursive: true })) {
      const file = String(entry);
      if (!file.endsWith('.ts') && !file.endsWith('.tsx')) continue;
      if (BARE_BLOCKING_DIALOG.test(readFileSync(join(dir, file), 'utf8'))) offenders.push(file);
    }

    expect(offenders).toEqual([]);
  });
});
