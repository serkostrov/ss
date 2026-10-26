/** Default timeout for Telegram / Max HTTP calls. */
export const PLATFORM_FETCH_TIMEOUT_MS = 15_000

export function platformFetchSignal(
  timeoutMs: number = PLATFORM_FETCH_TIMEOUT_MS,
): AbortSignal {
  return AbortSignal.timeout(timeoutMs)
}
