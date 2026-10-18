/**
 * Versioned, shape-validated local persistence.
 *
 * WHY THIS EXISTS
 *
 * The app used to read `localStorage` inline in two `useState` initialisers with
 * `try { return JSON.parse(saved) } catch {}`. That `catch` only ever covered a
 * SYNTAX error. Every payload that parses but has the wrong SHAPE was returned as
 * if it were data, and the throw happened later, inside a render:
 *
 *   - `{"employees":[{}]}`  -> `.filter is not a function`
 *   - `42`                  -> `.filter is not a function`
 *   - `[null,null]`         -> throws in `OverviewSection`
 *
 * The consequence was a permanent white screen. Because the throw happened during
 * render, the persistence effect never ran, so the bad payload was never
 * overwritten; and because the tree never mounted, the "Reset Demo State" sidebar
 * button that would have cleared it was unreachable. The only fix was for the user
 * to open devtools and clear site data by hand.
 *
 * The fix is the envelope. A payload is now `{ v, rows }`, and it is only accepted
 * when `v` matches `DATA_SCHEMA_VERSION` AND every row passes the caller's
 * validator. A legacy bare-array payload fails the version check and is discarded,
 * so the app recovers to seed data on its own. No migration path is attempted:
 * discarding to seed is the safe behaviour, and silently reshaping an unknown
 * payload is the class of bug this module exists to remove.
 *
 * EVERY storage call is inside a `try`. The old code called `getItem` OUTSIDE its
 * `try`, so a hardened browser profile (or Firefox private mode) that throws
 * `SecurityError` on access crashed during render — the same white screen, from a
 * different cause. Writes report failure instead of throwing: `setItem` was
 * unguarded, and the `QuotaExceededError` it raises at roughly 9,300 employees
 * (about 494 bytes per row against a 5 MB origin budget) propagated out of an
 * effect and unmounted the root — AFTER the user had been told their import
 * succeeded.
 */

/**
 * Bumped whenever the shape of a persisted payload changes. A payload written by a
 * different version is discarded, never coerced: the alternative is a migration
 * path guessing at field meanings, which is how fabricated rosters happen.
 */
export const DATA_SCHEMA_VERSION = 2

export type SaveResult = { ok: true } | { ok: false; reason: 'quota' | 'unavailable' }

interface Envelope<T> {
  v: number
  rows: T[]
}

/**
 * What happened to the payload that was found (or not found) at `key`.
 *
 * The three states exist because the previous boolean could not express the difference
 * that matters to a user. `recovered: true` was returned both when a stored payload was
 * unusable AND when the key had never existed, so any message built on it greeted every
 * first-time visitor with "your saved data could not be read" about data that never
 * existed.
 *
 * - `loaded`    a current envelope was found and every row passed the validator.
 * - `empty`     nothing usable was stored, and nothing was lost: either the key was
 *               absent, or a well-formed envelope held zero rows. The second case is a
 *               state a user creates on purpose by deleting everyone, and it must render
 *               as an empty dashboard rather than 200 demo staff.
 * - `recovered` something WAS stored and could not be used, so the fallback was
 *               substituted. This is the only state that warrants telling the user their
 *               saved data was discarded.
 */
export type LoadStatus = 'loaded' | 'empty' | 'recovered'

export interface LoadResult<T> {
  rows: T[]
  status: LoadStatus
}

/**
 * Reads the Web Storage API without assuming it exists or is reachable.
 *
 * Returns `null` for every failure mode — absent API, denied access, absent key —
 * so that callers have exactly one "no usable payload" case to handle. `getItem`
 * must stay INSIDE this `try`: that placement is the whole reason a hardened
 * profile no longer white-screens the app.
 */
function readItem(key: string): string | null {
  try {
    return globalThis.localStorage?.getItem(key) ?? null
  } catch {
    return null
  }
}

/**
 * Distinguishes "the origin is out of space" from "storage is unusable".
 *
 * The quota error is reported separately because it is the one a user can act on:
 * the data is correct and still in memory, it simply cannot be written down yet.
 * Collapsing it into a generic failure would hide the reason the app has stopped
* remembering anything.
 *
 * Only NAMES are consulted. The legacy numeric `code` branch that used to sit here
 * (`code === 22 || code === 1014`) was removed, deliberately:
 *
 *   - `22` was WebKit's `QUOTA_EXCEEDED_ERR`, but the same number is Firefox's
 *     `INVALID_STATE_ERR`, so the check was a guess that could misfire;
 *   - every browser capable of running React 19 throws a modern `DOMException`, whose
 *     `code` is always `0`, so the branch was unreachable for its intended target;
 *   - and a false positive is the expensive direction here: an unrelated failure reported
 *     as `quota` tells the user to free up space they do not need to free.
 *
 * `NS_ERROR_DOM_QUOTA_REACHED` stays because it is a NAME, it is unambiguous, and Firefox
 * really did throw it. Both accepted names are pinned by tests.
 */
