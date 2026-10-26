import type { MessengerConfig } from '../config/index.js'
import type { DbClient } from '../db.js'
import { deliverToBoundChat } from '../outbound/deliver.js'
import { createAsyncQueue, type AsyncQueue } from '../queue/async-queue.js'
import {
  contentPlaceholder,
  log,
  type MessageContentType,
  type MessengerPlatform,
} from '../types.js'
import {
  isAmbiguousSendError,
  isUniqueViolation,
  sourceFingerprint,
} from './dedup.js'
import { ingestChannelMessage } from './ingest.js'

export type RelaySiblingInput = {
  workGroupId: string
  sourcePlatform: MessengerPlatform
  sourceChatId: string
  sourceExternalMessageId: string
  messageId: string
  text: string
  contentType: MessageContentType
  authorName?: string | null
}

type RelayRow = {
  id: string
  status: 'pending' | 'sent' | 'failed'
  target_external_message_id?: string | null
  claimed_at?: string | null
  attempt_count?: number | null
  last_error?: string | null
}

export const LEASE_STALE_MS = 2 * 60_000
export const MAX_RELAY_ATTEMPTS = 5
export const BACKLOG_MIN_AGE_MS = 30_000
export const SWEEPER_INTERVAL_MS = 45_000

let relayQueue: AsyncQueue | null = null

function getRelayQueue(): AsyncQueue {
  if (!relayQueue) {
    relayQueue = createAsyncQueue({ name: 'relay', concurrency: 4 })
  }
  return relayQueue
}

/** Schedule relay work after webhook ACK (ingest already persisted). */
export function enqueueRelayWork(fn: () => Promise<void>): void {
  getRelayQueue().enqueue(fn)
}

export function isLeaseStale(
  claimedAt: string | null | undefined,
  nowMs: number = Date.now(),
): boolean {
  if (!claimedAt) return true
  const ts = Date.parse(claimedAt)
  if (!Number.isFinite(ts)) return true
  return nowMs - ts >= LEASE_STALE_MS
}

function isRelayEchoPayload(payload: unknown): boolean {
  if (!payload || typeof payload !== 'object') return false
  const record = payload as { apss_relay?: boolean; outbound?: boolean }
  return Boolean(record.apss_relay || record.outbound)
}

export function formatAttributedText(
  authorName: string | null | undefined,
  body: string,
): string {
  const content = body.trim()
  const who = authorName?.trim()
  if (!who) return content
  if (!content) return `${who}:`
  return `${who}:\n${content}`
}

function formatRelayText(input: RelaySiblingInput): string {
  const body =
    input.text.trim() || contentPlaceholder(input.contentType) || '[Сообщение]'
  return formatAttributedText(input.authorName, body)
}

function claimFields(attemptCount: number): Record<string, unknown> {
  return {
    status: 'pending',
    claimed_at: new Date().toISOString(),
    attempt_count: attemptCount,
  }
}

