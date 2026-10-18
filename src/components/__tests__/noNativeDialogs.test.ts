import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * A grep is the only honest way to keep native blocking dialogs from creeping back.
 *
 * These three globals freeze the main thread, cannot be themed, cannot say what is about to
 * be lost, and tell a screen-reader user nothing until focus comes back. Every one of them
 * in this codebase was replaced by `Callout` or `ConfirmDialog`.
 *
 * The leading class is `[^\w]` and NOT `[^.\w]`. An earlier version of this file excluded a
 * preceding dot so that a qualified call would not trip the guard - which meant
 * `window.alert`, `globalThis.alert`, `self.confirm` and every other spelling of the same
 * blocking dialog walked straight past it. A qualified call is not a different defect; it
 * is the same defect with three more characters in front of it. A preceding WORD character
 * still disqualifies the match, which is what keeps a prop or a callback of the same name
 * out of the net.
 *
 * This file is scanned like every other source file in `src`, so its own prose and its own
 * fixtures must not spell these calls either. The matrix below therefore assembles its
 * subject lines at runtime from a qualifier and a name rather than writing them out.
 */
const BLOCKING_DIALOG_CALL = /(^|[^\w])(alert|confirm|prompt)\s*\(/;

const SUBJECT = (qualifier: string, name: string) => `${qualifier}${name}(1)`;

/**
 * The matrix the regex has to satisfy, and the reason it exists: a guard with no
 * positive-and-negative cases is a guard nobody has checked still guards anything.
 *
 * `flagged` is "does the pattern catch this line", not "is this line actually a defect".
 * The last two rows are therefore `true` despite not being defects: a property call named
 * after one of these globals is indistinguishable from the global by pattern alone. That
 * is the trade this guard makes, and it is recorded here rather than left as a surprise -
 * a false positive is a red test naming one file, fixed in seconds by renaming, while a
 * false negative is a user staring at an unthemed OS dialog that this batch spent its
 * effort removing. No property named after these three exists anywhere in `src` today.
 */
const MATRIX: [string, string, boolean, string][] = [
  ['', 'alert', true, 'the bare global call'],
  ['window.', 'alert', true, 'the same global reached through window'],
  ['globalThis.', 'confirm', true, 'the same global reached through globalThis'],
  ['self.', 'alert', true, 'the same global reached through self'],
  ['', 'confirm', true, 'the bare global call'],
  ['window.', 'confirm', true, 'the same global reached through window'],
  ['', 'prompt', true, 'the bare global call'],
  ['window.', 'prompt', true, 'the same global reached through window'],
  ['  ', 'alert', true, 'indented call at the start of a statement'],
  ['if (', 'confirm', true, 'call inside a condition'],
  ['', 'onConfirm', false, 'a callback prop - the name only starts with the blocked word'],
  ['obj.', 'onConfirm', false, 'a callback method - same reason'],
  ['', 'myAlert', false, 'an identifier that merely ends with the blocked word'],
  ['obj.', 'confirm', true, 'ACCEPTED FALSE POSITIVE: a property call, indistinguishable from the global'],
  ['obj.', 'prompt', true, 'ACCEPTED FALSE POSITIVE: a property call, indistinguishable from the global'],
];

describe('no native blocking dialogs', () => {
  it.each(MATRIX)(
    '"%s%s()" flagged=%s - %s',
    (qualifier, name, flagged, _why) => {
      expect(BLOCKING_DIALOG_CALL.test(SUBJECT(qualifier, name))).toBe(flagged);
    },
  );

  it('uses no bare blocking dialog anywhere in src', () => {
    const dir = join(process.cwd(), 'src');
    const offenders: string[] = [];

    for (const entry of readdirSync(dir, { recursive: true })) {
      const file = String(entry);
      if (!file.endsWith('.ts') && !file.endsWith('.tsx')) continue;
      if (BLOCKING_DIALOG_CALL.test(readFileSync(join(dir, file), 'utf8'))) offenders.push(file);
    }

    expect(offenders).toEqual([]);
  });
});
