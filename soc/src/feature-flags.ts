/** Feature flags for social publisher. */
export function isBrandGeoEnabled(): boolean {
  if (typeof globalThis !== 'undefined' && (globalThis as any).__ENABLE_BRAND_GEO__ !== undefined) {
    return Boolean((globalThis as any).__ENABLE_BRAND_GEO__)
  }
  return false
}