async function loadRelayRow(
  db: DbClient,
  input: {
    messageId: string
    targetPlatform: MessengerPlatform
    fingerprint: string
    targetChatId: string
  },
): Promise<RelayRow | null> {
  const { data: byMessage, error: byMessageError } = await db
    .from('message_relays')
    .select(
      'id, status, target_external_message_id, claimed_at, attempt_count, last_error',
    )
    .eq('message_id', input.messageId)
    .eq('target_platform', input.targetPlatform)
    .maybeSingle()

  if (byMessageError) {
    log('warn', 'Relay row lookup failed', {
      message: byMessageError.message,
      messageId: input.messageId,
      targetPlatform: input.targetPlatform,
      reason: 'lookup_failed',
    })
  } else if (byMessage?.id) {
    return {
      id: byMessage.id as string,
      status: byMessage.status as RelayRow['status'],
      target_external_message_id:
        (byMessage.target_external_message_id as string | null) ?? null,
      claimed_at: (byMessage.claimed_at as string | null) ?? null,
      attempt_count: (byMessage.attempt_count as number | null) ?? 0,
      last_error: (byMessage.last_error as string | null) ?? null,
    }
  }

  const { data: byFingerprint, error: fingerprintError } = await db
    .from('message_relays')
    .select(
      'id, status, target_external_message_id, claimed_at, attempt_count, last_error',
    )
    .eq('source_fingerprint', input.fingerprint)
    .eq('target_platform', input.targetPlatform)
    .eq('target_chat_id', input.targetChatId)
    .order('created_at', { ascending: true })
    .limit(1)

  if (fingerprintError) {
    if (
      !/source_fingerprint|42703|claimed_at|attempt_count/.test(
        `${fingerprintError.code ?? ''} ${fingerprintError.message}`,
      )
    ) {
      log('warn', 'Relay fingerprint lookup failed', {
        message: fingerprintError.message,
        fingerprint: input.fingerprint,
        targetPlatform: input.targetPlatform,
        reason: 'fingerprint_lookup_failed',
      })
    }
    return null
  }

  const fingerprintRow = byFingerprint?.[0]
  if (!fingerprintRow?.id) return null
  return {
    id: fingerprintRow.id as string,
    status: fingerprintRow.status as RelayRow['status'],
    target_external_message_id:
      (fingerprintRow.target_external_message_id as string | null) ?? null,
    claimed_at: (fingerprintRow.claimed_at as string | null) ?? null,
    attempt_count: (fingerprintRow.attempt_count as number | null) ?? 0,
    last_error: (fingerprintRow.last_error as string | null) ?? null,
  }
}

/** True if a mirror already exists for this source message on the target platform. */
export async function findExistingMirrorDelivery(
  db: DbClient,
  input: {
    messageId: string
    fingerprint: string
    targetPlatform: MessengerPlatform
    targetChatId: string
  },
): Promise<{ externalMessageId: string; chatId: string } | null> {
  const { data: byFingerprint } = await db
    .from('message_relays')
    .select('target_external_message_id, target_chat_id')
    .eq('source_fingerprint', input.fingerprint)
    .eq('target_platform', input.targetPlatform)
    .not('target_external_message_id', 'is', null)
    .order('relayed_at', { ascending: false })
    .limit(1)

  const fp = byFingerprint?.[0]
  if (fp?.target_external_message_id) {
    return {
      externalMessageId: String(fp.target_external_message_id),
      chatId: String(fp.target_chat_id ?? input.targetChatId),
    }
  }

  const { data: mirrors } = await db
    .from('messages')
    .select('external_message_id, external_chat_id, payload')
    .eq('source', input.targetPlatform)
    .contains('payload', { apss_relay: true, from_message_id: input.messageId })
    .order('sent_at', { ascending: false })
    .limit(5)

  for (const row of mirrors ?? []) {
    const mid = String(row.external_message_id ?? '').trim()
    if (!mid) continue
    return {
      externalMessageId: mid,
      chatId: String(row.external_chat_id ?? input.targetChatId),
    }
  }

  return null
}

async function markRelaySent(
  db: DbClient,
  relayRowId: string,
  fingerprint: string,
  delivered: { chatId: string; externalMessageId: string },
): Promise<void> {
  await db
    .from('message_relays')
    .update({
      status: 'sent',
      target_chat_id: delivered.chatId,
      target_external_message_id: delivered.externalMessageId,
      source_fingerprint: fingerprint,
      relayed_at: new Date().toISOString(),
      last_error: null,
    })
    .eq('id', relayRowId)
}

async function markRelayFailed(
  db: DbClient,
  relayRowId: string,
  lastError: string,
): Promise<void> {
  await db
    .from('message_relays')
    .update({
      status: 'failed',
      last_error: lastError.slice(0, 2000),
    })
    .eq('id', relayRowId)
}

