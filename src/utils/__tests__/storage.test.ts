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
    expect(r.recovered).toBe(true)
  })
  it('falls back when the payload is not valid JSON', () => {
    localStorage.setItem('k', '{not json')
    expect(loadPersisted('k', () => true, [{ id: 'seed' }]).rows).toEqual([{ id: 'seed' }])
  })
  it('falls back when the payload is valid JSON of the wrong shape', () => {
    localStorage.setItem('k', JSON.stringify({ v: DATA_SCHEMA_VERSION, rows: [{ nope: 1 }] }))
    expect(loadPersisted('k', (r) => typeof (r as any).id === 'string', [{ id: 'seed' }]).rows)
      .toEqual([{ id: 'seed' }])
  })
  it('falls back when the schema version does not match', () => {
    localStorage.setItem('k', JSON.stringify({ v: 1, rows: [{ id: 'x' }] }))
    expect(loadPersisted('k', () => true, [{ id: 'seed' }]).rows).toEqual([{ id: 'seed' }])
  })
  it('accepts a valid empty array as an empty dataset, not seed data', () => {
    localStorage.setItem('k', JSON.stringify({ v: DATA_SCHEMA_VERSION, rows: [] }))
    const r = loadPersisted('k', () => true, [{ id: 'seed' }])
    expect(r.rows).toEqual([])
    expect(r.recovered).toBe(false)
  })
  it('does not throw when localStorage access is denied', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied') })
    expect(() => loadPersisted('k', () => true, [{ id: 'seed' }])).not.toThrow()
  })

  // The two payloads measured as white-screening the app before this module existed.
  // They are valid JSON, so the old `catch {}` around `JSON.parse` let both through
  // and the throw happened downstream in a render - by which point the persistence
  // effect had never run and the bad payload could not be overwritten.
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
    expect(r.recovered).toBe(true)
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
    expect(r.recovered).toBe(true)
  })

  it('never hands a null row to the validator', () => {
    localStorage.setItem('k', JSON.stringify({ v: DATA_SCHEMA_VERSION, rows: [null] }))
    const seen: unknown[] = []
    loadPersisted('k', (row) => { seen.push(row); return true }, [])
    expect(seen).toEqual([])
  })

  it('does not treat a rejected payload as recovered data', () => {
    localStorage.setItem('k', JSON.stringify({ v: 99, rows: [{ id: 'x' }] }))
    expect(loadPersisted('k', () => true, []).recovered).toBe(true)
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
