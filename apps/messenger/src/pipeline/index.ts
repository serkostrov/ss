/**
 * Ingest → dedupe → persist → relay pipeline — scaffold.
 *
 * Future wiring (per work group):
 * 1. Resolve `messenger_connections` by (work_group_id, platform)
 * 2. Persist into `messages` keyed by work_group_id
 * 3. Enqueue `message_relays` to the peer platform
 *
 * Admin UI already lists `messenger_connections` on the work group card.
 */
export {}