async function tryClaimExisting(
  db: DbClient,
  existing: RelayRow,
  input: {
    messageId: string
    targetPlatform: MessengerPlatform
    targetChatId: string
    fingerprint: string
  },
  reason: 'failed_reclaim' | 'stale_reclaimed',
): Promise<{ relayId: string; shouldSend: boolean } | null> {
  const attempts = Number(existing.attempt_count ?? 0)
  if (attempts >= MAX_RELAY_ATTEMPTS) {
    log('warn', 'Relay skipped — attempt exhausted', {
      messageId: input.messageId,
      targetPlatform: input.targetPlatform,
      relayId: existing.id,
      attemptCount: attempts,
      reason: 'attempt_exhausted',
    })
    if (existing.status !== 'failed') {
      await markRelayFailed(
        db,
        existing.id,
        existing.last_error ?? 'attempt_exhausted',
      )
    }
    return { relayId: existing.id, shouldSend: false }
  }

  const nextAttempt = attempts + 1
  let query = db
    .from('message_relays')
    .update({
      ...claimFields(nextAttempt),
      target_chat_id: input.targetChatId,
      source_fingerprint: input.fingerprint,
      last_error: null,
    })
    .eq('id', existing.id)

  if (reason === 'failed_reclaim') {
    query = query.eq('status', 'failed')
  } else {
    query = query.eq('status', 'pending')
    if (existing.claimed_at) {
      query = query.eq('claimed_at', existing.claimed_at)
    }
  }

  const { data: claimed, error: claimError } = await query.select('id').maybeSingle()

  if (claimError || !claimed?.id) {
    log('info', 'Relay skipped — concurrent reservation', {
      messageId: input.messageId,
      targetPlatform: input.targetPlatform,
      relayId: existing.id,
      reason: 'duplicate_claim',
    })
    return { relayId: existing.id, shouldSend: false }
  }

  log('info', reason === 'stale_reclaimed' ? 'Relay stale lease reclaimed' : 'Relay failed row reclaimed', {
    messageId: input.messageId,
    targetPlatform: input.targetPlatform,
    relayId: existing.id,
    attemptCount: nextAttempt,
    reason,
  })
  return { relayId: existing.id, shouldSend: true }
}

/**
 * Claim the right to send once per (source message, target chat).
 * Stale pending leases and failed rows can be reclaimed up to MAX_RELAY_ATTEMPTS.
 */
export async function reserveRelayRow(
  db: DbClient,
  input: {
    messageId: string
    targetPlatform: MessengerPlatform
    targetChatId: string
    fingerprint: string
  },
): Promise<{ relayId: string; shouldSend: boolean } | null> {
  const existing = await loadRelayRow(db, input)
  if (existing) {
    if (existing.status === 'sent' || existing.target_external_message_id) {
      log('info', 'Relay skipped — already sent', {
        messageId: input.messageId,
        targetPlatform: input.targetPlatform,
        relayId: existing.id,
        reason: 'already_sent',
      })
      return { relayId: existing.id, shouldSend: false }
    }

    if (existing.status === 'pending') {
      if (!isLeaseStale(existing.claimed_at)) {
        log('info', 'Relay skipped — delivery in progress', {
          messageId: input.messageId,
          targetPlatform: input.targetPlatform,
          relayId: existing.id,
          reason: 'fresh_lease',
        })
        return { relayId: existing.id, shouldSend: false }
      }
      return tryClaimExisting(db, existing, input, 'stale_reclaimed')
    }

    if (existing.status === 'failed') {
      return tryClaimExisting(db, existing, input, 'failed_reclaim')
    }
  }

  const insertPayload: Record<string, unknown> = {
    message_id: input.messageId,
    target_platform: input.targetPlatform,
    target_chat_id: input.targetChatId,
    source_fingerprint: input.fingerprint,
    ...claimFields(1),
  }

  let { data: inserted, error: insertError } = await db
    .from('message_relays')
    .insert(insertPayload)
    .select('id')
    .maybeSingle()

  if (
    insertError &&
    /source_fingerprint|claimed_at|attempt_count|42703/.test(
      `${insertError.code ?? ''} ${insertError.message}`,
    )
  ) {
    // Migration may not be applied yet — fall back to minimal insert.
    const minimal: Record<string, unknown> = {
      message_id: input.messageId,
      target_platform: input.targetPlatform,
      target_chat_id: input.targetChatId,
      status: 'pending',
    }
    if (!/source_fingerprint|42703/.test(`${insertError.code ?? ''} ${insertError.message}`)) {
      minimal.source_fingerprint = input.fingerprint
    }
    const fallback = await db.from('message_relays').insert(minimal).select('id').maybeSingle()
    inserted = fallback.data
    insertError = fallback.error
  }

  if (!insertError && inserted?.id) {
    return { relayId: inserted.id as string, shouldSend: true }
  }

  if (isUniqueViolation(insertError)) {
    const raced = await loadRelayRow(db, input)
    if (!raced) return null
    if (raced.status === 'sent' || raced.target_external_message_id) {
      log('info', 'Relay skipped — concurrent reservation', {
        messageId: input.messageId,
        targetPlatform: input.targetPlatform,
        relayId: raced.id,
        reason: 'already_sent',
      })
      return { relayId: raced.id, shouldSend: false }
    }
    if (raced.status === 'pending' && !isLeaseStale(raced.claimed_at)) {
      log('info', 'Relay skipped — concurrent reservation', {
        messageId: input.messageId,
        targetPlatform: input.targetPlatform,
        relayId: raced.id,
        reason: 'fresh_lease',
      })
      return { relayId: raced.id, shouldSend: false }
    }
    if (raced.status === 'pending' && isLeaseStale(raced.claimed_at)) {
      return tryClaimExisting(db, raced, input, 'stale_reclaimed')
    }
    if (raced.status === 'failed') {
      return tryClaimExisting(db, raced, input, 'failed_reclaim')
    }
    return { relayId: raced.id, shouldSend: false }
  }

  log('warn', 'Relay row insert failed', {
    message: insertError?.message,
    messageId: input.messageId,
    targetPlatform: input.targetPlatform,
    reason: 'insert_failed',
  })
  return null
}

