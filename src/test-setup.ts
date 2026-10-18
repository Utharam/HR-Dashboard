import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'

// @testing-library/react only auto-registers its own afterEach(cleanup) when the test
// runner exposes a GLOBAL afterEach. Vitest runs with globals: false (set explicitly
// in vitest.config.ts), so that auto-registration never happens and renders would leak
// into document.body across tests, causing "Found multiple elements" failures.
//
// This explicit registration is therefore INTENTIONAL, not a workaround to be tidied
// away. It remains correct even if globals are ever enabled: RTL would then register
// its own afterEach in addition to this one, and cleanup() is idempotent — calling it
// twice simply unmounts nothing the second time. Keeping this line means the harness
// does not silently start leaking DOM the day globals are turned on.
//
// The document guard keeps @testing-library/react out of the node project entirely,
// so pure-logic *.test.ts files stay DOM-free.
if (typeof document !== 'undefined') {
  const { cleanup } = await import('@testing-library/react')
  afterEach(() => {
    cleanup()
  })
}
