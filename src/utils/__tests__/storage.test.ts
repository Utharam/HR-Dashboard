import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { loadPersisted, savePersisted, clearPersisted, DATA_SCHEMA_VERSION } from '../storage'

// The `unit` project runs this file in Vitest's `node` environment, which has no
// `localStorage` and no `Storage` constructor - verified, not assumed: a probe test
// reported `localStorage: "undefined", Storage: "undefined"` while `DOMException`
// resolved to `"function"`. The brief's fixtures also `vi.spyOn(Storage.prototype,
// ...)`, so a `Storage` CLASS is required, not just an object with the right methods.
// This minimal in-memory implementation supplies both. It is deliberately defined
// here rather than in `src/test-setup.ts` so no other suite's environment changes.
if (typeof (globalThis as any).Storage === 'undefined') {
  class MemoryStorage {
    private map = new Map<string, string>()
    getItem(key: string): string | null {
      return this.map.has(key) ? (this.map.get(key) as string) : null
    }
    setItem(key: string, value: string): void {
      this.map.set(key, String(value))
    }
    removeItem(key: string): void {
      this.map.delete(key)
    }
    clear(): void {
      this.map.clear()
    }
    key(index: number): string | null {
      return Array.from(this.map.keys())[index] ?? null
    }
    get length(): number {
      return this.map.size
    }
  }
  ;(globalThis as any).Storage = MemoryStorage
  ;(globalThis as any).localStorage = new MemoryStorage()
}

beforeEach(() => { localStorage.clear() })
afterEach(() => { vi.restoreAllMocks() })

