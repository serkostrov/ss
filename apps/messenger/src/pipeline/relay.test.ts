import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { isAmbiguousSendError, sourceFingerprint } from './dedup.js'
import {
  isLeaseStale,
  LEASE_STALE_MS,
  MAX_RELAY_ATTEMPTS,
  reserveRelayRow,
} from './relay.js'
import type { DbClient } from '../db.js'

describe('isLeaseStale', () => {
  it('treats missing claimed_at as stale', () => {
    assert.equal(isLeaseStale(null), true)
    assert.equal(isLeaseStale(undefined), true)
  })

  it('treats fresh claim as not stale', () => {
    const now = Date.now()
    assert.equal(isLeaseStale(new Date(now - 1_000).toISOString(), now), false)
  })

  it('treats old claim as stale', () => {
    const now = Date.now()
    assert.equal(
      isLeaseStale(new Date(now - LEASE_STALE_MS - 1).toISOString(), now),
      true,
    )
  })
})

describe('isAmbiguousSendError', () => {
  it('detects timeout / abort / 5xx style errors', () => {
    assert.equal(isAmbiguousSendError(new Error('fetch failed')), true)
    assert.equal(isAmbiguousSendError(new Error('request timed out')), true)
    assert.equal(isAmbiguousSendError(new Error('HTTP 504 Gateway')), true)
    const abort = new Error('This operation was aborted')
    abort.name = 'AbortError'
    assert.equal(isAmbiguousSendError(abort), true)
    assert.equal(isAmbiguousSendError(new Error('chat not found')), false)
  })
})

describe('sourceFingerprint', () => {
  it('builds platform:id key', () => {
    assert.equal(sourceFingerprint('max', ' mid.1 '), 'max:mid.1')
    assert.equal(sourceFingerprint('telegram', '42'), 'telegram:42')
  })
})

type RelayRecord = {
  id: string
  message_id: string
  target_platform: string
  target_chat_id: string
  source_fingerprint: string | null
  status: 'pending' | 'sent' | 'failed'
  target_external_message_id: string | null
  claimed_at: string | null
  attempt_count: number
  last_error: string | null
  created_at: string
  relayed_at: string | null
}

function createRelayDb(rows: RelayRecord[]) {
  const store = [...rows]
  let idSeq = store.length + 1

  const matchesFilters = (
    row: RelayRecord,
    filters: Array<{ op: string; col: string; val: unknown }>,
  ) =>
    filters.every((f) => {
      const value = (row as Record<string, unknown>)[f.col]
      if (f.op === 'eq') return value === f.val
      if (f.op === 'is') return value == null && f.val == null
      return true
    })

  const table = () => {
    const filters: Array<{ op: string; col: string; val: unknown }> = []
    let mode: 'select' | 'insert' | 'update' = 'select'
    let insertRow: Partial<RelayRecord> | null = null
    let updatePatch: Partial<RelayRecord> | null = null
    let limitN: number | null = null

    const api: Record<string, unknown> = {}

    const run = async () => {
      if (mode === 'insert' && insertRow) {
        const conflict = store.find(
          (r) =>
            (r.message_id === insertRow!.message_id &&
              r.target_platform === insertRow!.target_platform) ||
            (insertRow!.source_fingerprint &&
              r.source_fingerprint === insertRow!.source_fingerprint &&
              r.target_platform === insertRow!.target_platform &&
              r.target_chat_id === insertRow!.target_chat_id),
        )
        if (conflict) {
          return {
            data: null,
            error: { code: '23505', message: 'duplicate key' },
          }
        }
        const row: RelayRecord = {
          id: `r${idSeq++}`,
          message_id: String(insertRow.message_id),
          target_platform: String(insertRow.target_platform),
          target_chat_id: String(insertRow.target_chat_id),
          source_fingerprint: (insertRow.source_fingerprint as string) ?? null,
          status: (insertRow.status as RelayRecord['status']) ?? 'pending',
          target_external_message_id: null,
          claimed_at: (insertRow.claimed_at as string) ?? null,
          attempt_count: Number(insertRow.attempt_count ?? 0),
          last_error: null,
          created_at: new Date().toISOString(),
          relayed_at: null,
        }
        store.push(row)
        return { data: { id: row.id }, error: null }
      }

      let matched = store.filter((r) => matchesFilters(r, filters))
      if (mode === 'update' && updatePatch) {
        for (const row of matched) {
          Object.assign(row, updatePatch)
        }
        const first = matched[0]
        return { data: first ? { id: first.id } : null, error: null }
      }

      if (limitN != null) matched = matched.slice(0, limitN)
      if (limitN === 1 || filters.some((f) => f.col === 'message_id')) {
        return { data: matched[0] ?? null, error: null }
      }
      return { data: matched, error: null }
    }

    const chain = () => api

    api.select = () => {
      // select() after insert/update only shapes the return; keep mutation mode
      if (mode !== 'insert' && mode !== 'update') mode = 'select'
      return chain()
    }
    api.insert = (payload: Partial<RelayRecord>) => {
      mode = 'insert'
      insertRow = payload
      return chain()
    }
    api.update = (payload: Partial<RelayRecord>) => {
      mode = 'update'
      updatePatch = payload
      return chain()
    }
    api.eq = (col: string, val: unknown) => {
      filters.push({ op: 'eq', col, val })
      return chain()
    }
    api.is = (col: string, val: unknown) => {
      filters.push({ op: 'is', col, val })
      return chain()
    }
    api.order = () => chain()
    api.limit = (n: number) => {
      limitN = n
      return chain()
    }
    api.maybeSingle = async () => {
      limitN = 1
      const result = await run()
      if (Array.isArray(result.data)) {
        return { data: result.data[0] ?? null, error: result.error }
      }
      return result
    }
    api.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      run().then(resolve, reject)

    return api
  }

  return {
    from: (name: string) => {
      if (name !== 'message_relays') throw new Error(`unexpected table ${name}`)
      return table()
    },
    _store: store,
  } as unknown as DbClient & { _store: RelayRecord[] }
}

