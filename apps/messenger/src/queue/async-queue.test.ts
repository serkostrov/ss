import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { createAsyncQueue } from './async-queue.js'

describe('createAsyncQueue', () => {
  it('respects concurrency and drains jobs', async () => {
    const queue = createAsyncQueue({ name: 'test', concurrency: 2 })
    let maxActive = 0
    let active = 0
    const done: number[] = []

    const jobs = [1, 2, 3, 4].map(
      (n) =>
        new Promise<void>((resolve) => {
          queue.enqueue(async () => {
            active += 1
            maxActive = Math.max(maxActive, active)
            await new Promise((r) => setTimeout(r, 20))
            done.push(n)
            active -= 1
            resolve()
          })
        }),
    )

    await Promise.all(jobs)
    for (let i = 0; i < 20 && queue.active() > 0; i += 1) {
      await new Promise((r) => setImmediate(r))
    }
    assert.equal(done.length, 4)
    assert.ok(maxActive <= 2)
    assert.equal(queue.pending(), 0)
    assert.equal(queue.active(), 0)
  })
})