describe('loadPersisted', () => {
  it('falls back to seed data when the key is absent', () => {
    const r = loadPersisted('k', () => true, [{ id: 'seed' }])
    expect(r.rows).toEqual([{ id: 'seed' }])
    // Absent is NOT a recovery: a first visit has nothing to recover FROM.
    expect(r.status).toBe('empty')
  })
  it('falls back when the payload is not valid JSON', () => {
    localStorage.setItem('k', '{not json')
    expect(loadPersisted('k', () => true, [{ id: 'seed' }]).rows).toEqual([{ id: 'seed' }])
    expect(loadPersisted('k', () => true, [{ id: 'seed' }]).status).toBe('recovered')
  })
  it('falls back when the payload is valid JSON of the wrong shape', () => {
    localStorage.setItem('k', JSON.stringify({ v: DATA_SCHEMA_VERSION, rows: [{ nope: 1 }] }))
    expect(loadPersisted('k', (r) => typeof (r as any).id === 'string', [{ id: 'seed' }]).status)
      .toBe('recovered')
  })
  it('falls back when the schema version does not match', () => {
    localStorage.setItem('k', JSON.stringify({ v: 1, rows: [{ id: 'x' }] }))
    expect(loadPersisted('k', () => true, [{ id: 'seed' }]).status).toBe('recovered')
  })
  it('accepts a valid empty array as an empty dataset, not seed data', () => {
    localStorage.setItem('k', JSON.stringify({ v: DATA_SCHEMA_VERSION, rows: [] }))
    const r = loadPersisted('k', () => true, [{ id: 'seed' }])
    expect(r.rows).toEqual([])
    // The subtle one: a user who deleted everyone must get an EMPTY dashboard, not 200
    // seed staff back. Nothing was lost and nothing was recovered, so this is 'empty'.
    expect(r.status).toBe('empty')
  })
  it('does not throw when localStorage access is denied', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied') })
    expect(() => loadPersisted('k', () => true, [{ id: 'seed' }])).not.toThrow()
  })

  // The three states, asserted together. The point of the union is that each one is
  // reachable and distinguishable, and in particular that the two "we threw your data
  // away" shapes - a wrong VERSION and a garbage payload - agree, while a first visit
  // and a deliberately emptied register do not.
  it('distinguishes loaded, empty and recovered', () => {
    const seed = [{ id: 'seed' }]
    // The validator is a parameter because "a row the app would reject" is a fourth way
    // to be recovered, and a permissive `() => true` cannot demonstrate it.
    const load = (raw?: string, isValidRow: (row: unknown) => boolean = () => true) => {
      if (raw !== undefined) localStorage.setItem('k', raw)
      return loadPersisted('k', isValidRow, seed)
    }
    const idsAreStrings = (row: unknown) => typeof (row as { id?: unknown }).id === 'string'

    // loaded: a current envelope was found and used.
    localStorage.clear()
    expect(load(JSON.stringify({ v: DATA_SCHEMA_VERSION, rows: [{ id: 'a' }] })).status).toBe('loaded')
    expect(load(JSON.stringify({ v: DATA_SCHEMA_VERSION, rows: [{ id: 'a' }] })).rows).toEqual([{ id: 'a' }])

    // empty: a first visit, and a register the user deliberately cleared.
    localStorage.clear()
    expect(load().status).toBe('empty')
    expect(load(JSON.stringify({ v: DATA_SCHEMA_VERSION, rows: [] })).status).toBe('empty')

    // recovered: something WAS stored and it was unusable.
    localStorage.clear()
    expect(load('{not json').status).toBe('recovered')
    expect(load('42').status).toBe('recovered')
    expect(load('null').status).toBe('recovered')
    expect(load('[null,null]').status).toBe('recovered')
    // A current envelope whose rows the app's own validator rejects.
    expect(load(JSON.stringify({ v: DATA_SCHEMA_VERSION, rows: [{ id: 42 }] }), idsAreStrings).status)
      .toBe('recovered')
    // Older AND newer schema versions are both unusable, in both directions.
    localStorage.clear()
    expect(load(JSON.stringify({ v: DATA_SCHEMA_VERSION - 1, rows: [{ id: 'a' }] })).status).toBe('recovered')
    localStorage.clear()
    expect(load(JSON.stringify({ v: DATA_SCHEMA_VERSION + 1, rows: [{ id: 'a' }] })).status).toBe('recovered')
    // A missing version is not a current envelope either.
    localStorage.clear()
    expect(load(JSON.stringify({ rows: [{ id: 'a' }] })).status).toBe('recovered')
  })

  // A read that could not happen at all is reported as 'empty', not 'recovered': there
  // is no evidence anything was stored, and claiming otherwise would warn a user whose
  // storage is merely locked about losing data they may never have had. The realistic
  // locked-profile case is still covered by the save side - a storage that refuses to
  // read also refuses to write, and that raises the 'unavailable' notice.
  it('reports a denied read as empty, not recovered', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied') })
    expect(loadPersisted('k', () => true, [{ id: 'seed' }]).status).toBe('empty')
  })

  // The two payloads measured as white-screening the app before this module existed.
  // They are valid JSON, so the old `catch {}` around `JSON.parse` let both through
  // and the throw happened downstream in a render - by which point the persistence
  // effect had never run and the bad payload could not be overwritten. Both are also
  // real data loss: the user HAD something stored, so both are 'recovered'.
  it.each([
    ['a legacy bare-array payload', '{"employees":[{}]}'],
    ['a bare JSON scalar', '42'],
    ['an array of nulls', '[null,null]'],
    ['an object with no rows array', '{"v":2,"rows":{}}'],
    ['a null payload', 'null'],
  ])('falls back to seed data for %s rather than returning it', (_label, raw) => {
    localStorage.setItem('k', raw)
    const r = loadPersisted('k', () => true, [{ id: 'seed' }])
    expect(r.rows).toEqual([{ id: 'seed' }])
    expect(r.status).toBe('recovered')
  })

  // All-or-nothing, not filter: a partially-valid roster would silently shrink the
  // register, and a filter that drops rows is indistinguishable from a real deletion
  // in the one place the user can observe it.
  it('discards the whole payload when any single row fails validation', () => {
    localStorage.setItem('k', JSON.stringify({
      v: DATA_SCHEMA_VERSION,
      rows: [{ id: 'a' }, { id: 42 }],
    }))
    const r = loadPersisted('k', (row) => typeof (row as any).id === 'string', [{ id: 'seed' }])
    expect(r.rows).toEqual([{ id: 'seed' }])
    expect(r.status).toBe('recovered')
  })

  it('never hands a null row to the validator', () => {
    localStorage.setItem('k', JSON.stringify({ v: DATA_SCHEMA_VERSION, rows: [null] }))
    const seen: unknown[] = []
    loadPersisted('k', (row) => { seen.push(row); return true }, [])
    expect(seen).toEqual([])
  })

  it('does not report a stale payload as loaded', () => {
    localStorage.setItem('k', JSON.stringify({ v: 99, rows: [{ id: 'x' }] }))
    expect(loadPersisted('k', () => true, []).status).toBe('recovered')
  })
})