describe('reserveRelayRow', () => {
  const baseInput = {
    messageId: 'msg-1',
    targetPlatform: 'telegram' as const,
    targetChatId: '100',
    fingerprint: 'max:mid.1',
  }

  it('inserts a new pending claim', async () => {
    const db = createRelayDb([])
    const result = await reserveRelayRow(db, baseInput)
    assert.ok(result)
    assert.equal(result.shouldSend, true)
    assert.equal(db._store[0]?.status, 'pending')
    assert.equal(db._store[0]?.attempt_count, 1)
    assert.ok(db._store[0]?.claimed_at)
  })

  it('skips already sent rows', async () => {
    const db = createRelayDb([
      {
        id: 'r1',
        message_id: 'msg-1',
        target_platform: 'telegram',
        target_chat_id: '100',
        source_fingerprint: 'max:mid.1',
        status: 'sent',
        target_external_message_id: '99',
        claimed_at: new Date().toISOString(),
        attempt_count: 1,
        last_error: null,
        created_at: new Date().toISOString(),
        relayed_at: new Date().toISOString(),
      },
    ])
    const result = await reserveRelayRow(db, baseInput)
    assert.deepEqual(result, { relayId: 'r1', shouldSend: false })
  })

  it('skips fresh pending lease', async () => {
    const db = createRelayDb([
      {
        id: 'r1',
        message_id: 'msg-1',
        target_platform: 'telegram',
        target_chat_id: '100',
        source_fingerprint: 'max:mid.1',
        status: 'pending',
        target_external_message_id: null,
        claimed_at: new Date().toISOString(),
        attempt_count: 1,
        last_error: null,
        created_at: new Date().toISOString(),
        relayed_at: null,
      },
    ])
    const result = await reserveRelayRow(db, baseInput)
    assert.deepEqual(result, { relayId: 'r1', shouldSend: false })
  })

  it('reclaims stale pending lease', async () => {
    const stale = new Date(Date.now() - LEASE_STALE_MS - 5_000).toISOString()
    const db = createRelayDb([
      {
        id: 'r1',
        message_id: 'msg-1',
        target_platform: 'telegram',
        target_chat_id: '100',
        source_fingerprint: 'max:mid.1',
        status: 'pending',
        target_external_message_id: null,
        claimed_at: stale,
        attempt_count: 1,
        last_error: 'timeout',
        created_at: stale,
        relayed_at: null,
      },
    ])
    const result = await reserveRelayRow(db, baseInput)
    assert.ok(result)
    assert.equal(result.shouldSend, true)
    assert.equal(db._store[0]?.attempt_count, 2)
    assert.ok(db._store[0]?.claimed_at)
    assert.notEqual(db._store[0]?.claimed_at, stale)
  })

  it('reclaims failed rows', async () => {
    const db = createRelayDb([
      {
        id: 'r1',
        message_id: 'msg-1',
        target_platform: 'telegram',
        target_chat_id: '100',
        source_fingerprint: 'max:mid.1',
        status: 'failed',
        target_external_message_id: null,
        claimed_at: new Date().toISOString(),
        attempt_count: 2,
        last_error: 'chat not found',
        created_at: new Date().toISOString(),
        relayed_at: null,
      },
    ])
    const result = await reserveRelayRow(db, baseInput)
    assert.ok(result)
    assert.equal(result.shouldSend, true)
    assert.equal(db._store[0]?.status, 'pending')
    assert.equal(db._store[0]?.attempt_count, 3)
  })

  it('stops after attempt cap', async () => {
    const stale = new Date(Date.now() - LEASE_STALE_MS - 1).toISOString()
    const db = createRelayDb([
      {
        id: 'r1',
        message_id: 'msg-1',
        target_platform: 'telegram',
        target_chat_id: '100',
        source_fingerprint: 'max:mid.1',
        status: 'pending',
        target_external_message_id: null,
        claimed_at: stale,
        attempt_count: MAX_RELAY_ATTEMPTS,
        last_error: 'timeout',
        created_at: stale,
        relayed_at: null,
      },
    ])
    const result = await reserveRelayRow(db, baseInput)
    assert.deepEqual(result, { relayId: 'r1', shouldSend: false })
    assert.equal(db._store[0]?.status, 'failed')
  })
})