/**
 * When a work group has both Telegram and Max bound, mirror the message to the other chat.
 * Skips loops via payload.apss_relay and by not relaying bot senders (caller responsibility).
 */
export async function relaySiblingChats(
  db: DbClient,
  config: MessengerConfig,
  input: RelaySiblingInput,
): Promise<void> {
  const { data: targets, error } = await db
    .from('messenger_connections')
    .select('platform, chat_id')
    .eq('work_group_id', input.workGroupId)
    .neq('platform', input.sourcePlatform)

  if (error) {
    log('warn', 'Relay lookup failed', {
      message: error.message,
      reason: 'unbound_lookup',
      workGroupId: input.workGroupId,
    })
    return
  }

  if (!targets?.length) {
    log('info', 'Relay skipped — no sibling platform', {
      workGroupId: input.workGroupId,
      reason: 'unbound',
    })
    return
  }

  const fingerprint = sourceFingerprint(
    input.sourcePlatform,
    input.sourceExternalMessageId,
  )
  const relayText = formatRelayText(input)
  let anySent = false

  for (const target of targets) {
    const targetPlatform = target.platform as MessengerPlatform
    const targetChatId = String(target.chat_id ?? '').trim()
    if (!targetChatId || targetChatId === '0') {
      log('warn', 'Relay skipped — target chat id empty', {
        workGroupId: input.workGroupId,
        targetPlatform,
        reason: 'empty_target_chat',
      })
      continue
    }

    const reserved = await reserveRelayRow(db, {
      messageId: input.messageId,
      targetPlatform,
      targetChatId,
      fingerprint,
    })
    if (!reserved?.shouldSend) continue

    const relayRowId = reserved.relayId

    try {
      const already = await findExistingMirrorDelivery(db, {
        messageId: input.messageId,
        fingerprint,
        targetPlatform,
        targetChatId,
      })
      if (already) {
        await markRelaySent(db, relayRowId, fingerprint, already)
        anySent = true
        log('info', 'Relay marked sent from existing mirror', {
          workGroupId: input.workGroupId,
          from: input.sourcePlatform,
          to: targetPlatform,
          externalMessageId: already.externalMessageId,
          reason: 'mirror_found',
        })
        continue
      }

      const delivered = await deliverToBoundChat(db, config, {
        platform: targetPlatform,
        chatId: targetChatId,
        workGroupId: input.workGroupId,
        text: relayText,
      })

      await markRelaySent(db, relayRowId, fingerprint, delivered)

      try {
        await ingestChannelMessage(db, {
          platform: targetPlatform,
          externalChatId: delivered.chatId,
          externalMessageId: delivered.externalMessageId,
          authorName: input.authorName?.trim() || null,
          authorExternalId: null,
          text:
            input.text.trim() ||
            contentPlaceholder(input.contentType) ||
            '[Сообщение]',
          contentType: input.contentType === 'text' ? 'text' : 'other',
          payload: {
            apss_relay: true,
            from_platform: input.sourcePlatform,
            from_message_id: input.messageId,
          },
          sentAt: new Date().toISOString(),
          isEdit: false,
          skipRelay: true,
        })
      } catch (mirrorError) {
        log('warn', 'Relay mirror ingest failed (message already delivered)', {
          workGroupId: input.workGroupId,
          from: input.sourcePlatform,
          to: targetPlatform,
          message:
            mirrorError instanceof Error ? mirrorError.message : String(mirrorError),
        })
      }

      anySent = true
      log('info', 'Relayed message to sibling chat', {
        workGroupId: input.workGroupId,
        from: input.sourcePlatform,
        to: targetPlatform,
        targetChatId: delivered.chatId,
        externalMessageId: delivered.externalMessageId,
      })
    } catch (relayError) {
      const message =
        relayError instanceof Error ? relayError.message : String(relayError)
      if (isAmbiguousSendError(relayError)) {
        // May already be delivered. Keep pending; stale lease + sweeper will reclaim.
        await db
          .from('message_relays')
          .update({ last_error: message.slice(0, 2000) })
          .eq('id', relayRowId)
        log('warn', 'Relay send outcome unknown — lease kept for reclaim', {
          workGroupId: input.workGroupId,
          from: input.sourcePlatform,
          to: targetPlatform,
          message,
          reason: 'ambiguous_send',
        })
        continue
      }

      await markRelayFailed(db, relayRowId, message)
      log('warn', 'Relay send failed', {
        workGroupId: input.workGroupId,
        from: input.sourcePlatform,
        to: targetPlatform,
        message,
        reason: 'send_failed',
      })
    }
  }

  if (anySent) {
    await db
      .from('messages')
      .update({ delivery_status: 'relayed' })
      .eq('id', input.messageId)
  }
}