describe('savePersisted', () => {
  it('round-trips through save then load', () => {
    expect(savePersisted('k', [{ id: 'a' }])).toEqual({ ok: true })
    expect(loadPersisted('k', () => true, []).rows).toEqual([{ id: 'a' }])
  })
  it('reports a quota failure instead of throwing', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError')
    })
    expect(savePersisted('k', [{ id: 'a' }])).toEqual({ ok: false, reason: 'quota' })
  })
  it('reports unavailable storage instead of throwing', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied') })
    expect(savePersisted('k', [{ id: 'a' }])).toEqual({ ok: false, reason: 'unavailable' })
  })

  // Firefox raised the pre-standard quota error under a NAME rather than a code, so that
  // one is a real signal and is kept.
  it('recognises the legacy Firefox quota error name', () => {
    const legacy = new Error('quota'); legacy.name = 'NS_ERROR_DOM_QUOTA_REACHED'
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw legacy })
    expect(savePersisted('k', [{ id: 'a' }])).toEqual({ ok: false, reason: 'quota' })
  })

  // The removed branch. `code === 22` was WebKit's QUOTA_EXCEEDED_ERR, but the same
  // number means INVALID_STATE_ERR in Firefox, and every browser that can run React 19
  // throws a modern DOMException whose `code` is always 0. Treating a bare `code: 22` as
  // quota could therefore only ever misreport some unrelated failure - and it would do so
  // with quota advice ("free up space"), which is worse than the generic message. This
  // test pins the removal: if the legacy numeric branch comes back, this fails.
  it('does not treat an unrelated DOMException carrying code 22 as a quota failure', () => {
    const unrelated = new DOMException('something else went wrong', 'InvalidStateError')
    Object.defineProperty(unrelated, 'code', { value: 22 })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw unrelated })
    expect(savePersisted('k', [{ id: 'a' }])).toEqual({ ok: false, reason: 'unavailable' })
  })

  it('writes a versioned envelope, not a bare array', () => {
    savePersisted('k', [{ id: 'a' }])
    expect(JSON.parse(localStorage.getItem('k') as string))
      .toEqual({ v: DATA_SCHEMA_VERSION, rows: [{ id: 'a' }] })
  })
  // Found by mutation testing: the implementation reached `setItem` through
  // optional chaining, so an environment with NO Web Storage API at all skipped
  // the write silently and still reported success. That is the same lie as the
  // quota bug - "your change was saved" when nothing was written.
  it('reports unavailable rather than success when the storage API is absent', () => {
    const original = globalThis.localStorage
    delete (globalThis as any).localStorage
    try {
      expect(savePersisted('k', [{ id: 'a' }])).toEqual({ ok: false, reason: 'unavailable' })
    } finally {
      ;(globalThis as any).localStorage = original
    }
  })

  it('reports a failure when the payload cannot even be serialised', () => {
    const circular: Record<string, unknown> = {}
    circular.self = circular
    expect(savePersisted('k', [circular])).toEqual({ ok: false, reason: 'unavailable' })
  })
})

describe('clearPersisted', () => {
  it('removes the key', () => {
    savePersisted('k', [{ id: 'a' }])
    clearPersisted('k')
    expect(localStorage.getItem('k')).toBeNull()
  })
  it('does not throw when removal is denied', () => {
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new Error('denied') })
    expect(() => clearPersisted('k')).not.toThrow()
  })
})
