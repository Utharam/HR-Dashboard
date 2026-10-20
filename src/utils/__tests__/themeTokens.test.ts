import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const css = readFileSync(join(process.cwd(), 'src', 'index.css'), 'utf8')
const lightBlock = css.match(/:root\[data-theme="light"\]\s*\{([\s\S]*?)\}/)?.[1] ?? ''
const darkBlock = [...css.matchAll(/:root\s*\{([\s\S]*?)\}/g)].map((m) => m[1]).join('\n')

const THEME_VARYING = [
  '--bg-main', '--bg-card', '--bg-card-hover', '--bg-card-subtle', '--bg-table-head',
  '--bg-well', '--scrim', '--border', '--border-strong', '--border-focus', '--hairline',
  '--primary', '--primary-hover', '--primary-glow', '--primary-ring',
  '--success', '--success-glow', '--success-edge', '--success-soft',
  '--warning', '--warning-glow', '--warning-edge', '--warning-soft',
  '--danger', '--danger-glow', '--danger-edge', '--danger-soft',
  '--info', '--info-glow', '--info-edge', '--info-soft',
  '--purple', '--purple-glow', '--purple-edge', '--purple-soft',
  '--pink', '--pink-glow', '--pink-edge', '--pink-soft',
  '--neutral-tone', '--neutral-edge', '--text-bright', '--text-main', '--text-muted',
  '--text-dim', '--grid-line', '--shadow-xs', '--shadow-sm', '--shadow-md', '--shadow-lg',
  '--shadow-xl', '--shadow-primary', '--row-hover', '--badge-resigned-bg', '--toggle-chip-hover',
  '--primary-soft', '--on-accent', '--border-control', '--border-control-strong',
] as const

describe('light token parity', () => {
  it('defines a light block', () => {
    expect(lightBlock.length).toBeGreaterThan(0)
  })
  it('defines every theme-varying token in both blocks', () => {
    for (const name of THEME_VARYING) {
      expect(darkBlock, `dark is missing ${name}`).toContain(`${name}:`)
      expect(lightBlock, `light is missing ${name}`).toContain(`${name}:`)
    }
  })
  it('makes color-scheme follow the theme', () => {
    expect(css).toMatch(/color-scheme:\s*dark/)
    expect(lightBlock).toMatch(/color-scheme:\s*light/)
  })
  it('routes the three former hardcoded colours through tokens', () => {
    expect(css).toMatch(/\.badge-resigned[^}]*var\(--badge-resigned-bg\)/)
    expect(css).toMatch(/\.omni-table tr:hover td[^}]*var\(--row-hover\)/)
    expect(css).toMatch(/\.toggle-chip--on:hover[^}]*var\(--toggle-chip-hover\)/)
  })
  it('stops inverting the date-picker indicator in light', () => {
    expect(css).toMatch(/:root\[data-theme="light"\][^{]*\{[^}]*filter:\s*none/)
  })
})

// Presence tests let two real light-theme failures through: dark text on solid
// indigo, and a washed-out --primary-soft. Contrast is computed, not eyeballed.
const lightVars: Record<string, string> = {}
for (const line of lightBlock.split('\n')) {
  const match = line.match(/^\s*(--[a-z0-9-]+):\s*(.+?);/)
  if (match) lightVars[match[1]] = match[2].trim()
}

const parseHex = (value: string | undefined): [number, number, number] | null => {
  if (!value) return null
  const match = value.match(/^#([0-9a-f]{6})$/i)
  if (!match) return null
  const n = parseInt(match[1], 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

const channel = (value: number) => {
  const s = value / 255
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
}

const luminance = (hex: [number, number, number]) =>
  0.2126 * channel(hex[0]) + 0.7152 * channel(hex[1]) + 0.0722 * channel(hex[2])

const contrast = (a: string, b: string) => {
  const ca = parseHex(lightVars[a])
  const cb = parseHex(lightVars[b])
  if (!ca || !cb) throw new Error(`missing hex value for ${a} or ${b}`)
  const la = luminance(ca)
  const lb = luminance(cb)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

describe('light contrast', () => {
  it('keeps body, muted, dim and primary-soft text at AA on the card', () => {
    for (const token of ['--text-main', '--text-muted', '--text-dim', '--primary-soft']) {
      expect(contrast(token, '--bg-card'), token).toBeGreaterThanOrEqual(4.5)
    }
  })
  it('keeps text on a solid accent fill at AA', () => {
    expect(contrast('--on-accent', '--primary')).toBeGreaterThanOrEqual(4.5)
  })
  it('keeps form-control borders at 3:1 against the card', () => {
    expect(contrast('--border-control', '--bg-card')).toBeGreaterThanOrEqual(3)
  })
  it('keeps the two chart greys distinct in light', () => {
    expect(lightVars['--neutral-tone']).not.toBe(lightVars['--text-dim'])
  })
})
