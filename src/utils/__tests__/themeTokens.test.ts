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
