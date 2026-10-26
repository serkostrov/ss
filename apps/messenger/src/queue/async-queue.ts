import { log } from '../types.js'

export type AsyncQueue = {
  enqueue: (fn: () => Promise<void>) => void
  pending: () => number
  active: () => number
}

/** In-process queue with a concurrency cap (used for post-ACK relay work). */
export function createAsyncQueue(options: {
  name: string
  concurrency: number
}): AsyncQueue {
  const concurrency = Math.max(1, options.concurrency)
  const waiting: Array<() => Promise<void>> = []
  let running = 0

  const pump = () => {
    while (running < concurrency && waiting.length > 0) {
      const job = waiting.shift()
      if (!job) break
      running += 1
      Promise.resolve()
        .then(job)
        .catch((error) => {
          log('warn', 'Async queue job failed', {
            queue: options.name,
            message: error instanceof Error ? error.message : String(error),
          })
        })
        .finally(() => {
          running -= 1
          pump()
        })
    }
  }

  return {
    enqueue(fn) {
      waiting.push(fn)
      pump()
    },
    pending: () => waiting.length,
    active: () => running,
  }
}
