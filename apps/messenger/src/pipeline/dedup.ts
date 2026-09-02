const inflight = new Map<string, Promise<unknown>>()

export function isUniqueViolation(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false
  if (error.code === '23505') return true
  return /duplicate key|unique constraint/i.test(error.message ?? '')
}

/** In-process lock so two overlapping webhooks with the same id share one run. */
export async function runExclusive<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const existing = inflight.get(key)
  if (existing) return existing as Promise<T>
  const pending = fn().finally(() => {
    if (inflight.get(key) === pending) inflight.delete(key)
  })
  inflight.set(key, pending)
  return pending
}

export function sourceFingerprint(platform: string, externalMessageId: string): string {
  return `${platform}:${externalMessageId.trim()}`
}

/**
 * Text we ourselves post when bridging. Incoming copies must not be bridged again
 * (channel posts often omit from.is_bot; Max sometimes omits sender.is_bot).
 */
export function isBridgeEchoText(text: string): boolean {
  const trimmed = text.trim()
  return /^(?:\[(?:Telegram|Max|MAX)\s*[·\-–—:]|↔\s|АПСС\s*:)/.test(trimmed)
}

export function isAmbiguousSendError(error: unknown): boolean {
  const message = (error instanceof Error ? error.message : String(error)).toLowerCase()
  return (
    message.includes('fetch failed') ||
    message.includes('aborted') ||
    message.includes('timeout') ||
    message.includes('timed out') ||
    message.includes('econnreset') ||
    message.includes('econnrefused') ||
    message.includes('socket hang up') ||
    message.includes('network') ||
    /\b(500|502|503|504)\b/.test(message)
  )
}
