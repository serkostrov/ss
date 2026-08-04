import { useEffect } from 'react'
import { useLocation, useSearchParams } from 'react-router-dom'

const FLASH_MS = 2200
const MAX_WAIT_MS = 8000

/**
 * Scrolls to an element and plays a blink/highlight animation.
 * Supports `?product=<id>`, `?company=<id>`, and hashes `#product-<id>` / `#company-<id>`.
 * Prefers product targets over company when both could match.
 */
export function useTargetHighlightFlash() {
  const [params, setParams] = useSearchParams()
  const location = useLocation()

  useEffect(() => {
    const productId = params.get('product')
    const companyId = params.get('company')
    const hash = location.hash.replace(/^#/, '')

    let targetId: string | null = null
    if (productId) targetId = `product-${productId}`
    else if (hash.startsWith('product-')) targetId = hash
    else if (companyId) targetId = `company-${companyId}`
    else if (hash.startsWith('company-')) targetId = hash

    if (!targetId) return

    let done = false
    let flashClearTimer: number | undefined
    let pollTimer: number | undefined
    let observer: MutationObserver | undefined
    const startedAt = Date.now()

    const cleanupUrl = () => {
      if (!params.has('product') && !params.has('company')) return
      const next = new URLSearchParams(params)
      next.delete('product')
      next.delete('company')
      setParams(next, { replace: true })
    }

    const flash = (el: HTMLElement) => {
      if (done) return
      done = true
      observer?.disconnect()
      if (pollTimer) window.clearTimeout(pollTimer)

      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      el.classList.remove('highlight-flash')
      void el.offsetWidth
      el.classList.add('highlight-flash')

      flashClearTimer = window.setTimeout(() => {
        el.classList.remove('highlight-flash')
        cleanupUrl()
      }, FLASH_MS)
    }

    const tryFind = () => {
      if (done) return
      const el = document.getElementById(targetId!)
      if (el) {
        flash(el)
        return
      }
      if (Date.now() - startedAt < MAX_WAIT_MS) {
        pollTimer = window.setTimeout(tryFind, 80)
      }
    }

    observer = new MutationObserver(() => {
      const el = document.getElementById(targetId!)
      if (el) flash(el)
    })
    observer.observe(document.body, { childList: true, subtree: true })

    pollTimer = window.setTimeout(tryFind, 30)

    return () => {
      done = true
      observer?.disconnect()
      if (pollTimer) window.clearTimeout(pollTimer)
      if (flashClearTimer) window.clearTimeout(flashClearTimer)
    }
  }, [params, location.hash, location.pathname, setParams])
}
