import '@testing-library/jest-dom/vitest'

// jsdom doesn't implement these; some components/effects may touch them.
if (!window.matchMedia) {
  // @ts-expect-error - minimal stub for jsdom
  window.matchMedia = () => ({
    matches: false,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })
}
