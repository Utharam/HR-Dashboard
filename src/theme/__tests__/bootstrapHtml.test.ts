import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DATA_SCHEMA_VERSION } from '../../utils/storage'

/**
 * The pre-paint theme bootstrap lives in `index.html`, not in a module, so it
 * cannot be imported: it is extracted from the document and executed here
 * against hand-written fakes. That is the point of the test - the script's only
 * contract is "reads storage, writes one attribute, never throws", and a fake
 * is a stricter witness of that than jsdom is.
 */
const html = readFileSync(join(process.cwd(), 'index.html'), 'utf8')
const extracted = html.match(/<script>([\s\S]*?)<\/script>/)?.[1]
if (!extracted) throw new Error('index.html has no inline <script> block')
const inlineScript: string = extracted

const envelope = (mode: unknown, v: number = DATA_SCHEMA_VERSION): string =>
  JSON.stringify({ v, rows: [{ mode }] })

interface Scenario {
  stored?: string | null
  prefersDark?: boolean
  /** Simulates a hardened profile where even `getItem` throws. */
  storageThrows?: boolean
  /** Simulates a browser (or fake) without `matchMedia`. */
  noMatchMedia?: boolean
}

/** Runs the real inline script and returns the attributes it set on <html>. */
function runBootstrap(scenario: Scenario = {}): Record<string, string> {
  const attributes: Record<string, string> = {}
  const fakeDocument = {
    documentElement: {
      setAttribute: (name: string, value: string) => {
        attributes[name] = value
      },
    },
  }
  const fakeWindow = {
    matchMedia:
      scenario.noMatchMedia === true
        ? undefined
        : () => ({ matches: scenario.prefersDark ?? false }),
  }
  const fakeStorage = {
    getItem: (key: string) => {
      if (scenario.storageThrows === true) throw new Error('SecurityError')
      return key === 'omnihr_theme' ? (scenario.stored ?? null) : null
    },
  }

  const run = new Function(
    'window',
    'document',
    'localStorage',
    inlineScript,
  ) as (window: typeof fakeWindow, document: typeof fakeDocument, storage: typeof fakeStorage) => void

  expect(() => run(fakeWindow, fakeDocument, fakeStorage)).not.toThrow()
  return attributes
}

describe('index.html pre-paint theme script', () => {
  it('is a synchronous inline script that precedes the module entry', () => {
    const inlineAt = html.indexOf('<script>')
    const moduleAt = html.indexOf('/src/main.tsx')
    expect(inlineAt).toBeGreaterThan(-1)
    expect(moduleAt).toBeGreaterThan(-1)
    expect(inlineAt).toBeLessThan(moduleAt)
  })

  it('sits in the head, before the stylesheet and font links', () => {
    expect(html.indexOf('<script>')).toBeLessThan(html.indexOf('<link'))
    expect(html.indexOf('<script>')).toBeLessThan(html.indexOf('</head>'))
  })
})

describe('pre-paint theme resolution', () => {
  it('applies a stored light mode', () => {
    expect(runBootstrap({ stored: envelope('light') })['data-theme']).toBe('light')
  })

  it('applies a stored dark mode', () => {
    expect(runBootstrap({ stored: envelope('dark') })['data-theme']).toBe('dark')
  })

  it('resolves system to dark when the OS prefers dark', () => {
    expect(
      runBootstrap({ stored: envelope('system'), prefersDark: true })['data-theme'],
    ).toBe('dark')
  })

  it('resolves system to light when the OS prefers light', () => {
    expect(
      runBootstrap({ stored: envelope('system'), prefersDark: false })['data-theme'],
    ).toBe('light')
  })

  it('leaves the CSS dark default alone when nothing is stored', () => {
    expect(runBootstrap()['data-theme']).toBeUndefined()
  })

  it('ignores a corrupt payload', () => {
    expect(runBootstrap({ stored: '{not json' })['data-theme']).toBeUndefined()
  })

  it('ignores a payload from a different envelope version', () => {
    const stale = envelope('light', DATA_SCHEMA_VERSION - 1)
    expect(runBootstrap({ stored: stale })['data-theme']).toBeUndefined()
  })

  it('ignores an unknown mode', () => {
    expect(runBootstrap({ stored: envelope('blue') })['data-theme']).toBeUndefined()
  })

  it('does not throw when storage denies the read', () => {
    expect(runBootstrap({ storageThrows: true })['data-theme']).toBeUndefined()
  })

  it('does not throw when matchMedia is unavailable in system mode', () => {
    expect(
      runBootstrap({ stored: envelope('system'), noMatchMedia: true })['data-theme'],
    ).toBeUndefined()
  })
})
