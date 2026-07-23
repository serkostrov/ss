/**
 * Suspense fallback used by route-level lazy boundaries.
 * Prefer FullPageLoader for full-viewport waits, InlineLoader inside layouts.
 */
export { FullPageLoader as SuspenseFallback, InlineLoader } from '@shared/ui'