/**
 * Retry messages that were stored but never marked relayed (failed relay, crash mid-flight, etc.).
 * Ignores very fresh rows so a parallel webhook cannot send a second copy of the same message.
 */
export async function retryUndeliveredRelaysForWorkGroup(
  db: DbClient,
  config: MessengerConfig,
  workGroupId: string,
): Promise<void> {
  const { data: connections, error: connectionError } = await db
    .from('messenger_connections')
    .select('platform')
    .eq('work_group_id', workGroupId)

  if (connectionError) {
    log('warn', 'Undelivered relay lookup failed', {
      workGroupId,
      message: connectionError.message,
    })
    return
  }

  const platforms = new Set((connections ?? []).map((row) => row.platform))
  if (platforms.size < 2) return

  const cutoff = new Date(Date.now() - BACKLOG_MIN_AGE_MS).toISOString()
  const { data: backlog, error: backlogError } = await db
    .from('messages')
    .select(
      'id, source, external_chat_id, external_message_id, text, content_type, author_name, payload',
    )
    .eq('work_group_id', workGroupId)
    .eq('delivery_status', 'stored')
    .lt('sent_at', cutoff)
    .order('sent_at', { ascending: true })
    .limit(15)

  if (backlogError) {
    log('warn', 'Undelivered relay backlog lookup failed', {
      workGroupId,
      message: backlogError.message,
    })
    return
  }

  for (const row of backlog ?? []) {
    const sourcePlatform = row.source as MessengerPlatform
    if (!platforms.has(sourcePlatform)) continue
    if (isRelayEchoPayload(row.payload)) continue

    const hasSibling = [...platforms].some((platform) => platform !== sourcePlatform)
    if (!hasSibling) continue

    try {
      await relaySiblingChats(db, config, {
        workGroupId,
        sourcePlatform,
        sourceChatId: String(row.external_chat_id ?? ''),
        sourceExternalMessageId: String(row.external_message_id ?? ''),
        messageId: row.id as string,
        text: String(row.text ?? ''),
        contentType: (row.content_type as MessageContentType) ?? 'text',
        authorName: row.author_name as string | null,
      })
    } catch (retryError) {
      log('warn', 'Undelivered relay retry failed', {
        workGroupId,
        messageId: row.id,
        message: retryError instanceof Error ? retryError.message : String(retryError),
      })
    }
  }
}

