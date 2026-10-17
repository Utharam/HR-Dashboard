import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'

// @testing-library/react only auto-registers its afterEach(cleanup) when the test
// runner exposes a GLOBAL afterEach. Vitest runs with globals disabled, so cleanup
// would never run and renders would leak into document.body across tests, causing
// "Found multiple elements" failures. Register it explicitly instead.
if (typeof document !== 'undefined') {
  const { cleanup } = await import('@testing-library/react')
  afterEach(() => {
    cleanup()
  })
}