function classifyWriteError(err: unknown): 'quota' | 'unavailable' {
  const name = typeof err === 'object' && err !== null ? (err as { name?: unknown }).name : undefined
  if (name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED') {
    return 'quota'
  }
  return 'unavailable'
}

/**
 * Loads a persisted row array, substituting `fallback` unless the payload is
 * provably safe to hand to the rest of the app.
 *
 * A payload is accepted only when ALL of the following hold:
 *   1. the stored text parses as JSON;
 *   2. it is a non-null, non-array object (a bare array is a legacy v1 payload);
 *   3. `v` is exactly `DATA_SCHEMA_VERSION`;
 *   4. `rows` is an array;
 *   5. every entry is a non-null object that `isValidRow` accepts.
 *
 * The check is all-or-nothing on purpose. Filtering out the rows that fail would
 * silently shrink the roster, and in the Directory view a shrunken roster is
 * indistinguishable from a mass deletion.
 *
 * An EMPTY `rows` array is a valid dataset and is returned as one — an HR user who
 * genuinely cleared the register should not be repopulated with 200 demo staff, and
 * nothing was lost in that case, so it reports `'empty'` rather than `'recovered'`.
 *
 * `status` tells the caller which of those happened, so a user is warned only when their
 * stored data was actually discarded.
 */
export function loadPersisted<T>(
  key: string,
  isValidRow: (row: unknown) => boolean,
  fallback: T[],
): LoadResult<T> {
  // `nothingStored` covers both "the key was never written" and "the read itself was
  // refused". A hardened profile throws `SecurityError` from `getItem`, which is
  // indistinguishable from an absent key and is not evidence that anything was lost;
  // claiming `recovered` there would warn about data the app may never have held. The
  // locked-profile user is still told, by the save side: storage that refuses to read
  // also refuses to write, and that surfaces as `unavailable`.
  const nothingStored: LoadResult<T> = { rows: fallback, status: 'empty' }
  const discarded: LoadResult<T> = { rows: fallback, status: 'recovered' }

  const saved = readItem(key)
  if (saved === null) return nothingStored

  let parsed: unknown
  try {
    parsed = JSON.parse(saved)
  } catch {
    return discarded
  }

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return discarded

  const envelope = parsed as Partial<Envelope<T>>
  if (envelope.v !== DATA_SCHEMA_VERSION) return discarded
  if (!Array.isArray(envelope.rows)) return discarded

  // The row guard runs before `isValidRow` so the validator is handed a real object
  // and never has to defend against `null` itself. `[null, null]` is a payload this
  // app actually wrote once; passing `null` through would move the crash rather than
  // remove it.
  const rowsAreValid = envelope.rows.every(
    (row) => row !== null && typeof row === 'object' && isValidRow(row),
  )
  if (!rowsAreValid) return discarded

  // A valid envelope with zero rows is 'empty', not 'loaded': nothing came back, and
  // nothing was lost. Both render the same way - an empty dashboard the user can fill.
  return {
    rows: envelope.rows as T[],
    status: envelope.rows.length === 0 ? 'empty' : 'loaded',
  }
}

/**
 * Writes rows to storage inside a versioned envelope, reporting failure rather
 * than throwing.
 *
 * Both the serialisation and the write are guarded: a circular structure throws
 * from `JSON.stringify`, and a full origin throws `QuotaExceededError` from
 * `setItem`. Either way the caller gets a `SaveResult` and can tell the user the
 * truth — this change is visible but was not saved.
 *
 * A MISSING API is also a failed save. Reaching `setItem` through optional
 * chaining (`localStorage?.setItem`) reads as a tidy no-op, but it skips the write
 * while still reporting success — the same lie as the quota bug, and the reason
 * the presence check below is explicit rather than implicit. The property access
 * itself stays inside the `try`, because that access is exactly what throws
 * `SecurityError` in a hardened profile.
 */
export function savePersisted<T>(key: string, rows: T[]): SaveResult {
  try {
    const storage = globalThis.localStorage
    if (!storage) return { ok: false, reason: 'unavailable' }
    storage.setItem(key, JSON.stringify({ v: DATA_SCHEMA_VERSION, rows }))
    return { ok: true }
  } catch (err) {
    return { ok: false, reason: classifyWriteError(err) }
  }
}

/**
 * Removes a persisted key. Used by the reset paths, where the reset itself is
 * carried by the state change and the storage clear is only housekeeping.
 */
export function clearPersisted(key: string): void {
  try {
    globalThis.localStorage?.removeItem(key)
  } catch {
    /* a denied removal is not worth interrupting a reset for */
  }
}