/** Re-drive messages that have a stale pending relay or stored-but-unrelayed status. */
export async function sweepUndeliveredRelays(
  db: DbClient,
  config: MessengerConfig,
): Promise<{ workGroups: number; stalePending: number }> {
  const staleCutoff = new Date(Date.now() - LEASE_STALE_MS).toISOString()
  const { data: staleRows, error: staleError } = await db
    .from('message_relays')
    .select('id, message_id')
    .eq('status', 'pending')
    .is('target_external_message_id', null)
    .or(`claimed_at.is.null,claimed_at.lt."${staleCutoff}"`)
    .limit(50)

  if (staleError) {
    log('warn', 'Stale pending relay sweep lookup failed', {
      message: staleError.message,
    })
  }

  const stalePending = staleRows?.length ?? 0
  const messageIds = new Set<string>()
  for (const row of staleRows ?? []) {
    if (row.message_id) messageIds.add(String(row.message_id))
  }

  const storedCutoff = new Date(Date.now() - BACKLOG_MIN_AGE_MS).toISOString()
  const { data: storedRows, error: storedError } = await db
    .from('messages')
    .select('id, work_group_id')
    .eq('delivery_status', 'stored')
    .lt('sent_at', storedCutoff)
    .order('sent_at', { ascending: true })
    .limit(40)

  if (storedError) {
    log('warn', 'Stored undelivered sweep lookup failed', {
      message: storedError.message,
    })
  }

  const workGroupIds = new Set<string>()
  for (const row of storedRows ?? []) {
    if (row.work_group_id) workGroupIds.add(String(row.work_group_id))
    if (row.id) messageIds.add(String(row.id))
  }

  if (messageIds.size > 0) {
    const { data: linked } = await db
      .from('messages')
      .select('work_group_id')
      .in('id', [...messageIds])
    for (const row of linked ?? []) {
      if (row.work_group_id) workGroupIds.add(String(row.work_group_id))
    }
  }

  for (const workGroupId of workGroupIds) {
    try {
      await retryUndeliveredRelaysForWorkGroup(db, config, workGroupId)
    } catch (error) {
      log('warn', 'Relay sweeper work group failed', {
        workGroupId,
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }

  if (stalePending > 0 || workGroupIds.size > 0) {
    log('info', 'Relay sweeper pass', {
      stalePending,
      workGroups: workGroupIds.size,
    })
  }

  return { workGroups: workGroupIds.size, stalePending }
}

export type RelayHealthStats = {
  stalePending: number
  storedUnrelayed: number
  queuePending: number
  queueActive: number
}

export async function getRelayHealthStats(db: DbClient): Promise<RelayHealthStats> {
  const staleCutoff = new Date(Date.now() - LEASE_STALE_MS).toISOString()
  const storedCutoff = new Date(Date.now() - 15 * 60_000).toISOString()
  const queue = getRelayQueue()

  const { count: stalePending } = await db
    .from('message_relays')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending')
    .is('target_external_message_id', null)
    .or(`claimed_at.is.null,claimed_at.lt."${staleCutoff}"`)

  const { count: storedUnrelayed } = await db
    .from('messages')
    .select('id', { count: 'exact', head: true })
    .eq('delivery_status', 'stored')
    .lt('sent_at', storedCutoff)

  return {
    stalePending: stalePending ?? 0,
    storedUnrelayed: storedUnrelayed ?? 0,
    queuePending: queue.pending(),
    queueActive: queue.active(),
  }
}

export function startRelaySweeper(
  db: DbClient,
  config: MessengerConfig,
  intervalMs: number = SWEEPER_INTERVAL_MS,
): NodeJS.Timeout {
  const tick = () => {
    enqueueRelayWork(async () => {
      await sweepUndeliveredRelays(db, config)
    })
  }
  // First pass shortly after boot so crash leftovers recover without waiting for traffic.
  setTimeout(tick, 5_000)
  return setInterval(tick, intervalMs)
}
